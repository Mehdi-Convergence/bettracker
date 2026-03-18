"""NBA scan worker — pre-computes NBA scans on schedule.

Contient run_nba_scan() et ses helpers (model loader).
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

logger = logging.getLogger("scan_worker.nba")


def _load_nba_model():
    """Load NBA ML model + team stats snapshot. Returns (model, snapshot) or (None, None)."""
    try:
        from src.ml.nba_model import NBAModel
        from pathlib import Path
        model_dir = Path("models/nba")
        if not (model_dir / "model.joblib").exists():
            return None, None
        model = NBAModel.load(model_dir)
        import json
        with open(model_dir / "team_stats.json") as f:
            snapshot = json.load(f)
        return model, snapshot
    except Exception as e:
        logger.warning("NBA model not available: %s", e)
        return None, None


async def run_nba_scan():
    """Run NBA scan — Odds API for odds (all bookmakers) + ESPN for fixtures/stats."""
    from src.data.nba_client import NBAClient
    from src.services.probability_calculator import calculate_nba
    from src.api.schemas import AIScanMatch
    from src.config import settings as _settings

    t0 = time.time()

    # Budget check: 3 markets (h2h,totals,spreads) x 5 regions = 15 credits
    if not _odds_api_budget_check("nba", cost=15):
        _track_scan_result("nba", 0, error="budget_exhausted")
        return

    nba_client = NBAClient()

    nba_ml_model, nba_snapshot = _load_nba_model()
    if nba_ml_model:
        from src.features.nba_features import NBA_FEATURE_COLUMNS, build_nba_live_features as _nba_feats
        _nba_medians = np.array(nba_snapshot.get("col_medians", [np.nan] * len(NBA_FEATURE_COLUMNS)))
        logger.info("NBA ML model loaded (%d feature columns)", len(NBA_FEATURE_COLUMNS))
    else:
        logger.info("NBA ML model not available — using rule-based only")

    # 1. Fetch odds from Odds API (all bookmakers, profondeur max)
    loop = asyncio.get_event_loop()
    try:
        odds_matches = await loop.run_in_executor(None, lambda: nba_client.get_matches(timeframe="48h"))
    except Exception as exc:
        logger.error("NBA odds fetch failed: %s", exc)
        _track_scan_result("nba", 0, error=str(exc))
        return

    if not odds_matches:
        logger.info("NBA scan: no upcoming games with odds")
        cache_set("scan:nba:all", {"_cached_at": time.time(), "duration": 0, "matches": []}, ttl=SCAN_CACHE_TTL + 300)
        _track_scan_result("nba", 0)
        return

    logger.info("NBA scan: %d games with odds from Odds API", len(odds_matches))

    # 2. Fetch ESPN fixtures + standings for enrichment (free, no quota)
    espn_fixtures = []
    espn_standings_map: dict[str, dict] = {}
    if _settings.USE_ESPN_NBA:
        try:
            espn_fixtures = await loop.run_in_executor(None, nba_client.get_fixtures_espn)
            espn_standings = await loop.run_in_executor(None, nba_client.get_standings_espn)
            for s in espn_standings:
                espn_standings_map[s.get("team_name", "")] = s
            logger.info("ESPN enrichment: %d fixtures, %d standings", len(espn_fixtures), len(espn_standings))
        except Exception as exc:
            logger.warning("ESPN enrichment failed (non-blocking): %s", exc)

    # Fallback to API-Sports if ESPN not enabled or failed
    bball = None
    standings_by_name: dict[str, dict] = {}
    standings_by_id: dict[int, dict] = {}
    if not _settings.USE_ESPN_NBA or not espn_standings_map:
        try:
            from src.data.api_basketball_client import ApiBasketballClient
            bball = ApiBasketballClient()
            standings = await bball.get_standings()
            for s in standings:
                standings_by_name[s["team_name"]] = s
                if s.get("team_id"):
                    standings_by_id[s["team_id"]] = s
        except Exception:
            logger.warning("API-Sports Basketball fallback failed")

    # 3. Process each game from Odds API
    matches: list[AIScanMatch] = []
    teams_data = nba_snapshot.get("teams", {}) if nba_snapshot else {}

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

            # Enrichment: ESPN standings or API-Sports fallback
            h_standing = espn_standings_map.get(home) or standings_by_name.get(home, {})
            a_standing = espn_standings_map.get(away) or standings_by_name.get(away, {})

            h_snap = teams_data.get(home, {})
            a_snap = teams_data.get(away, {})

            # Live stats from API-Sports (if available and ESPN not sufficient)
            h_live: dict = {}
            a_live: dict = {}
            if bball:
                try:
                    # Find team IDs from standings
                    home_id = standings_by_name.get(home, {}).get("team_id")
                    away_id = standings_by_name.get(away, {}).get("team_id")
                    if home_id:
                        h_last = await bball.get_last_games(home_id, team_name=home)
                        h_team_stats = await bball.get_team_stats(home_id)
                        h_live = bball.compute_live_stats(h_last, h_standing, h_team_stats)
                    if away_id:
                        a_last = await bball.get_last_games(away_id, team_name=away)
                        a_team_stats = await bball.get_team_stats(away_id)
                        a_live = bball.compute_live_stats(a_last, a_standing, a_team_stats)
                except Exception:
                    pass

            def _pick(live: dict, snap: dict, key: str):
                return live.get(key) if live.get(key) is not None else snap.get(key)

            # Rule-based baseline
            calc = calculate_nba(
                odds_home=odds_home,
                odds_away=odds_away,
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
                home_win_rate=_pick(h_live, h_snap, "win_rate_10"),
                away_win_rate=_pick(a_live, a_snap, "win_rate_10"),
                home_pt_diff=_pick(h_live, h_snap, "pt_diff_10"),
                away_pt_diff=_pick(a_live, a_snap, "pt_diff_10"),
            )

            _nba_ml_used = False
            if nba_ml_model and nba_snapshot:
                try:
                    feat_dict = _nba_feats(
                        home_team=home,
                        away_team=away,
                        odds_home=odds_home,
                        odds_away=odds_away,
                        odds_over=odds_over,
                        odds_under=odds_under,
                        total_line=total_line,
                        team_snapshot=nba_snapshot,
                        rest_days_home=h_live.get("rest_days") or h_snap.get("rest_days"),
                        rest_days_away=a_live.get("rest_days") or a_snap.get("rest_days"),
                        is_b2b_home=h_live.get("is_b2b"),
                        is_b2b_away=a_live.get("is_b2b"),
                    )
                    feat_array = np.array([[feat_dict.get(col, np.nan) for col in NBA_FEATURE_COLUMNS]])
                    for col_idx in range(feat_array.shape[1]):
                        if np.isnan(feat_array[0, col_idx]):
                            feat_array[0, col_idx] = _nba_medians[col_idx] if not np.isnan(_nba_medians[col_idx]) else 0.0
                    ml_prob_home = float(nba_ml_model.predict_proba(feat_array)[0])
                    ml_prob_away = 1.0 - ml_prob_home
                    rule_h = calc.home_prob or 0.5
                    rule_a = calc.away_prob or 0.5
                    blend_h = round(0.70 * ml_prob_home + 0.30 * rule_h, 4)
                    blend_a = round(0.70 * ml_prob_away + 0.30 * rule_a, 4)
                    edges_blended: dict = {}
                    if odds_home > 1.0:
                        edges_blended["Home"] = round(blend_h - 1.0 / odds_home, 4)
                    if odds_away > 1.0:
                        edges_blended["Away"] = round(blend_a - 1.0 / odds_away, 4)
                    for k in ["Over", "Under"]:
                        if k in (calc.edges or {}):
                            edges_blended[k] = calc.edges[k]
                    from dataclasses import replace as _replace
                    calc = _replace(calc, home_prob=blend_h, away_prob=blend_a, edges=edges_blended)
                    _nba_ml_used = True
                except Exception as ml_exc:
                    logger.debug("NBA ML prediction failed: %s", ml_exc)

            # Build season record strings
            h_record = f"{h_standing.get('wins', '?')}-{h_standing.get('losses', '?')}" if h_standing else None
            a_record = f"{a_standing.get('wins', '?')}-{a_standing.get('losses', '?')}" if a_standing else None

            matches.append(AIScanMatch(
                sport="nba",
                player1=home,
                player2=away,
                home_team=home,
                away_team=away,
                league="NBA",
                date=om.get("date", ""),
                venue=None,
                odds=odds,
                model_prob_home=calc.home_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges,
                data_quality=calc.data_quality,
                data_score=calc.data_score,
                nba_ml_used=_nba_ml_used,
                home_win_rate_10=_pick(h_live, h_snap, "win_rate_10"),
                away_win_rate_10=_pick(a_live, a_snap, "win_rate_10"),
                home_pt_diff_10=_pick(h_live, h_snap, "pt_diff_10"),
                away_pt_diff_10=_pick(a_live, a_snap, "pt_diff_10"),
                home_pts_avg_10=_pick(h_live, h_snap, "pts_avg_10"),
                away_pts_avg_10=_pick(a_live, a_snap, "pts_avg_10"),
                home_pts_allowed_10=_pick(h_live, h_snap, "pts_allowed_10"),
                away_pts_allowed_10=_pick(a_live, a_snap, "pts_allowed_10"),
                home_streak=h_live.get("streak") or h_snap.get("streak"),
                away_streak=a_live.get("streak") or a_snap.get("streak"),
                home_b2b=h_live.get("is_b2b", False),
                away_b2b=a_live.get("is_b2b", False),
                home_rest_days=h_live.get("rest_days"),
                away_rest_days=a_live.get("rest_days"),
                form_home=h_live.get("form"),
                form_away=a_live.get("form"),
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
                home_fg_pct=h_live.get("fg_pct"),
                away_fg_pct=a_live.get("fg_pct"),
                home_three_pct=h_live.get("three_pct"),
                away_three_pct=a_live.get("three_pct"),
                home_ft_pct=h_live.get("ft_pct"),
                away_ft_pct=a_live.get("ft_pct"),
                home_rebounds_avg=h_live.get("rebounds_avg"),
                away_rebounds_avg=a_live.get("rebounds_avg"),
                home_assists_avg=h_live.get("assists_avg"),
                away_assists_avg=a_live.get("assists_avg"),
                home_turnovers_avg=h_live.get("turnovers_avg"),
                away_turnovers_avg=a_live.get("turnovers_avg"),
                home_steals_avg=h_live.get("steals_avg"),
                away_steals_avg=a_live.get("steals_avg"),
                home_blocks_avg=h_live.get("blocks_avg"),
                away_blocks_avg=a_live.get("blocks_avg"),
                home_conference=h_standing.get("conference") or h_live.get("conference"),
                away_conference=a_standing.get("conference") or a_live.get("conference"),
                home_conference_rank=h_standing.get("conference_rank") or h_live.get("conference_rank"),
                away_conference_rank=a_standing.get("conference_rank") or a_live.get("conference_rank"),
                home_season_record=h_record,
                away_season_record=a_record,
                home_last_5=h_live.get("last_5_results", []),
                away_last_5=a_live.get("last_5_results", []),
                position_home=h_standing.get("conference_rank") or h_live.get("conference_rank"),
                position_away=a_standing.get("conference_rank") or a_live.get("conference_rank"),
            ))
        except Exception as exc:
            logger.debug("NBA fixture processing error: %s", exc)
            continue

    duration = time.time() - t0

    _save_odds_snapshots(matches, "nba")

    cache_payload = {
        "_cached_at": time.time(),
        "duration": duration,
        "matches": [m.model_dump() for m in matches],
    }
    cache_set("scan:nba:all", cache_payload, ttl=SCAN_CACHE_TTL + 300)
    cache_set("scan:meta:last_nba", time.time(), ttl=86400)
    _track_scan_result("nba", len(matches))
    _sync_odds_api_usage(nba_client)
    logger.info("NBA scan completed: %d games in %.1fs", len(matches), duration)
