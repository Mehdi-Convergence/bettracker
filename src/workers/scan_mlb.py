"""MLB scan worker — pre-computes MLB scans on schedule.

Contient run_mlb_scan() et ses helpers (model loader).
"""

import asyncio
import json
import logging
import time
from pathlib import Path

import numpy as np

from src.cache import cache_set
from src.workers.scan_common import (
    SCAN_CACHE_TTL,
    _odds_api_budget_check,
    _save_odds_snapshots,
    _sync_odds_api_usage,
    _track_scan_result,
)

logger = logging.getLogger("scan_worker.mlb")

_MLB_FILE_CACHE_DIR = Path("data/cache/mlb")


def _load_mlb_model():
    """Load MLB ML model + team stats snapshot. Returns (model, snapshot) or (None, None)."""
    try:
        from src.ml.mlb_model import MLBModel
        model_dir = Path("models/mlb")
        if not (model_dir / "model.joblib").exists():
            return None, None
        model = MLBModel.load(model_dir)
        import json as _json_mlb
        with open(model_dir / "team_stats.json") as f:
            snapshot = _json_mlb.load(f)
        return model, snapshot
    except Exception as e:
        logger.warning("MLB model not available: %s", e)
        return None, None


async def run_mlb_scan():
    """Run MLB scan — Odds API for odds (all bookmakers) + statsapi for fixtures/stats."""
    from src.data.mlb_client import MLBClient
    from src.services.probability_calculator import calculate_mlb
    from src.api.schemas import AIScanMatch
    from src.config import settings as _settings

    t0 = time.time()

    # Budget check: 3 markets (h2h,totals,spreads) x 5 regions = 15 credits
    if not _odds_api_budget_check("mlb", cost=15):
        _track_scan_result("mlb", 0, error="budget_exhausted")
        return

    mlb_client = MLBClient()

    mlb_ml_model, mlb_snapshot = _load_mlb_model()
    if mlb_ml_model:
        from src.features.mlb_features import MLB_FEATURE_COLUMNS, build_mlb_live_features as _mlb_feats
        _mlb_medians = np.array(mlb_snapshot.get("col_medians", [np.nan] * len(MLB_FEATURE_COLUMNS)))
        logger.info("MLB ML model loaded (%d feature columns)", len(MLB_FEATURE_COLUMNS))
    else:
        logger.info("MLB ML model not available — using rule-based only")

    # 1. Fetch odds from Odds API (all bookmakers, profondeur max)
    loop = asyncio.get_event_loop()
    try:
        odds_matches = await loop.run_in_executor(None, lambda: mlb_client.get_matches(timeframe="48h"))
    except Exception as exc:
        logger.error("MLB odds fetch failed: %s", exc)
        _track_scan_result("mlb", 0, error=str(exc))
        return

    if not odds_matches:
        logger.info("MLB scan: no upcoming games with odds")
        cache_set("scan:mlb:all", {"_cached_at": time.time(), "duration": 0, "matches": []}, ttl=SCAN_CACHE_TTL + 300)
        _track_scan_result("mlb", 0)
        return

    logger.info("MLB scan: %d games with odds from Odds API", len(odds_matches))

    # 2. Fetch statsapi fixtures + standings for enrichment (free, no quota)
    statsapi_standings: dict[str, dict] = {}
    if _settings.USE_STATSAPI_MLB:
        try:
            standings_list = await loop.run_in_executor(None, mlb_client.get_standings_statsapi)
            for s in standings_list:
                statsapi_standings[s.get("team_name", "")] = s
            logger.info("statsapi enrichment: %d standings", len(standings_list))
        except Exception as exc:
            logger.warning("statsapi enrichment failed (non-blocking): %s", exc)

    # Fallback to API-Sports if statsapi not enabled
    bb = None
    standings_by_name: dict[str, dict] = {}
    standings_by_id: dict[int, dict] = {}
    if not _settings.USE_STATSAPI_MLB or not statsapi_standings:
        try:
            from src.data.api_baseball_client import ApiBaseballClient
            bb = ApiBaseballClient()
            standings = await bb.get_standings()
            for s in standings:
                standings_by_name[s["team_name"]] = s
                if s.get("team_id"):
                    standings_by_id[s["team_id"]] = s
        except Exception:
            logger.warning("API-Sports Baseball fallback failed")

    matches: list[AIScanMatch] = []
    teams_data = mlb_snapshot.get("teams", {}) if mlb_snapshot else {}

    for om in odds_matches:
        try:
            home = om["home_team"]
            away = om["away_team"]
            odds = om.get("odds", {})

            # Extract best odds from multi-bookmaker dict
            h2h = odds.get("h2h", {})
            home_bk = h2h.get("Home", {})
            away_bk = h2h.get("Away", {})
            odds_home = max(home_bk.values(), default=0) if isinstance(home_bk, dict) else float(home_bk or 0)
            odds_away = max(away_bk.values(), default=0) if isinstance(away_bk, dict) else float(away_bk or 0)

            totals = odds.get("totals", {})
            over_bk = totals.get("over", {})
            under_bk = totals.get("under", {})
            odds_over = max(over_bk.values(), default=0) if isinstance(over_bk, dict) else float(over_bk or 0)
            odds_under = max(under_bk.values(), default=0) if isinstance(under_bk, dict) else float(under_bk or 0)
            total_line = totals.get("line")
            odds_over = odds_over or None
            odds_under = odds_under or None

            if not odds_home or not odds_away or odds_home <= 1.0 or odds_away <= 1.0:
                continue

            # Enrichment: statsapi or API-Sports fallback
            h_standing = statsapi_standings.get(home) or standings_by_name.get(home, {})
            a_standing = statsapi_standings.get(away) or standings_by_name.get(away, {})

            h_snap = teams_data.get(home, {})
            a_snap = teams_data.get(away, {})

            h_live: dict = {}
            a_live: dict = {}
            if bb:
                try:
                    home_id = standings_by_name.get(home, {}).get("team_id")
                    away_id = standings_by_name.get(away, {}).get("team_id")
                    if home_id:
                        h_last = await bb.get_last_games(home_id, team_name=home)
                        h_team_stats = await bb.get_team_stats(home_id)
                        h_live = bb.compute_live_stats(h_last, h_standing, h_team_stats)
                    if away_id:
                        a_last = await bb.get_last_games(away_id, team_name=away)
                        a_team_stats = await bb.get_team_stats(away_id)
                        a_live = bb.compute_live_stats(a_last, a_standing, a_team_stats)
                except Exception:
                    pass

            def _pick(live: dict, snap: dict, key: str):
                return live.get(key) if live.get(key) is not None else snap.get(key)

            calc = calculate_mlb(
                odds_home=odds_home,
                odds_away=odds_away,
                home_win_rate=_pick(h_live, h_snap, "win_rate_10"),
                away_win_rate=_pick(a_live, a_snap, "win_rate_10"),
                home_run_diff=_pick(h_live, h_snap, "run_diff_10"),
                away_run_diff=_pick(a_live, a_snap, "run_diff_10"),
                home_runs_avg=_pick(h_live, h_snap, "runs_avg_10"),
                away_runs_avg=_pick(a_live, a_snap, "runs_avg_10"),
                home_runs_allowed=_pick(h_live, h_snap, "runs_allowed_10"),
                away_runs_allowed=_pick(a_live, a_snap, "runs_allowed_10"),
            )

            _mlb_ml_used = False
            if mlb_ml_model and mlb_snapshot:
                try:
                    feat_dict = _mlb_feats(
                        home_team=home,
                        away_team=away,
                        odds_home=odds_home,
                        odds_away=odds_away,
                        team_snapshot=mlb_snapshot,
                        rest_days_home=h_live.get("rest_days") or h_snap.get("rest_days"),
                        rest_days_away=a_live.get("rest_days") or a_snap.get("rest_days"),
                    )
                    feat_array = np.array([[feat_dict.get(col, np.nan) for col in MLB_FEATURE_COLUMNS]])
                    for col_idx in range(feat_array.shape[1]):
                        if np.isnan(feat_array[0, col_idx]):
                            feat_array[0, col_idx] = _mlb_medians[col_idx] if not np.isnan(_mlb_medians[col_idx]) else 0.0
                    ml_prob_home = float(mlb_ml_model.predict_proba(feat_array)[0])
                    ml_prob_away = 1.0 - ml_prob_home
                    rule_h = calc.home_prob or 0.5
                    rule_a = calc.away_prob or 0.5
                    blend_h = round(0.65 * ml_prob_home + 0.35 * rule_h, 4)
                    blend_a = round(0.65 * ml_prob_away + 0.35 * rule_a, 4)
                    edges_blended: dict = {}
                    if odds_home > 1.0:
                        edges_blended["Home"] = round(blend_h - 1.0 / odds_home, 4)
                    if odds_away > 1.0:
                        edges_blended["Away"] = round(blend_a - 1.0 / odds_away, 4)
                    from dataclasses import replace as _replace
                    calc = _replace(calc, home_prob=blend_h, away_prob=blend_a, edges=edges_blended)
                    _mlb_ml_used = True
                except Exception as ml_exc:
                    logger.debug("MLB ML prediction failed: %s", ml_exc)

            h_record = f"{h_standing.get('wins', '?')}-{h_standing.get('losses', '?')}" if h_standing else None
            a_record = f"{a_standing.get('wins', '?')}-{a_standing.get('losses', '?')}" if a_standing else None

            matches.append(AIScanMatch(
                sport="mlb",
                home_team=home,
                away_team=away,
                league="MLB",
                date=om.get("date", ""),
                venue=None,
                odds=odds,
                model_prob_home=calc.home_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges,
                data_quality=calc.data_quality,
                data_score=calc.data_score,
                mlb_ml_used=_mlb_ml_used,
                home_runs_avg_10=_pick(h_live, h_snap, "runs_avg_10"),
                away_runs_avg_10=_pick(a_live, a_snap, "runs_avg_10"),
                home_runs_allowed_10=_pick(h_live, h_snap, "runs_allowed_10"),
                away_runs_allowed_10=_pick(a_live, a_snap, "runs_allowed_10"),
                home_win_rate_10=_pick(h_live, h_snap, "win_rate_10"),
                away_win_rate_10=_pick(a_live, a_snap, "win_rate_10"),
                home_streak=h_live.get("streak") or h_snap.get("streak"),
                away_streak=a_live.get("streak") or a_snap.get("streak"),
                home_rest_days=h_live.get("rest_days"),
                away_rest_days=a_live.get("rest_days"),
                form_home=h_live.get("form"),
                form_away=a_live.get("form"),
                home_season_record=h_record,
                away_season_record=a_record,
                home_last_5=h_live.get("last_5_results", []),
                away_last_5=a_live.get("last_5_results", []),
                position_home=h_standing.get("division_rank") or h_live.get("division_rank"),
                position_away=a_standing.get("division_rank") or a_live.get("division_rank"),
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
                home_batting_avg=h_live.get("batting_avg"),
                away_batting_avg=a_live.get("batting_avg"),
                home_era=h_live.get("era"),
                away_era=a_live.get("era"),
                home_obp=h_live.get("obp"),
                away_obp=a_live.get("obp"),
                home_slg=h_live.get("slg"),
                away_slg=a_live.get("slg"),
                home_ops=h_live.get("ops"),
                away_ops=a_live.get("ops"),
                home_division=h_standing.get("division") or h_live.get("division"),
                away_division=a_standing.get("division") or a_live.get("division"),
                home_division_rank=h_standing.get("division_rank") or h_live.get("division_rank"),
                away_division_rank=a_standing.get("division_rank") or a_live.get("division_rank"),
            ))
        except Exception as exc:
            logger.debug("MLB fixture processing error: %s", exc)
            continue

    duration = time.time() - t0

    _save_odds_snapshots(matches, "mlb")

    cache_payload = {
        "_cached_at": time.time(),
        "duration": duration,
        "matches": [m.model_dump() for m in matches],
    }
    cache_set("scan:mlb:all", cache_payload, ttl=SCAN_CACHE_TTL + 300)
    cache_set("scan:meta:last_mlb", time.time(), ttl=86400)
    _track_scan_result("mlb", len(matches))

    # File backup
    try:
        _MLB_FILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        scan_key = "mlb_latest"
        backup_file = _MLB_FILE_CACHE_DIR / f"scan_result_{scan_key}.json"
        backup_file.write_text(json.dumps(cache_payload, ensure_ascii=False, default=str), encoding="utf-8")
    except Exception as exc:
        logger.warning("MLB file backup failed: %s", exc)

    _track_scan_result("mlb", len(matches))
    _sync_odds_api_usage(mlb_client)
    logger.info("MLB scan completed: %d games in %.1fs", len(matches), duration)
