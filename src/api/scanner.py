"""Scanner API endpoints for value bet detection."""

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from src.api.schemas import (
    AIResearchResponse,
    AIScanMatch,
    AIScanResponse,
)

router = APIRouter(tags=["scanner"])

# --- V6 model lazy loader ---
_V6_MODEL = None
_V6_MODEL_LOADED = False


def _ai_scan_v6_model():
    """Load V6 FootballModel once, return None if unavailable."""
    global _V6_MODEL, _V6_MODEL_LOADED
    if _V6_MODEL_LOADED:
        return _V6_MODEL
    try:
        model_path = Path("models/football")
        if (model_path / "model.joblib").exists():
            from src.ml.football_model import FootballModel
            m = FootballModel()
            m.load(model_path)
            _V6_MODEL = m
    except Exception as _e:
        import logging
        logging.getLogger(__name__).warning("V6 model unavailable: %s", _e)
    _V6_MODEL_LOADED = True
    return _V6_MODEL


# ---------------------------------------------------------------------------
# AI Scanner endpoints
# ---------------------------------------------------------------------------


@router.get("/scanner/ai-scan", response_model=AIScanResponse)
async def ai_scan(
    sport: str = Query(default="football", description="football or tennis"),
    leagues: str = Query(default="", description="Comma-separated league codes"),
    timeframe: str = Query(default="48h", description="24h, 48h, 72h, or 1w"),
    force: bool = Query(default=False, description="Force refresh, bypass cache"),
    cache_only: bool = Query(default=False, description="Only return cached data"),
):
    """Scan matches via API-Football (football) or Claude (tennis)."""
    import asyncio
    import hashlib
    import json as _json
    import time as _time

    league_list = [lg.strip() for lg in leagues.split(",") if lg.strip()]

    if sport == "tennis":
        return await _ai_scan_tennis(league_list, timeframe, force, cache_only)

    # --- Football via API-Football ---
    from src.data.api_football_client import ApiFootballClient, CACHE_DIR as AF_CACHE_DIR
    from src.services.probability_calculator import calculate_football
    from src.services.live_features import build_live_features

    # Load V6 model once per process (lazy global cache)
    import numpy as _np

    _v6 = _ai_scan_v6_model()  # returns model or None

    # Scan-level cache (30min TTL) — Redis if available, file fallback
    from src.cache import cache_get, cache_set
    scan_key = hashlib.md5(f"football_{','.join(sorted(league_list))}_{timeframe}".encode()).hexdigest()[:12]
    cache_redis_key = f"scan:football:{scan_key}"
    SCAN_CACHE_TTL = 1800  # 30 min

    # Also keep file cache path for get_scanned_matches helper
    scan_cache_file = AF_CACHE_DIR / f"scan_result_{scan_key}.json"

    if not force:
        # Try Redis first, then file fallback
        cached = cache_get(cache_redis_key)
        if cached is None and scan_cache_file.exists():
            try:
                cached = _json.loads(scan_cache_file.read_text(encoding="utf-8"))
                age = _time.time() - cached.get("_cached_at", 0)
                if age >= SCAN_CACHE_TTL and not cache_only:
                    cached = None
            except Exception:
                cached = None
        if cached:
            raw = cached.get("matches", [])
            return AIScanResponse(
                matches=[AIScanMatch(**m) for m in raw],
                sport="football",
                source="api_football",
                cached=True,
                cached_at=datetime.fromtimestamp(cached["_cached_at"]).isoformat(),
                research_duration_seconds=cached.get("duration", 0.0),
            )
        if cache_only:
            return AIScanResponse(matches=[], sport="football", source="api_football",
                                  cached=False, cached_at=None, research_duration_seconds=0.0)

    t0 = _time.time()
    from src.data.api_football_client import LEAGUE_ID_MAP
    client = ApiFootballClient()

    # 1. Fixtures — scan all known competitions unless caller specifies
    effective_leagues = league_list or list(LEAGUE_ID_MAP.keys())
    fixtures = await client.get_fixtures(effective_leagues, timeframe)

    now = datetime.now()
    matches_out: list[AIScanMatch] = []

    # Per-league topscorers cache (one fetch per league)
    topscorers_cache: dict[int, list[dict]] = {}

    async def _process_fixture(fix: dict) -> AIScanMatch | None:
        try:
            fid = fix["fixture"]["id"]
            home_id = fix["teams"]["home"]["id"]
            away_id = fix["teams"]["away"]["id"]
            league_id = fix["league"]["id"]
            home_name = fix["teams"]["home"]["name"]
            away_name = fix["teams"]["away"]["name"]
            league_name = fix["league"]["name"]
            venue_name = fix.get("fixture", {}).get("venue", {}).get("name")
            fixture_dt_str = fix["fixture"].get("date", "")
            fixture_dt = datetime.fromisoformat(fixture_dt_str.replace("Z", "+00:00")).replace(tzinfo=None) if fixture_dt_str else now
            minutes_until = (fixture_dt - now).total_seconds() / 60

            # Parallel data fetches
            standings_list, h2h_raw, injuries, stats_h, stats_a, odds = await asyncio.gather(
                client.get_standings(league_id),
                client.get_h2h(home_id, away_id),
                client.get_injuries(fid),
                client.get_team_stats(home_id, league_id),
                client.get_team_stats(away_id, league_id),
                client.get_odds(fid),
            )

            # Topscorers (per league, cached)
            if league_id not in topscorers_cache:
                topscorers_cache[league_id] = await client.get_topscorers(league_id)
            topscorers = topscorers_cache[league_id]

            # Positions from standings
            home_rank = client._find_rank(standings_list, home_id)
            away_rank = client._find_rank(standings_list, away_id)

            # Form strings (API returns WWDLW → convert to VVNDN)
            form_home = client.form_to_bettracker(stats_h.get("form", ""))
            form_away = client.form_to_bettracker(stats_a.get("form", ""))

            # Home-specific form
            form_home_home = None
            form_away_away = None
            if stats_h.get("wins_home") is not None:
                ph = stats_h.get("played_home") or 1
                # Reconstruct rough home form from win/draw/loss counts (not sequential)
                # Use as goals averages instead — sequential form not available per venue
                pass

            # Injuries per team
            inj_home = [i for i in injuries if i.get("team_id") == home_id]
            inj_away = [i for i in injuries if i.get("team_id") == away_id]
            inj_home_ids = [i["player_id"] for i in inj_home]
            inj_away_ids = [i["player_id"] for i in inj_away]
            abs_home = [i["player_name"] for i in inj_home]
            abs_away = [i["player_name"] for i in inj_away]

            # Key players
            key_players_home = await client.get_team_key_players(home_id, league_id, inj_home_ids, topscorers)
            key_players_away = await client.get_team_key_players(away_id, league_id, inj_away_ids, topscorers)

            # Top scorer goals/match (for absence weight)
            home_top_gpm = key_players_home[0]["goals_per_match"] if key_players_home else 0.0
            away_top_gpm = key_players_away[0]["goals_per_match"] if key_players_away else 0.0

            # Lineup — always fetch presumed; confirmed only if < 2h
            lineup_status = "presumed"
            lineup_home_list: list[dict] = []
            lineup_away_list: list[dict] = []
            if minutes_until < 120:
                confirmed = await client.get_lineup(fid)
                if confirmed:
                    lineup_status = "confirmed"
                    for team_name, players in confirmed.items():
                        if home_name.lower() in team_name.lower():
                            lineup_home_list = players
                        else:
                            lineup_away_list = players
            if not lineup_home_list:
                lineup_home_list = await client.get_presumed_lineup(home_id, inj_home_ids)
            if not lineup_away_list:
                lineup_away_list = await client.get_presumed_lineup(away_id, inj_away_ids)

            # Goals averages (venue-specific)
            gs_h = stats_h.get("goals_scored_avg_home")
            gc_h = stats_h.get("goals_conceded_avg_home")
            gs_a = stats_a.get("goals_scored_avg_away")
            gc_a = stats_a.get("goals_conceded_avg_away")

            # Cotes 1X2
            odds_1x2 = odds.get("1x2", {})
            def _best(d: dict) -> float:
                return max((float(v) for v in d.values() if v), default=0.0) if d else 0.0
            odds_h_val = _best(odds_1x2.get("H", {}))
            odds_d_val = _best(odds_1x2.get("D", {}))
            odds_a_val = _best(odds_1x2.get("A", {}))

            # Probability calculation
            calc = calculate_football(
                odds_h=odds_h_val, odds_d=odds_d_val, odds_a=odds_a_val,
                form_home=form_home, form_away=form_away,
                position_home=home_rank, position_away=away_rank,
                h2h_summary=client._h2h_summary(h2h_raw, home_id) if h2h_raw else None,
                h2h_details=h2h_raw,
                home_team_id=home_id,
                key_absences_home=abs_home, key_absences_away=abs_away,
                home_top_scorer_gpm=home_top_gpm,
                away_top_scorer_gpm=away_top_gpm,
                lineup_confirmed=(lineup_status == "confirmed"),
                home_goals_scored_avg=gs_h,
                home_goals_conceded_avg=gc_h,
                away_goals_scored_avg=gs_a,
                away_goals_conceded_avg=gc_a,
                xg_home=stats_h.get("home_xg_avg"),
                xg_away=stats_a.get("away_xg_avg"),
                btts_pct_home=stats_h.get("home_btts_pct"),
                btts_pct_away=stats_a.get("away_btts_pct"),
            )

            # --- V6 ML model blending (45% ML + 55% Poisson) ---
            ML_WEIGHT = 0.45
            if _v6 is not None:
                try:
                    from src.ml.football_model import MODEL_FEATURES
                    live_feats = build_live_features(
                        stats_h=stats_h, stats_a=stats_a,
                        home_rank=home_rank, away_rank=away_rank,
                        h2h_raw=h2h_raw, home_id=home_id,
                        odds_1x2=odds.get("1x2", {}),
                        league_name=league_name, fixture_dt=fixture_dt,
                    )
                    X = _np.array([[live_feats.get(feat, 0.0) for feat in MODEL_FEATURES]])
                    X = _np.nan_to_num(X, nan=0.0)
                    ml_p = _v6.predict_proba(X)[0]  # [prob_H, prob_D, prob_A]
                    # Blend: final = ML_WEIGHT * ml + (1-ML_WEIGHT) * poisson
                    ph = ML_WEIGHT * float(ml_p[0]) + (1 - ML_WEIGHT) * calc.home_prob
                    pd_ = ML_WEIGHT * float(ml_p[1]) + (1 - ML_WEIGHT) * calc.draw_prob
                    pa = ML_WEIGHT * float(ml_p[2]) + (1 - ML_WEIGHT) * calc.away_prob
                    # Renormalize
                    tot = ph + pd_ + pa
                    calc.home_prob = round(ph / tot, 4)
                    calc.draw_prob = round(pd_ / tot, 4)
                    calc.away_prob = round(pa / tot, 4)
                    # Recompute edges with blended probs
                    if calc.edges:
                        odds_1x2_local = odds.get("1x2", {})
                        for key, prob in [("H", calc.home_prob), ("D", calc.draw_prob), ("A", calc.away_prob)]:
                            bk_odds = odds_1x2_local.get(key, {})
                            best_o = max((float(v) for v in bk_odds.values() if v and float(v) > 1), default=0.0)
                            if best_o > 1:
                                implied = 1 / best_o
                                calc.edges[key] = round(prob - implied, 4)
                except Exception as _ve:
                    import logging
                    logging.getLogger(__name__).debug("V6 blend error: %s", _ve)

            # H2H summary and avg goals
            h2h_goals = None
            if h2h_raw:
                goals = [m.get("score_h", 0) + m.get("score_a", 0) for m in h2h_raw
                         if m.get("score_h") is not None]
                if goals:
                    h2h_goals = round(sum(goals) / len(goals), 2)

            # Streak from form
            def _streak(form: str) -> str | None:
                if not form:
                    return None
                last = form[-1]
                count = 0
                for c in reversed(form):
                    if c == last:
                        count += 1
                    else:
                        break
                labels = {"V": "victoire", "N": "nul", "D": "defaite"}
                return f"{count} {labels.get(last, last)} de suite" if count >= 2 else None

            return AIScanMatch(
                sport="football",
                home_team=home_name,
                away_team=away_name,
                league=league_name,
                date=fixture_dt_str,
                venue=venue_name,
                odds=odds,
                form_home=form_home or None,
                form_away=form_away or None,
                form_home_home=form_home_home,
                form_away_away=form_away_away,
                position_home=home_rank,
                position_away=away_rank,
                key_absences_home=abs_home,
                key_absences_away=abs_away,
                h2h_summary=client._h2h_summary(h2h_raw, home_id) if h2h_raw else None,
                h2h_avg_goals=h2h_goals,
                h2h_details=h2h_raw,
                fixture_id=fid,
                lineup_status=lineup_status,
                lineup_home=lineup_home_list,
                lineup_away=lineup_away_list,
                key_players_home=key_players_home,
                key_players_away=key_players_away,
                # Team stats
                home_goals_scored_avg5=gs_h,
                home_goals_conceded_avg5=gc_h,
                away_goals_scored_avg5=gs_a,
                away_goals_conceded_avg5=gc_a,
                home_clean_sheets=stats_h.get("clean_sheets_home"),
                away_clean_sheets=stats_a.get("clean_sheets_away"),
                home_btts_pct=stats_h.get("home_btts_pct"),
                away_btts_pct=stats_a.get("away_btts_pct"),
                home_possession_avg=stats_h.get("home_possession_avg"),
                away_possession_avg=stats_a.get("away_possession_avg"),
                home_shots_pg=stats_h.get("home_shots_pg"),
                away_shots_pg=stats_a.get("away_shots_pg"),
                home_top_scorer=key_players_home[0]["name"] if key_players_home else None,
                away_top_scorer=key_players_away[0]["name"] if key_players_away else None,
                home_current_streak=_streak(form_home),
                away_current_streak=_streak(form_away),
                # Probability results
                model_prob_home=calc.home_prob,
                model_prob_draw=calc.draw_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges,
                data_quality=calc.data_quality,
                data_score=calc.data_score,
                lambda_home=calc.lambda_home,
                lambda_away=calc.lambda_away,
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Error processing fixture %s: %s", fix.get("fixture", {}).get("id"), exc)
            return None

    # Process all fixtures (concurrently, max 2 at a time to respect rate limits)
    sem = asyncio.Semaphore(2)
    async def _guarded(fix):
        async with sem:
            return await _process_fixture(fix)

    results = await asyncio.gather(*[_guarded(f) for f in fixtures])
    # Filter out matches with insufficient data (data_score < 0.4 = less than 8/20 points)
    # These matches have too few reliable inputs for the Poisson model to be trustworthy
    DATA_SCORE_MIN = 0.40
    matches_out = [m for m in results if m is not None and (m.data_score or 0) >= DATA_SCORE_MIN]

    duration = _time.time() - t0

    # Save scan result cache (Redis + file fallback)
    cache_payload = {
        "_cached_at": _time.time(),
        "duration": duration,
        "matches": [m.model_dump() for m in matches_out],
    }
    try:
        cache_set(cache_redis_key, cache_payload, ttl=SCAN_CACHE_TTL)
    except Exception:
        pass
    try:
        scan_cache_file.write_text(
            _json.dumps(cache_payload, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to save scan file cache: %s", exc)

    return AIScanResponse(
        matches=matches_out,
        sport="football",
        source="api_football",
        cached=False,
        cached_at=None,
        research_duration_seconds=round(duration, 2),
    )


async def _ai_scan_tennis(league_list, timeframe, force, cache_only):
    """Tennis scan via The Odds API."""
    import asyncio as _asyncio
    from src.data.tennis_client import TennisClient
    from src.services.probability_calculator import calculate_tennis

    client = TennisClient()

    if cache_only:
        result = client.get_cached_result()
        if result is None:
            return AIScanResponse(matches=[], sport="tennis", source="odds_api",
                                  cached=False, cached_at=None, research_duration_seconds=0.0)
    else:
        # Run sync client in executor to avoid blocking async event loop
        loop = _asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: client.get_matches(timeframe=timeframe, force=force)
        )

    raw_matches = result.get("matches", [])
    duration = result.get("_duration_seconds", 0.0)
    from_cache = result.get("_from_cache", False)
    cached_at_ts = result.get("_cached_at")

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
            calc = calculate_tennis(
                odds_p1=odds_p1, odds_p2=odds_p2,
                form_p1=m.get("p1_form"), form_p2=m.get("p2_form"),
                ranking_p1=m.get("p1_ranking"), ranking_p2=m.get("p2_ranking"),
                h2h_summary=m.get("h2h"),
                absences_p1=abs_p1, absences_p2=abs_p2,
                surface_record_p1=m.get("p1_surface_record"),
                surface_record_p2=m.get("p2_surface_record"),
                serve_pct_p1=m.get("p1_serve_pct"),
                serve_pct_p2=m.get("p2_serve_pct"),
                return_pct_p1=m.get("p1_return_pct"),
                return_pct_p2=m.get("p2_return_pct"),
                season_record_p1=m.get("p1_season_record"),
                season_record_p2=m.get("p2_season_record"),
                aces_avg_p1=m.get("p1_aces_avg"),
                aces_avg_p2=m.get("p2_aces_avg"),
                rest_days_p1=m.get("p1_rest_days"),
                rest_days_p2=m.get("p2_rest_days"),
                h2h_surface=m.get("h2h_surface"),
                h2h_last3=m.get("h2h_last3", []) or [],
            )
            matches.append(AIScanMatch(
                sport="tennis",
                player1=m.get("player1"), player2=m.get("player2"),
                league=m.get("tournament", ""), date=m.get("date", ""),
                venue=m.get("venue"), odds=odds,
                form_home=m.get("p1_form"), form_away=m.get("p2_form"),
                form_home_detail=m.get("p1_form_detail", []) or [],
                form_away_detail=m.get("p2_form_detail", []) or [],
                key_absences_home=abs_p1, key_absences_away=abs_p2,
                h2h_summary=m.get("h2h"), context=m.get("context"),
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
                model_prob_home=calc.home_prob, model_prob_away=calc.away_prob,
                edges=calc.edges, data_quality=calc.data_quality, data_score=calc.data_score,
            ))
        except Exception:
            continue

    return AIScanResponse(
        matches=matches, sport="tennis", source="odds_api",
        cached=from_cache,
        cached_at=datetime.fromtimestamp(cached_at_ts).isoformat() if cached_at_ts else None,
        research_duration_seconds=duration,
    )


def get_scanned_matches(
    demo: bool = False,
    min_edge: float | None = None,
    min_prob: float | None = None,
    min_odds: float | None = None,
    max_odds: float | None = None,
    outcomes: list[str] | None = None,
    excluded_leagues: list[str] | None = None,
):
    """Synchronous helper: load cached scan results and filter by campaign criteria.

    Returns (filtered_matches, total_scanned, 0, 0, 0) for backward compat.
    """
    import json as _json
    from src.data.api_football_client import CACHE_DIR as AF_CACHE_DIR

    # Find most recent scan cache file
    cache_files = sorted(AF_CACHE_DIR.glob("scan_result_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    all_matches: list[AIScanMatch] = []
    for cf in cache_files[:1]:
        try:
            data = _json.loads(cf.read_text(encoding="utf-8"))
            all_matches = [AIScanMatch(**m) for m in data.get("matches", [])]
        except Exception:
            pass
        break

    total_scanned = len(all_matches)

    # Filter
    filtered: list[AIScanMatch] = []
    for m in all_matches:
        if excluded_leagues:
            if any(el.lower() in m.league.lower() for el in excluded_leagues):
                continue

        # Check if any outcome passes filters
        edges = m.edges or {}
        odds_1x2 = {}
        if isinstance(m.odds, dict):
            odds_1x2 = m.odds.get("1x2", {})

        has_value = False
        for key in (outcomes or ["H", "D", "A"]):
            edge = edges.get(key, 0)
            if min_edge and edge < min_edge:
                continue
            prob_map = {"H": m.model_prob_home, "D": m.model_prob_draw, "A": m.model_prob_away}
            prob = prob_map.get(key, 0) or 0
            if min_prob and prob < min_prob:
                continue
            bk_odds = odds_1x2.get(key, {})
            best = max((float(v) for v in bk_odds.values() if v and float(v) > 1), default=0.0) if isinstance(bk_odds, dict) else 0.0
            if min_odds and best < min_odds:
                continue
            if max_odds and best > max_odds:
                continue
            if edge > 0:
                has_value = True
                break

        if has_value:
            filtered.append(m)

    return filtered, total_scanned, 0, 0, 0


@router.get("/scanner/ai-research", response_model=AIResearchResponse)
async def ai_research(
    sport: str = Query(default="football"),
    home: str = Query(..., description="Home team or player 1"),
    away: str = Query(..., description="Away team or player 2"),
    competition: str = Query(..., description="League or tournament"),
    date: str = Query(..., description="Match date"),
    force: bool = Query(default=False),
):
    """Deep research on a specific match via Claude Code web search."""
    from src.data.claude_researcher import ClaudeResearcher

    researcher = ClaudeResearcher()
    result = await researcher.deep_research(
        sport=sport, home=home, away=away,
        competition=competition, date=date, force=force,
    )

    if "_error" in result:
        raise HTTPException(
            status_code=502,
            detail=f"Claude research failed: {result['_error']}",
        )

    duration = result.get("_duration_seconds", 0.0)
    from_cache = result.get("_from_cache", False)
    cached_at_ts = result.get("_cached_at")

    if sport == "tennis":
        home_analysis = result.get("player1_analysis", {})
        away_analysis = result.get("player2_analysis", {})
    else:
        home_analysis = result.get("home_team_analysis", {})
        away_analysis = result.get("away_team_analysis", {})

    return AIResearchResponse(
        sport=sport,
        match_info=result.get("match_info", {}),
        odds=result.get("odds", {}),
        home_analysis=home_analysis,
        away_analysis=away_analysis,
        injuries=result.get("injuries_suspensions", result.get("injuries", {})),
        lineups=result.get("expected_lineups"),
        h2h=result.get("h2h", {}),
        key_players=result.get("key_players"),
        tactical_analysis=result.get("tactical_analysis", ""),
        expert_prediction=result.get("expert_prediction", {}),
        cached=from_cache,
        cached_at=datetime.fromtimestamp(cached_at_ts).isoformat() if cached_at_ts else None,
        research_duration_seconds=duration,
    )
