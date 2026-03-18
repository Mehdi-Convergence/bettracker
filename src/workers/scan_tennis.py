"""Tennis scan worker — pre-computes tennis scans on schedule.

Contient run_tennis_scan() et ses helpers (model loader, H2H DB lookup).
"""

import asyncio
import logging
import time

import numpy as np

from src.cache import cache_set
from src.workers.scan_common import (
    SCAN_CACHE_TTL,
    _odds_api_budget_check,
    _save_odds_snapshots,
    _sync_odds_api_usage,
    _track_scan_result,
)

logger = logging.getLogger("scan_worker.tennis")


def _load_tennis_model():
    """Load tennis ML model + player stats snapshot. Returns (model, snapshot) or (None, None)."""
    import json
    from pathlib import Path
    from src.ml.tennis_model import TennisModel
    model_dir = Path("models/tennis")
    if not (model_dir / "model.joblib").exists():
        return None, None
    try:
        model = TennisModel()
        model.load(model_dir)
        with open(model_dir / "player_stats.json") as f:
            snapshot = json.load(f)
        return model, snapshot
    except Exception as exc:
        logger.warning("Tennis model load failed: %s", exc)
        return None, None


def _compute_tennis_h2h_from_db(p1_name: str, p2_name: str) -> dict:
    """Query tennis_matches to compute H2H stats between two players.

    Normalizes player names to handle slight spelling differences between
    SofaScore and tennis-data.co.uk.  Returns a dict with:
      h2h_total, h2h_p1_wins, h2h_p2_wins, h2h_p1_win_rate,
      h2h_summary (string e.g. "8 matchs : Djokovic N. 5V - 3D Murray A.")
    Returns an empty dict on any error.
    """
    try:
        from src.database import SessionLocal
        from src.models.tennis_match import TennisMatch
        from src.features.tennis_features import _normalize_player_name
        from sqlalchemy import or_, and_

        p1_norm = _normalize_player_name(p1_name) if p1_name else p1_name
        p2_norm = _normalize_player_name(p2_name) if p2_name else p2_name

        if not p1_norm or not p2_norm:
            return {}

        db = SessionLocal()
        try:
            # Find all matches where either player is winner/loser against the other
            # Try normalized names first, then raw names as fallback
            def _fetch(n1: str, n2: str):
                return db.query(TennisMatch).filter(
                    or_(
                        and_(TennisMatch.winner == n1, TennisMatch.loser == n2),
                        and_(TennisMatch.winner == n2, TennisMatch.loser == n1),
                    )
                ).all()

            h2h_matches = _fetch(p1_norm, p2_norm)
            # Fallback: try raw names if normalized gives nothing
            if not h2h_matches and (p1_norm != p1_name or p2_norm != p2_name):
                h2h_matches = _fetch(p1_name, p2_name)
            # Fallback: try partial surname matching if still nothing
            if not h2h_matches:
                p1_surname = p1_norm.split()[0] if p1_norm else ""
                p2_surname = p2_norm.split()[0] if p2_norm else ""
                if p1_surname and p2_surname:
                    candidates = db.query(TennisMatch).filter(
                        or_(
                            TennisMatch.winner.like(f"{p1_surname}%"),
                            TennisMatch.loser.like(f"{p1_surname}%"),
                        )
                    ).filter(
                        or_(
                            TennisMatch.winner.like(f"{p2_surname}%"),
                            TennisMatch.loser.like(f"{p2_surname}%"),
                        )
                    ).all()
                    h2h_matches = [
                        row for row in candidates
                        if (row.winner.startswith(p1_surname) or row.loser.startswith(p1_surname))
                        and (row.winner.startswith(p2_surname) or row.loser.startswith(p2_surname))
                    ]
        finally:
            db.close()

        if not h2h_matches:
            return {}

        # Determine which player is p1 in the DB (pick the name found most often)
        p1_name_in_db = p1_norm if any(
            r.winner == p1_norm or r.loser == p1_norm for r in h2h_matches
        ) else (p1_name if any(
            r.winner == p1_name or r.loser == p1_name for r in h2h_matches
        ) else p1_norm)

        p1_wins = sum(1 for r in h2h_matches if r.winner == p1_name_in_db)
        total = len(h2h_matches)
        p2_wins = total - p1_wins
        win_rate = round(p1_wins / total, 3) if total > 0 else 0.5

        # Build display names (short form for summary string)
        p1_display = p1_norm or p1_name or "P1"
        p2_display = p2_norm or p2_name or "P2"
        summary = f"{total} match{'s' if total > 1 else ''} : {p1_display} {p1_wins}V - {p2_wins}D {p2_display}"

        return {
            "h2h_total": total,
            "h2h_p1_wins": p1_wins,
            "h2h_p2_wins": p2_wins,
            "h2h_p1_win_rate": win_rate,
            "h2h_summary": summary,
        }
    except Exception as exc:
        logger.debug("Tennis H2H DB lookup failed: %s", exc)
        return {}


async def run_tennis_scan():
    """Run a full tennis scan and store results in cache."""
    from src.services.probability_calculator import calculate_tennis
    from src.api.schemas import AIScanMatch

    t0 = time.time()

    # Budget check: tennis uses 1 (discovery) + N (tournament) Odds API calls
    # Credit cost: 1 market (h2h) x 5 regions = 5 credits per sport key
    # Average ~5 active tournament keys = 25 credits per tennis scan
    if not _odds_api_budget_check("tennis", cost=25):
        _track_scan_result("tennis", 0, error="budget_exhausted")
        return

    # Load ML model (optional — fallback to rule-based if unavailable)
    tennis_ml_model, tennis_snapshot = _load_tennis_model()
    if tennis_ml_model:
        from src.features.tennis_features import TENNIS_FEATURE_COLUMNS, build_tennis_live_features as _tennis_live_feats
        _col_medians = np.array(tennis_snapshot.get("col_medians", [np.nan] * len(TENNIS_FEATURE_COLUMNS)))
        logger.info("Tennis ML model loaded (%d feature columns)", len(TENNIS_FEATURE_COLUMNS))
    else:
        logger.info("Tennis ML model not available — using rule-based only")

    # Fetch matches from Odds API + enrich via Sackmann CSV (replaces SofaScore)
    from src.data.tennis_client import TennisClient
    tennis_client = TennisClient()
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, lambda: tennis_client.get_matches(timeframe="48h", force=True)
        )
        raw_matches = result.get("matches", [])
    except Exception as exc:
        logger.error("Tennis scan failed: %s", exc)
        return
    matches = []

    for m in raw_matches:
        try:
            odds = m.get("odds", {})
            odds_winner = odds.get("winner", {}) if isinstance(odds, dict) else {}

            def _best_odds(val) -> float:
                if isinstance(val, dict):
                    return max((float(v) for v in val.values() if v), default=0.0)
                return float(val or 0)

            odds_p1 = _best_odds(odds_winner.get("P1", 0))
            odds_p2 = _best_odds(odds_winner.get("P2", 0))
            abs_p1 = [m["p1_injuries"]] if m.get("p1_injuries") and m["p1_injuries"] != "RAS" else []
            abs_p2 = [m["p2_injuries"]] if m.get("p2_injuries") and m["p2_injuries"] != "RAS" else []

            # Rule-based probability (always computed as baseline)
            calc = calculate_tennis(
                odds_p1=odds_p1, odds_p2=odds_p2,
                form_p1=m.get("p1_form"), form_p2=m.get("p2_form"),
                ranking_p1=m.get("p1_ranking"), ranking_p2=m.get("p2_ranking"),
                h2h_summary=m.get("h2h"),
                absences_p1=abs_p1, absences_p2=abs_p2,
                surface_record_p1=m.get("p1_surface_record"),
                surface_record_p2=m.get("p2_surface_record"),
                serve_pct_p1=m.get("p1_serve_pct"), serve_pct_p2=m.get("p2_serve_pct"),
                return_pct_p1=m.get("p1_return_pct"), return_pct_p2=m.get("p2_return_pct"),
                season_record_p1=m.get("p1_season_record"), season_record_p2=m.get("p2_season_record"),
                aces_avg_p1=m.get("p1_aces_avg"), aces_avg_p2=m.get("p2_aces_avg"),
                rest_days_p1=m.get("p1_rest_days"), rest_days_p2=m.get("p2_rest_days"),
                h2h_surface=m.get("h2h_surface"),
                h2h_last3=m.get("h2h_last3", []) or [],
            )

            # ML model prediction (blend with rule-based if available)
            _p1_serve_stats: dict | None = None
            _p2_serve_stats: dict | None = None
            _tennis_ml_used = False
            if tennis_ml_model and tennis_snapshot:
                try:
                    feat_dict = _tennis_live_feats(
                        p1=m.get("player1", ""),
                        p2=m.get("player2", ""),
                        surface=m.get("surface", "Hard"),
                        odds_p1=odds_p1 or 2.0,
                        odds_p2=odds_p2 or 2.0,
                        ranking_p1=m.get("p1_ranking"),
                        ranking_p2=m.get("p2_ranking"),
                        rest_days_p1=m.get("p1_rest_days"),
                        rest_days_p2=m.get("p2_rest_days"),
                        series=m.get("series") or m.get("tournament"),
                        player_snapshot=tennis_snapshot,
                        h2h=m.get("h2h"),
                        h2h_surface=m.get("h2h_surface"),
                    )
                    feat_array = np.array([[feat_dict.get(col, np.nan) for col in TENNIS_FEATURE_COLUMNS]])
                    # NaN fill with training medians
                    for col_idx in range(feat_array.shape[1]):
                        if np.isnan(feat_array[0, col_idx]):
                            feat_array[0, col_idx] = _col_medians[col_idx] if not np.isnan(_col_medians[col_idx]) else 0.0
                    ml_prob_p1 = float(tennis_ml_model.predict_proba(feat_array)[0])
                    ml_prob_p2 = 1.0 - ml_prob_p1
                    # Blend: 65% ML + 35% rule-based
                    rule_p1 = calc.home_prob or 0.5
                    rule_p2 = calc.away_prob or 0.5
                    blend_p1 = round(0.65 * ml_prob_p1 + 0.35 * rule_p1, 4)
                    blend_p2 = round(0.65 * ml_prob_p2 + 0.35 * rule_p2, 4)
                    # Recompute edges with blended probabilities
                    edges_blended = {}
                    if odds_p1 > 1.0:
                        implied_p1 = 1.0 / odds_p1
                        edges_blended["P1"] = round(blend_p1 - implied_p1, 4)
                    if odds_p2 > 1.0:
                        implied_p2 = 1.0 / odds_p2
                        edges_blended["P2"] = round(blend_p2 - implied_p2, 4)
                    # Override calc results with blended values
                    from dataclasses import replace as _replace
                    calc = _replace(calc, home_prob=blend_p1, away_prob=blend_p2, edges=edges_blended)
                    _tennis_ml_used = True
                    # Extract historical serve stats from feature dict for display
                    _serve_keys = ["ace_rate", "df_rate", "1st_serve_in", "1st_serve_won", "2nd_serve_won", "bp_save"]
                    ss1 = {k: round(float(v), 4) for k in _serve_keys if (v := feat_dict.get(f"p1_{k}")) is not None and not np.isnan(v)}
                    ss2 = {k: round(float(v), 4) for k in _serve_keys if (v := feat_dict.get(f"p2_{k}")) is not None and not np.isnan(v)}
                    if ss1:
                        _p1_serve_stats = ss1
                    if ss2:
                        _p2_serve_stats = ss2
                except Exception as ml_exc:
                    logger.debug("Tennis ML prediction failed: %s", ml_exc)

            # H2H live depuis la DB (non-blocking — erreur silencieuse)
            _db_h2h = _compute_tennis_h2h_from_db(
                m.get("player1", ""),
                m.get("player2", ""),
            )
            # Priorite aux donnees DB sur le texte SofaScore
            _h2h_summary = _db_h2h.get("h2h_summary") or m.get("h2h")

            matches.append(AIScanMatch(
                sport="tennis",
                player1=m.get("player1"), player2=m.get("player2"),
                league=m.get("tournament", ""), date=m.get("date", ""),
                venue=m.get("venue"), odds=odds,
                form_home=m.get("p1_form"), form_away=m.get("p2_form"),
                form_home_detail=m.get("p1_form_detail", []) or [],
                form_away_detail=m.get("p2_form_detail", []) or [],
                key_absences_home=abs_p1, key_absences_away=abs_p2,
                h2h_summary=_h2h_summary, context=m.get("context"),
                motivation=m.get("motivation"), weather=m.get("weather"),
                surface=m.get("surface"), round=m.get("round"),
                ranking_p1=m.get("p1_ranking"), ranking_p2=m.get("p2_ranking"),
                p1_age=m.get("p1_age"), p2_age=m.get("p2_age"),
                p1_season_record=m.get("p1_season_record"), p2_season_record=m.get("p2_season_record"),
                p1_surface_record=m.get("p1_surface_record"), p2_surface_record=m.get("p2_surface_record"),
                p1_serve_pct=m.get("p1_serve_pct"), p2_serve_pct=m.get("p2_serve_pct"),
                p1_return_pct=m.get("p1_return_pct"), p2_return_pct=m.get("p2_return_pct"),
                p1_aces_avg=m.get("p1_aces_avg"), p2_aces_avg=m.get("p2_aces_avg"),
                p1_rest_days=m.get("p1_rest_days"), p2_rest_days=m.get("p2_rest_days"),
                h2h_surface=m.get("h2h_surface"), h2h_last3=m.get("h2h_last3", []) or [],
                home_rest_days=m.get("p1_rest_days"), away_rest_days=m.get("p2_rest_days"),
                home_bp_saved_pct=m.get("p1_bp_saved_pct"), away_bp_saved_pct=m.get("p2_bp_saved_pct"),
                home_tb_win_pct=m.get("p1_tb_win_pct"), away_tb_win_pct=m.get("p2_tb_win_pct"),
                model_prob_home=calc.home_prob, model_prob_away=calc.away_prob,
                edges=calc.edges, data_quality=calc.data_quality, data_score=calc.data_score,
                p1_serve_stats=_p1_serve_stats, p2_serve_stats=_p2_serve_stats,
                tennis_ml_used=_tennis_ml_used,
                h2h_total=_db_h2h.get("h2h_total"),
                h2h_p1_wins=_db_h2h.get("h2h_p1_wins"),
                h2h_p2_wins=_db_h2h.get("h2h_p2_wins"),
                h2h_p1_win_rate=_db_h2h.get("h2h_p1_win_rate"),
            ))
        except Exception:
            continue

    duration = time.time() - t0

    # Persist odds snapshots (non-blocking)
    _save_odds_snapshots(matches, "tennis")

    cache_payload = {
        "_cached_at": time.time(),
        "duration": duration,
        "matches": [m.model_dump() for m in matches],
    }

    cache_set("scan:tennis:all", cache_payload, ttl=SCAN_CACHE_TTL + 300)
    cache_set("scan:meta:last_tennis", time.time(), ttl=86400)

    _track_scan_result("tennis", len(matches))
    _sync_odds_api_usage(tennis_client)
    logger.info("Tennis scan completed: %d matches in %.1fs", len(matches), duration)
