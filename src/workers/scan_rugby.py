"""Rugby scan worker — pre-computes rugby scans on schedule.

Contient run_rugby_scan() et ses helpers (model loader).
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

logger = logging.getLogger("scan_worker.rugby")


def _load_rugby_model():
    """Load rugby ML model + team stats snapshot. Returns (model, snapshot) or (None, None)."""
    try:
        from src.ml.rugby_model import RugbyModel
        from pathlib import Path
        model_dir = Path("models/rugby")
        if not (model_dir / "model.joblib").exists():
            return None, None
        model = RugbyModel.load(model_dir)
        import json
        with open(model_dir / "team_stats.json") as f:
            snapshot = json.load(f)
        return model, snapshot
    except Exception as e:
        logger.warning("Rugby model not available: %s", e)
        return None, None


async def run_rugby_scan():
    """Run rugby scan — Odds API for odds (all bookmakers) + API-Sports Rugby for stats."""
    from src.data.rugby_client import RugbyClient
    from src.services.probability_calculator import calculate_rugby
    from src.api.schemas import AIScanMatch

    t0 = time.time()

    # Budget check: 2 markets (h2h,totals) x 5 regions x 3 sport keys = 30 credits
    if not _odds_api_budget_check("rugby", cost=30):
        _track_scan_result("rugby", 0, error="budget_exhausted")
        return

    rugby_odds_client = RugbyClient()

    rugby_ml_model, rugby_snapshot = _load_rugby_model()
    if rugby_ml_model:
        from src.features.rugby_features import RUGBY_FEATURE_COLUMNS, build_rugby_live_features as _rugby_feats
        _rugby_medians = np.array(rugby_snapshot.get("col_medians", [np.nan] * len(RUGBY_FEATURE_COLUMNS)))
        logger.info("Rugby ML model loaded (%d feature columns)", len(RUGBY_FEATURE_COLUMNS))
    else:
        logger.info("Rugby ML model not available — using rule-based only")

    # 1. Fetch odds from Odds API (all bookmakers, profondeur max)
    loop = asyncio.get_event_loop()
    try:
        odds_matches = await loop.run_in_executor(None, lambda: rugby_odds_client.get_matches(timeframe="48h"))
    except Exception as exc:
        logger.error("Rugby odds fetch failed: %s", exc)
        _track_scan_result("rugby", 0, error=str(exc))
        return

    if not odds_matches:
        logger.info("Rugby scan: no upcoming matches with odds")
        cache_set("scan:rugby:all", {"_cached_at": time.time(), "duration": 0, "matches": []}, ttl=SCAN_CACHE_TTL + 300)
        _track_scan_result("rugby", 0)
        return

    logger.info("Rugby scan: %d matches with odds from Odds API", len(odds_matches))

    # 2. Fetch stats from API-Sports Rugby (quota now freed since NBA/MLB moved away)
    rugby_api = None
    standings_by_id: dict[int, dict] = {}
    try:
        from src.data.api_rugby_client import ApiRugbyClient
        rugby_api = ApiRugbyClient()
        for league_info in rugby_api.get_tracked_leagues():
            league_standings = await rugby_api.get_standings(league_info["id"])
            for s in league_standings:
                if s.get("team_id"):
                    standings_by_id[s["team_id"]] = s
    except Exception as exc:
        logger.warning("API-Sports Rugby stats failed (non-blocking): %s", exc)

    matches: list[AIScanMatch] = []
    teams_data = rugby_snapshot.get("teams", {}) if rugby_snapshot else {}

    for om in odds_matches:
        try:
            home = om["home_team"]
            away = om["away_team"]
            league = om.get("league", "Rugby Union")
            odds_dict = om.get("odds", {})

            # Extract best odds from multi-bookmaker dict
            h2h = odds_dict.get("h2h", {})
            home_bk = h2h.get("Home", {})
            draw_bk = h2h.get("Draw", {})
            away_bk = h2h.get("Away", {})
            odds_home = max(home_bk.values(), default=0) if isinstance(home_bk, dict) else float(home_bk or 0)
            odds_draw_val = max(draw_bk.values(), default=0) if isinstance(draw_bk, dict) else float(draw_bk or 0)
            odds_away = max(away_bk.values(), default=0) if isinstance(away_bk, dict) else float(away_bk or 0)
            odds_draw = odds_draw_val if odds_draw_val > 1.0 else None

            totals = odds_dict.get("totals", {})
            over_bk = totals.get("over", {})
            under_bk = totals.get("under", {})
            odds_over = max(over_bk.values(), default=0) if isinstance(over_bk, dict) else float(over_bk or 0)
            odds_under = max(under_bk.values(), default=0) if isinstance(under_bk, dict) else float(under_bk or 0)
            total_line = totals.get("line")
            odds_over = odds_over or None
            odds_under = odds_under or None

            if not odds_home or not odds_away or odds_home <= 1.0 or odds_away <= 1.0:
                continue

            # Fetch live stats from API-Sports (if available)
            h_live: dict = {}
            a_live: dict = {}
            h_standing: dict = {}
            a_standing: dict = {}
            if rugby_api:
                try:
                    # Try to find team IDs in standings
                    home_id = None
                    away_id = None
                    for tid, s in standings_by_id.items():
                        if s.get("team_name", "").lower() == home.lower():
                            home_id = tid
                            h_standing = s
                        elif s.get("team_name", "").lower() == away.lower():
                            away_id = tid
                            a_standing = s
                    if home_id:
                        h_last = await rugby_api.get_last_games(home_id)
                        h_team_stats = await rugby_api.get_team_stats(home_id, h_standing.get("league_id"))
                        h_live = rugby_api.compute_live_stats(h_last, h_standing, h_team_stats)
                    if away_id:
                        a_last = await rugby_api.get_last_games(away_id)
                        a_team_stats = await rugby_api.get_team_stats(away_id, a_standing.get("league_id"))
                        a_live = rugby_api.compute_live_stats(a_last, a_standing, a_team_stats)
                except Exception:
                    pass

            h_snap = teams_data.get(home, {})
            a_snap = teams_data.get(away, {})

            def _pick(live: dict, snap: dict, key: str):
                return live.get(key) if live.get(key) is not None else snap.get(key)

            calc = calculate_rugby(
                odds_home=odds_home,
                odds_draw=odds_draw,
                odds_away=odds_away,
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
                home_win_rate=_pick(h_live, h_snap, "win_rate_10"),
                away_win_rate=_pick(a_live, a_snap, "win_rate_10"),
                home_pt_diff=_pick(h_live, h_snap, "pt_diff_10"),
                away_pt_diff=_pick(a_live, a_snap, "pt_diff_10"),
            )

            _rugby_ml_used = False
            if rugby_ml_model and rugby_snapshot:
                try:
                    feat_dict = _rugby_feats(
                        home_team=home,
                        away_team=away,
                        odds_home=odds_home,
                        odds_draw=float(odds_draw) if odds_draw else None,
                        odds_away=odds_away,
                        odds_over=odds_over,
                        odds_under=odds_under,
                        total_line=total_line,
                        team_snapshot=rugby_snapshot,
                        rest_days_home=h_live.get("rest_days"),
                        rest_days_away=a_live.get("rest_days"),
                    )
                    feat_array = np.array([[feat_dict.get(col, np.nan) for col in RUGBY_FEATURE_COLUMNS]])
                    for col_idx in range(feat_array.shape[1]):
                        if np.isnan(feat_array[0, col_idx]):
                            feat_array[0, col_idx] = _rugby_medians[col_idx] if not np.isnan(_rugby_medians[col_idx]) else 0.0
                    ml_prob_home = float(rugby_ml_model.predict_proba(feat_array)[0])
                    _draw_base = 0.06
                    ml_prob_not_home = 1.0 - ml_prob_home
                    ml_prob_draw = _draw_base * ml_prob_not_home
                    ml_prob_away = ml_prob_not_home - ml_prob_draw
                    rule_h = calc.home_prob or 0.47
                    rule_d = calc.draw_prob or _draw_base
                    rule_a = calc.away_prob or 0.47
                    blend_h = round(0.65 * ml_prob_home + 0.35 * rule_h, 4)
                    blend_d = round(0.65 * ml_prob_draw + 0.35 * rule_d, 4)
                    blend_a = round(1.0 - blend_h - blend_d, 4)
                    blend_a = max(0.05, blend_a)
                    edges_blended: dict = {}
                    if odds_home > 1.0:
                        edges_blended["H"] = round(blend_h - 1.0 / odds_home, 4)
                    if odds_draw and float(odds_draw) > 1.0:
                        edges_blended["D"] = round(blend_d - 1.0 / float(odds_draw), 4)
                    if odds_away > 1.0:
                        edges_blended["A"] = round(blend_a - 1.0 / odds_away, 4)
                    edges_blended = {k: v for k, v in edges_blended.items() if v > 0}
                    from dataclasses import replace as _replace
                    calc = _replace(calc, home_prob=blend_h, draw_prob=blend_d, away_prob=blend_a, edges=edges_blended)
                    _rugby_ml_used = True
                except Exception as ml_exc:
                    logger.debug("Rugby ML prediction failed: %s", ml_exc)

            matches.append(AIScanMatch(
                sport="rugby",
                home_team=home,
                away_team=away,
                player1=None,
                player2=None,
                league=league,
                date=om.get("date", ""),
                odds=odds_dict,
                model_prob_home=calc.home_prob,
                model_prob_draw=calc.draw_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges,
                data_quality=calc.data_quality,
                data_score=calc.data_score,
                rugby_ml_used=_rugby_ml_used,
                home_win_rate_10=_pick(h_live, h_snap, "win_rate_10"),
                away_win_rate_10=_pick(a_live, a_snap, "win_rate_10"),
                home_pt_diff_10=_pick(h_live, h_snap, "pt_diff_10"),
                away_pt_diff_10=_pick(a_live, a_snap, "pt_diff_10"),
                home_pts_avg_10=_pick(h_live, h_snap, "pts_avg_10"),
                away_pts_avg_10=_pick(a_live, a_snap, "pts_avg_10"),
                home_pts_allowed_10=_pick(h_live, h_snap, "pts_allowed_10"),
                away_pts_allowed_10=_pick(a_live, a_snap, "pts_allowed_10"),
                home_tries_avg_10=_pick(h_live, h_snap, "tries_avg_10"),
                away_tries_avg_10=_pick(a_live, a_snap, "tries_avg_10"),
                home_penalties_avg_10=_pick(h_live, h_snap, "penalties_avg_10"),
                away_penalties_avg_10=_pick(a_live, a_snap, "penalties_avg_10"),
                home_yellow_cards_avg=_pick(h_live, h_snap, "season_yellow_cards_avg"),
                away_yellow_cards_avg=_pick(a_live, a_snap, "season_yellow_cards_avg"),
                home_red_cards_avg=_pick(h_live, h_snap, "season_red_cards_avg"),
                away_red_cards_avg=_pick(a_live, a_snap, "season_red_cards_avg"),
                home_conversions_avg=_pick(h_live, h_snap, "season_conversions_avg"),
                away_conversions_avg=_pick(a_live, a_snap, "season_conversions_avg"),
                home_streak=h_live.get("streak") or h_snap.get("streak"),
                away_streak=a_live.get("streak") or a_snap.get("streak"),
                home_rest_days=h_live.get("rest_days"),
                away_rest_days=a_live.get("rest_days"),
                form_home=h_live.get("form"),
                form_away=a_live.get("form"),
                position_home=h_live.get("league_rank"),
                position_away=a_live.get("league_rank"),
                home_last_5=h_live.get("last_5_results", []),
                away_last_5=a_live.get("last_5_results", []),
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
            ))
        except Exception as exc:
            logger.debug("Rugby fixture processing error: %s", exc)
            continue

    duration = time.time() - t0

    _save_odds_snapshots(matches, "rugby")

    cache_payload = {
        "_cached_at": time.time(),
        "duration": duration,
        "matches": [m.model_dump() for m in matches],
    }
    cache_set("scan:rugby:all", cache_payload, ttl=SCAN_CACHE_TTL + 300)
    cache_set("scan:meta:last_rugby", time.time(), ttl=86400)
    _track_scan_result("rugby", len(matches))
    _sync_odds_api_usage(rugby_odds_client)
    logger.info("Rugby scan completed: %d matches in %.1fs", len(matches), duration)
