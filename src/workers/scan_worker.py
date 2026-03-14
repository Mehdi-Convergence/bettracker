"""Background scan worker — pre-computes football & tennis scans on schedule.

Runs as a standalone process:
    python -m src.workers.scan_worker

Stores results in Redis (+ file backup). The API reads from cache only.
"""

import asyncio
import hashlib
import json
import logging
import math
import time
from datetime import datetime
from pathlib import Path

import numpy as np

from src.cache import cache_set

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("scan_worker")


def _extract_best_odd(market: dict, key: str) -> float | None:
    """Extract best odd for a given outcome key from a market dict.

    The market value for a key can be:
    - a dict  {bookmaker: float}  → return the max
    - a float/int directly        → return it
    - absent                      → return None
    """
    val = market.get(key)
    if val is None:
        return None
    if isinstance(val, dict):
        candidates = [float(v) for v in val.values() if v]
        return max(candidates) if candidates else None
    try:
        result = float(val)
        return result if result > 1.0 else None
    except (TypeError, ValueError):
        return None


def _save_odds_snapshots(all_matches: list, sport: str) -> None:
    """Persist one OddsSnapshot row per match. Non-blocking: any error is just warned."""
    try:
        import datetime as _dt
        from src.database import SessionLocal
        from src.models.odds_snapshot import OddsSnapshot

        db = SessionLocal()
        now = _dt.datetime.utcnow()
        cutoff = now - _dt.timedelta(days=30)

        db.query(OddsSnapshot).filter(OddsSnapshot.snapshot_time < cutoff).delete()

        for match in all_matches:
            odds_data = match.odds if hasattr(match, "odds") else {}
            if not isinstance(odds_data, dict):
                odds_data = {}

            if sport in ("football", "rugby"):
                market = odds_data.get("1x2", {})
                odds_h = _extract_best_odd(market, "H")
                odds_d = _extract_best_odd(market, "D")
                odds_a = _extract_best_odd(market, "A")
            else:
                # tennis / nba: no draw
                market = odds_data.get("winner", {})
                if not market:
                    market = odds_data.get("1x2", {})
                odds_h = (
                    _extract_best_odd(market, "P1")
                    or _extract_best_odd(market, "Home")
                    or _extract_best_odd(market, "H")
                )
                odds_d = None
                odds_a = (
                    _extract_best_odd(market, "P2")
                    or _extract_best_odd(market, "Away")
                    or _extract_best_odd(market, "A")
                )

            # Resolve match date
            raw_date = match.date if hasattr(match, "date") else ""
            try:
                if raw_date:
                    match_dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    match_dt = now
            except Exception:
                match_dt = now

            home = (match.home_team or "") if hasattr(match, "home_team") else ""
            away = (match.away_team or "") if hasattr(match, "away_team") else ""

            snap = OddsSnapshot(
                sport=sport,
                home_team=home,
                away_team=away,
                match_date=match_dt,
                snapshot_time=now,
                odds_home=odds_h,
                odds_draw=odds_d,
                odds_away=odds_a,
            )
            db.add(snap)

        db.commit()
        db.close()
        logger.debug("Odds snapshots saved: %d rows (%s)", len(all_matches), sport)
    except Exception as exc:
        logger.warning("Odds snapshot error (%s): %s", sport, exc)

# --- Intervals (seconds) ---
# Conservative defaults to stay within free/low-tier API quotas.
# API-Football free: 100 req/day — one full scan ≈ 150-200 requests
# Increase these when upgrading to Pro ($20/mo = 7500 req/day).
FOOTBALL_SCAN_INTERVAL = 60 * 60   # 1h (safe for free tier)
TENNIS_SCAN_INTERVAL = 60 * 60     # 1h
SCAN_CACHE_TTL = 3600              # 1h (match intervals)
DATA_SCORE_MIN = 0.40


# ---------------------------------------------------------------------------
# V6 model loader (same pattern as scanner.py)
# ---------------------------------------------------------------------------
_V6_MODEL = None
_V6_MODEL_LOADED = False


def _load_v6_model():
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
            logger.info("V6 model loaded from %s", model_path)
    except Exception as e:
        logger.warning("V6 model unavailable: %s", e)
    _V6_MODEL_LOADED = True
    return _V6_MODEL


# ---------------------------------------------------------------------------
# Football scan
# ---------------------------------------------------------------------------

async def run_football_scan(league_list: list[str] | None = None):
    """Run a full football scan and store results in cache."""
    from src.data.api_football_client import ApiFootballClient, LEAGUE_ID_MAP, CACHE_DIR as AF_CACHE_DIR
    from src.services.probability_calculator import calculate_football
    from src.services.live_features import build_live_features

    t0 = time.time()
    _v6 = _load_v6_model()
    client = ApiFootballClient()

    effective_leagues = league_list or list(LEAGUE_ID_MAP.keys())
    timeframe = "48h"

    try:
        fixtures = await client.get_fixtures(effective_leagues, timeframe)
    except Exception as exc:
        logger.error("Failed to fetch fixtures: %s", exc)
        return

    now = datetime.now()
    topscorers_cache: dict[int, list[dict]] = {}

    async def _process_fixture(fix: dict):
        """Process a single fixture — reuses scanner.py logic."""
        try:
            from src.api.schemas import AIScanMatch

            fid = fix["fixture"]["id"]
            home_id = fix["teams"]["home"]["id"]
            away_id = fix["teams"]["away"]["id"]
            league_id = fix["league"]["id"]
            home_name = fix["teams"]["home"]["name"]
            away_name = fix["teams"]["away"]["name"]
            league_name = fix["league"]["name"]
            venue_info = fix.get("fixture", {}).get("venue", {})
            venue_name = venue_info.get("name")
            venue_city = venue_info.get("city")
            fixture_dt_str = fix["fixture"].get("date", "")
            fixture_dt = datetime.fromisoformat(fixture_dt_str.replace("Z", "+00:00")).replace(tzinfo=None) if fixture_dt_str else now
            minutes_until = (fixture_dt - now).total_seconds() / 60

            # Parallel data fetches (including last fixture for rest_days + weather)
            from src.data.weather_client import get_match_weather
            (standings_list, h2h_raw, injuries, stats_h, stats_a, odds,
             last_fixes_home, last_fixes_away, weather_data) = await asyncio.gather(
                client.get_standings(league_id),
                client.get_h2h(home_id, away_id),
                client.get_injuries(fid),
                client.get_team_stats(home_id, league_id),
                client.get_team_stats(away_id, league_id),
                client.get_odds(fid),
                client.get_last_fixtures(home_id, n=5),
                client.get_last_fixtures(away_id, n=5),
                get_match_weather(venue_city),
            )

            # Rest days calculation — derive from most recent fixture in the list
            def _rest_days(fixes: list[dict], ref_dt: datetime) -> int | None:
                if not fixes:
                    return None
                try:
                    last_dt = datetime.strptime(fixes[0]["date"], "%Y-%m-%d")
                    return int((ref_dt - last_dt).days)
                except Exception:
                    return None

            home_rest = _rest_days(last_fixes_home, fixture_dt)
            away_rest = _rest_days(last_fixes_away, fixture_dt)

            # Topscorers (per league, cached in memory)
            if league_id not in topscorers_cache:
                topscorers_cache[league_id] = await client.get_topscorers(league_id)
            topscorers = topscorers_cache[league_id]

            home_rank = client._find_rank(standings_list, home_id)
            away_rank = client._find_rank(standings_list, away_id)

            form_home = client.form_to_bettracker(stats_h.get("form", ""))
            form_away = client.form_to_bettracker(stats_a.get("form", ""))

            # Form detail: last 5 matches with opponent and score
            def _build_form_detail(fixes: list[dict]) -> list[str]:
                """Build ['W 2-0 vs Arsenal', 'L 1-3 vs Liverpool', ...] from last fixtures."""
                parts = []
                for fx in fixes[:5]:
                    res = fx.get("result", "?")
                    sf = fx.get("score_for", 0)
                    sa = fx.get("score_against", 0)
                    opp = fx.get("opponent", "?")
                    parts.append(f"{res} {sf}-{sa} vs {opp}")
                return parts

            form_home_detail = _build_form_detail(last_fixes_home)
            form_away_detail = _build_form_detail(last_fixes_away)

            # Home/away specific win rates from standings
            def _home_win_rate(standings: list[dict], team_id: int) -> str | None:
                for s in standings:
                    if s.get("team_id") == team_id:
                        hw = s.get("home_wins", 0) or 0
                        hd = s.get("home_draws", 0) or 0
                        hl = s.get("home_losses", 0) or 0
                        total = hw + hd + hl
                        if total == 0:
                            return None
                        return f"{hw}V {hd}N {hl}D ({total} matchs domicile)"
                return None

            def _away_win_rate(standings: list[dict], team_id: int) -> str | None:
                for s in standings:
                    if s.get("team_id") == team_id:
                        aw = s.get("away_wins", 0) or 0
                        ad = s.get("away_draws", 0) or 0
                        al = s.get("away_losses", 0) or 0
                        total = aw + ad + al
                        if total == 0:
                            return None
                        return f"{aw}V {ad}N {al}D ({total} matchs exterieur)"
                return None

            form_home_home_str = _home_win_rate(standings_list, home_id)
            form_away_away_str = _away_win_rate(standings_list, away_id)

            # Injuries (with position lookup from squad for penalty weighting)
            inj_home = [i for i in injuries if i.get("team_id") == home_id]
            inj_away = [i for i in injuries if i.get("team_id") == away_id]
            inj_home_ids = [i["player_id"] for i in inj_home]
            inj_away_ids = [i["player_id"] for i in inj_away]
            abs_home = [i["player_name"] for i in inj_home]
            abs_away = [i["player_name"] for i in inj_away]

            # Get positions of injured players for weighted penalty (via squad cache)
            async def _injured_positions(inj_ids: list[int], team_id: int) -> list[str]:
                if not inj_ids:
                    return []
                try:
                    squad = await client.get_squad(team_id)
                    pid_to_pos = {p["player_id"]: p.get("position", "") for p in squad}
                    return [pid_to_pos.get(pid, "") for pid in inj_ids if pid in pid_to_pos]
                except Exception:
                    return []

            abs_pos_home, abs_pos_away = await asyncio.gather(
                _injured_positions(inj_home_ids, home_id),
                _injured_positions(inj_away_ids, away_id),
            )

            # Key players
            key_players_home = await client.get_team_key_players(home_id, league_id, inj_home_ids, topscorers)
            key_players_away = await client.get_team_key_players(away_id, league_id, inj_away_ids, topscorers)
            home_top_gpm = key_players_home[0]["goals_per_match"] if key_players_home else 0.0
            away_top_gpm = key_players_away[0]["goals_per_match"] if key_players_away else 0.0

            # Lineups
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

            # Enrich lineup players with individual season stats (goals, assists, rating)
            try:
                home_pstats, away_pstats = await asyncio.gather(
                    client.get_team_player_stats(home_id, league_id),
                    client.get_team_player_stats(away_id, league_id),
                )

                def _enrich_lineup(lineup: list[dict], pstats: dict, inj_ids: list[int]) -> list[dict]:
                    enriched = []
                    for p in lineup:
                        norm = p["name"].lower().strip()
                        # Try exact, then last-name match
                        st = pstats.get(norm)
                        if st is None:
                            last = norm.split()[-1]
                            st = next((v for k, v in pstats.items() if k.split()[-1] == last), None)
                        is_absent = (st["player_id"] in inj_ids) if (st and st.get("player_id")) else False
                        enriched.append({
                            **p,
                            "goals": st["goals"] if st else 0,
                            "assists": st["assists"] if st else 0,
                            "rating": st["rating"] if st else 0.0,
                            "games": st["games"] if st else 0,
                            "is_absent": is_absent,
                        })
                    return enriched

                lineup_home_list = _enrich_lineup(lineup_home_list, home_pstats, inj_home_ids)
                lineup_away_list = _enrich_lineup(lineup_away_list, away_pstats, inj_away_ids)
            except Exception as _e:
                logger.debug("Lineup stats enrichment failed: %s", _e)

            # Goals averages
            gs_h = stats_h.get("goals_scored_avg_home")
            gc_h = stats_h.get("goals_conceded_avg_home")
            gs_a = stats_a.get("goals_scored_avg_away")
            gc_a = stats_a.get("goals_conceded_avg_away")

            # Best odds
            odds_1x2 = odds.get("1x2", {})

            def _best(d: dict) -> float:
                return max((float(v) for v in d.values() if v), default=0.0) if d else 0.0

            odds_h_val = _best(odds_1x2.get("H", {}))
            odds_d_val = _best(odds_1x2.get("D", {}))
            odds_a_val = _best(odds_1x2.get("A", {}))

            # Key player absent flags
            key_absent_home = any(p.get("is_absent") for p in key_players_home)
            key_absent_away = any(p.get("is_absent") for p in key_players_away)

            # Probability calculation (with enriched data + position-based injury weights)
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
                absent_positions_home=abs_pos_home or None,
                absent_positions_away=abs_pos_away or None,
                lineup_confirmed=(lineup_status == "confirmed"),
                home_goals_scored_avg=gs_h, home_goals_conceded_avg=gc_h,
                away_goals_scored_avg=gs_a, away_goals_conceded_avg=gc_a,
                xg_home=stats_h.get("home_xg_avg"),
                xg_away=stats_a.get("away_xg_avg"),
                btts_pct_home=stats_h.get("home_btts_pct"),
                btts_pct_away=stats_a.get("away_btts_pct"),
                # Enriched data (0 extra API calls)
                possession_home=stats_h.get("home_possession_avg"),
                possession_away=stats_a.get("away_possession_avg"),
                corners_pg_home=stats_h.get("home_corners_pg"),
                corners_pg_away=stats_a.get("away_corners_pg"),
                cards_pg_home=stats_h.get("home_yellow_cards_pg"),
                cards_pg_away=stats_a.get("away_yellow_cards_pg"),
                rest_days_home=home_rest,
                rest_days_away=away_rest,
            )

            # V6 ML blending
            ML_WEIGHT = 0.45
            if _v6 is not None:
                try:
                    from src.ml.football_model import MODEL_FEATURES_NO_XG
                    # Use active_features from loaded model (includes xG if trained with it)
                    active_feats = getattr(_v6, "active_features", MODEL_FEATURES_NO_XG)
                    live_feats = build_live_features(
                        stats_h=stats_h, stats_a=stats_a,
                        home_rank=home_rank, away_rank=away_rank,
                        h2h_raw=h2h_raw, home_id=home_id,
                        odds_1x2=odds.get("1x2", {}),
                        league_name=league_name, fixture_dt=fixture_dt,
                        home_team_name=home_name, away_team_name=away_name,
                        home_rest_days=home_rest, away_rest_days=away_rest,
                        weather=weather_data,
                        key_player_absent_home=key_absent_home,
                        key_player_absent_away=key_absent_away,
                    )
                    X = np.array([[live_feats.get(feat, 0.0) for feat in active_feats]])
                    X = np.nan_to_num(X, nan=0.0)
                    ml_p = _v6.predict_proba(X)[0]
                    ph = ML_WEIGHT * float(ml_p[0]) + (1 - ML_WEIGHT) * calc.home_prob
                    pd_ = ML_WEIGHT * float(ml_p[1]) + (1 - ML_WEIGHT) * calc.draw_prob
                    pa = ML_WEIGHT * float(ml_p[2]) + (1 - ML_WEIGHT) * calc.away_prob
                    tot = ph + pd_ + pa
                    calc.home_prob = round(ph / tot, 4)
                    calc.draw_prob = round(pd_ / tot, 4)
                    calc.away_prob = round(pa / tot, 4)
                    if calc.edges:
                        for key, prob in [("H", calc.home_prob), ("D", calc.draw_prob), ("A", calc.away_prob)]:
                            bk_odds = odds_1x2.get(key, {})
                            best_o = max((float(v) for v in bk_odds.values() if v and float(v) > 1), default=0.0)
                            if best_o > 1:
                                calc.edges[key] = round(prob - 1 / best_o, 4)
                except Exception as e:
                    logger.debug("V6 blend error: %s", e)

            # BTTS and Over2.5 edge calculation via Poisson lambdas
            btts_edge: float | None = None
            over25_edge: float | None = None
            btts_model_prob: float | None = None
            over25_model_prob: float | None = None

            if calc.lambda_home and calc.lambda_away:
                lh = calc.lambda_home
                la = calc.lambda_away
                # BTTS: P(home scores ≥ 1) × P(away scores ≥ 1)
                p_home_scores = 1 - math.exp(-lh)
                p_away_scores = 1 - math.exp(-la)
                btts_model_prob = round(p_home_scores * p_away_scores, 4)
                # Over 2.5: P(total goals > 2) via combined Poisson lambda
                lambda_total = lh + la
                p_le2 = sum(
                    math.exp(-lambda_total) * lambda_total ** k / math.factorial(k)
                    for k in range(3)
                )
                over25_model_prob = round(1 - p_le2, 4)
                # Compare to bookmaker odds
                btts_market = odds.get("btts", {})
                btts_yes_bk = btts_market.get("Yes", {})
                best_btts = max((float(v) for v in btts_yes_bk.values() if v), default=0.0) if isinstance(btts_yes_bk, dict) else 0.0
                if best_btts > 1:
                    btts_edge = round(btts_model_prob - 1 / best_btts, 4)
                ou_market = odds.get("over_under", {})
                over25_bk = ou_market.get("Over 2.5", {}) or ou_market.get("Over2.5", {})
                best_over25 = max((float(v) for v in over25_bk.values() if v), default=0.0) if isinstance(over25_bk, dict) else 0.0
                if best_over25 > 1:
                    over25_edge = round(over25_model_prob - 1 / best_over25, 4)

            # H2H summary
            h2h_goals = None
            if h2h_raw:
                goals = [m.get("score_h", 0) + m.get("score_a", 0) for m in h2h_raw if m.get("score_h") is not None]
                if goals:
                    h2h_goals = round(sum(goals) / len(goals), 2)

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

            # Weather summary for display
            weather_str = None
            if weather_data:
                parts = [f"{weather_data['temp_c']:.0f}°C"]
                if weather_data.get("is_rainy"):
                    parts.append(f"pluie ({weather_data.get('rain_1h_mm', 0):.1f}mm/h)")
                if weather_data.get("is_windy"):
                    parts.append(f"vent {weather_data['wind_speed_ms']:.0f}m/s")
                elif weather_data.get("wind_speed_ms"):
                    parts.append(f"vent {weather_data['wind_speed_ms']:.0f}m/s")
                weather_str = ", ".join(parts)

            return AIScanMatch(
                sport="football",
                home_team=home_name, away_team=away_name,
                league=league_name, date=fixture_dt_str,
                venue=venue_name, odds=odds,
                weather=weather_str,
                form_home=form_home or None, form_away=form_away or None,
                form_home_detail=form_home_detail,
                form_away_detail=form_away_detail,
                form_home_home=form_home_home_str,
                form_away_away=form_away_away_str,
                position_home=home_rank, position_away=away_rank,
                key_absences_home=abs_home, key_absences_away=abs_away,
                h2h_summary=client._h2h_summary(h2h_raw, home_id) if h2h_raw else None,
                h2h_avg_goals=h2h_goals, h2h_details=h2h_raw,
                fixture_id=fid,
                lineup_status=lineup_status,
                lineup_home=lineup_home_list, lineup_away=lineup_away_list,
                key_players_home=key_players_home, key_players_away=key_players_away,
                home_goals_scored_avg5=gs_h, home_goals_conceded_avg5=gc_h,
                away_goals_scored_avg5=gs_a, away_goals_conceded_avg5=gc_a,
                home_clean_sheets=stats_h.get("clean_sheets_home"),
                away_clean_sheets=stats_a.get("clean_sheets_away"),
                home_btts_pct=stats_h.get("home_btts_pct"),
                away_btts_pct=stats_a.get("away_btts_pct"),
                home_possession_avg=stats_h.get("home_possession_avg"),
                away_possession_avg=stats_a.get("away_possession_avg"),
                home_shots_pg=stats_h.get("home_shots_pg"),
                away_shots_pg=stats_a.get("away_shots_pg"),
                home_corners_avg=stats_h.get("home_corners_pg"),
                away_corners_avg=stats_a.get("away_corners_pg"),
                home_cards_avg=stats_h.get("home_yellow_cards_pg"),
                away_cards_avg=stats_a.get("away_yellow_cards_pg"),
                home_red_cards_pg=stats_h.get("home_red_cards_pg"),
                away_red_cards_pg=stats_a.get("away_red_cards_pg"),
                home_over25_pct=stats_h.get("home_over25_pct"),
                away_over25_pct=stats_a.get("away_over25_pct"),
                home_rest_days=home_rest,
                away_rest_days=away_rest,
                home_top_scorer=key_players_home[0]["name"] if key_players_home else None,
                away_top_scorer=key_players_away[0]["name"] if key_players_away else None,
                btts_model_prob=btts_model_prob,
                over25_model_prob=over25_model_prob,
                btts_edge=btts_edge,
                over25_edge=over25_edge,
                home_current_streak=_streak(form_home),
                away_current_streak=_streak(form_away),
                model_prob_home=calc.home_prob, model_prob_draw=calc.draw_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges, data_quality=calc.data_quality,
                data_score=calc.data_score,
                lambda_home=calc.lambda_home, lambda_away=calc.lambda_away,
            )
        except Exception as exc:
            logger.error("Error processing fixture %s: %s", fix.get("fixture", {}).get("id"), exc)
            return None

    # Process all fixtures with semaphore
    sem = asyncio.Semaphore(2)

    async def _guarded(fix):
        async with sem:
            return await _process_fixture(fix)

    results = await asyncio.gather(*[_guarded(f) for f in fixtures])
    matches_out = [m for m in results if m is not None and (m.data_score or 0) >= DATA_SCORE_MIN]

    duration = time.time() - t0

    # Persist odds snapshots (non-blocking)
    _save_odds_snapshots(matches_out, "football")

    # Store in cache — one global key + per-league keys
    matches_dicts = [m.model_dump() for m in matches_out]

    cache_payload = {
        "_cached_at": time.time(),
        "duration": duration,
        "matches": matches_dicts,
    }

    # Global key (used when no league filter)
    scan_key_all = hashlib.md5(f"football__{timeframe}".encode()).hexdigest()[:12]
    cache_set(f"scan:football:{scan_key_all}", cache_payload, ttl=SCAN_CACHE_TTL)

    # Also store under the "all leagues" key pattern the scanner API uses
    all_leagues_sorted = ",".join(sorted(effective_leagues))
    scan_key_full = hashlib.md5(f"football_{all_leagues_sorted}_{timeframe}".encode()).hexdigest()[:12]
    cache_set(f"scan:football:{scan_key_full}", cache_payload, ttl=SCAN_CACHE_TTL)

    # Per-league keys (for filtered reads)
    leagues_in_scan = set()
    for m_dict in matches_dicts:
        league_name = m_dict.get("league", "")
        if league_name:
            leagues_in_scan.add(league_name)

    for league_name in leagues_in_scan:
        league_matches = [m for m in matches_dicts if m.get("league") == league_name]
        league_payload = {
            "_cached_at": time.time(),
            "duration": duration,
            "matches": league_matches,
        }
        league_key = hashlib.md5(f"football_league_{league_name}".encode()).hexdigest()[:12]
        cache_set(f"scan:football:league:{league_key}", league_payload, ttl=SCAN_CACHE_TTL)

    # Metadata
    cache_set("scan:meta:last_football", time.time(), ttl=86400)

    # File backup
    try:
        AF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        backup_file = AF_CACHE_DIR / f"scan_result_{scan_key_all}.json"
        backup_file.write_text(json.dumps(cache_payload, ensure_ascii=False, default=str), encoding="utf-8")
    except Exception as exc:
        logger.warning("File backup failed: %s", exc)

    logger.info(
        "Football scan completed: %d matches (%d passed filter) in %.1fs",
        len(fixtures), len(matches_out), duration,
    )


# ---------------------------------------------------------------------------
# Tennis scan
# ---------------------------------------------------------------------------

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
    from src.data.sofascore_client import SofascoreClient
    from src.services.probability_calculator import calculate_tennis
    from src.api.schemas import AIScanMatch

    t0 = time.time()
    sofa = SofascoreClient()

    # Load ML model (optional — fallback to rule-based if unavailable)
    tennis_ml_model, tennis_snapshot = _load_tennis_model()
    if tennis_ml_model:
        from src.features.tennis_features import TENNIS_FEATURE_COLUMNS, build_tennis_live_features as _tennis_live_feats
        _col_medians = np.array(tennis_snapshot.get("col_medians", [np.nan] * len(TENNIS_FEATURE_COLUMNS)))
        logger.info("Tennis ML model loaded (%d feature columns)", len(TENNIS_FEATURE_COLUMNS))
    else:
        logger.info("Tennis ML model not available — using rule-based only")

    # Fetch matches from SofaScore (sync client, run in executor)
    loop = asyncio.get_event_loop()
    try:
        raw_matches = await loop.run_in_executor(
            None, lambda: sofa.get_tennis_matches(timeframe="48h")
        )
    except Exception as exc:
        logger.error("Tennis scan failed: %s", exc)
        sofa.close()
        return

    sofa.close()
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

    logger.info("Tennis scan completed: %d matches in %.1fs", len(matches), duration)


# ---------------------------------------------------------------------------
# NBA scan
# ---------------------------------------------------------------------------

NBA_SCAN_INTERVAL = 60 * 60  # 1h


def _load_nba_model():
    """Load NBA ML model + team stats snapshot. Returns (model, snapshot) or (None, None)."""
    try:
        from src.ml.nba_model import NBAModel
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
    """Run NBA scan — fetch games + odds + stats from API-Sports Basketball."""
    from src.data.api_basketball_client import ApiBasketballClient
    from src.services.probability_calculator import calculate_nba
    from src.api.schemas import AIScanMatch

    t0 = time.time()
    bball = ApiBasketballClient()

    nba_ml_model, nba_snapshot = _load_nba_model()
    if nba_ml_model:
        from src.features.nba_features import NBA_FEATURE_COLUMNS, build_nba_live_features as _nba_feats
        _nba_medians = np.array(nba_snapshot.get("col_medians", [np.nan] * len(NBA_FEATURE_COLUMNS)))
        logger.info("NBA ML model loaded (%d feature columns)", len(NBA_FEATURE_COLUMNS))
    else:
        logger.info("NBA ML model not available — using rule-based only")

    # 1. Fetch fixtures (today + tomorrow)
    try:
        fixtures = await bball.get_fixtures_range(timeframe="48h")
    except Exception as exc:
        logger.error("NBA fixtures fetch failed: %s", exc)
        return
    if not fixtures:
        logger.info("NBA scan: no upcoming fixtures")
        cache_set("scan:nba:all", {"_cached_at": time.time(), "duration": 0, "matches": []}, ttl=SCAN_CACHE_TTL + 300)
        return

    logger.info("NBA scan: %d fixtures found", len(fixtures))

    # 2. Fetch standings (1 API call, cached 24h)
    standings = await bball.get_standings()
    standings_by_name: dict[str, dict] = {}
    standings_by_id: dict[int, dict] = {}
    for s in standings:
        standings_by_name[s["team_name"]] = s
        if s.get("team_id"):
            standings_by_id[s["team_id"]] = s

    # 3. Process each fixture: fetch odds + team stats + last games
    matches: list[AIScanMatch] = []
    teams_data = nba_snapshot.get("teams", {}) if nba_snapshot else {}

    for fix in fixtures:
        try:
            home = fix["home_name"]
            away = fix["away_name"]
            home_id = fix.get("home_id")
            away_id = fix.get("away_id")
            game_id = fix.get("game_id")

            # Fetch odds for this game
            odds_data = await bball.get_odds(game_id) if game_id else {}
            h2h = odds_data.get("h2h", {})
            totals = odds_data.get("totals", {})

            odds_home = h2h.get("home") or 0
            odds_away = h2h.get("away") or 0
            odds_over = totals.get("over")
            odds_under = totals.get("under")
            total_line = totals.get("line")

            if not odds_home or not odds_away or odds_home <= 1.0 or odds_away <= 1.0:
                # Fallback: skip game without odds
                continue

            # Fetch live stats per team (cached 24h)
            h_team_stats = await bball.get_team_stats(home_id) if home_id else {}
            a_team_stats = await bball.get_team_stats(away_id) if away_id else {}

            # Fetch last 10 games per team (cached 24h) — ESPN fallback if API-Sports blocks `last`
            h_last = await bball.get_last_games(home_id, team_name=home) if home_id else []
            a_last = await bball.get_last_games(away_id, team_name=away) if away_id else []

            # Compute live stats from API data
            h_standing = standings_by_id.get(home_id) or standings_by_name.get(home, {})
            a_standing = standings_by_id.get(away_id) or standings_by_name.get(away, {})

            h_live = bball.compute_live_stats(h_last, h_standing, h_team_stats)
            a_live = bball.compute_live_stats(a_last, a_standing, a_team_stats)

            # Also use snapshot data as fallback for ML features
            h_snap = teams_data.get(home, {})
            a_snap = teams_data.get(away, {})

            # Merge: prefer live data, fallback to snapshot
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
                        rest_days_home=h_live.get("rest_days"),
                        rest_days_away=a_live.get("rest_days"),
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

            odds_dict = {
                "winner": {
                    "Home": odds_home,
                    "Away": odds_away,
                },
            }
            if h2h.get("bookmakers"):
                odds_dict["winner_bookmakers"] = h2h["bookmakers"]
            if odds_over:
                odds_dict["over_under"] = {"Over": odds_over, "Under": odds_under, "line": total_line}

            # Build season record strings
            h_record = f"{h_standing.get('wins', '?')}-{h_standing.get('losses', '?')}" if h_standing else None
            a_record = f"{a_standing.get('wins', '?')}-{a_standing.get('losses', '?')}" if a_standing else None

            matches.append(AIScanMatch(
                sport="nba",
                player1=home,
                player2=away,
                home_team=home,
                away_team=away,
                league=fix.get("league", "NBA"),
                date=fix.get("date", ""),
                venue=fix.get("venue"),
                odds=odds_dict,
                model_prob_home=calc.home_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges,
                data_quality=calc.data_quality,
                data_score=calc.data_score,
                nba_ml_used=_nba_ml_used,
                # Stats from live API data
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
                # Enriched stats from API-Sports
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
                home_conference=h_live.get("conference"),
                away_conference=a_live.get("conference"),
                home_conference_rank=h_live.get("conference_rank"),
                away_conference_rank=a_live.get("conference_rank"),
                home_season_record=h_record,
                away_season_record=a_record,
                home_last_5=h_live.get("last_5_results", []),
                away_last_5=a_live.get("last_5_results", []),
                position_home=h_live.get("conference_rank"),
                position_away=a_live.get("conference_rank"),
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
    logger.info("NBA scan completed: %d games in %.1fs", len(matches), duration)


# ---------------------------------------------------------------------------
# Rugby scan
# ---------------------------------------------------------------------------

RUGBY_SCAN_INTERVAL = 60 * 60  # 1h


def _load_rugby_model():
    """Load rugby ML model + team stats snapshot. Returns (model, snapshot) or (None, None)."""
    try:
        from src.ml.rugby_model import RugbyModel
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
    """Run rugby scan — fetch games + odds + stats from API-Sports Rugby."""
    from src.data.api_rugby_client import ApiRugbyClient
    from src.services.probability_calculator import calculate_rugby
    from src.api.schemas import AIScanMatch

    t0 = time.time()
    rugby_api = ApiRugbyClient()

    rugby_ml_model, rugby_snapshot = _load_rugby_model()
    if rugby_ml_model:
        from src.features.rugby_features import RUGBY_FEATURE_COLUMNS, build_rugby_live_features as _rugby_feats
        _rugby_medians = np.array(rugby_snapshot.get("col_medians", [np.nan] * len(RUGBY_FEATURE_COLUMNS)))
        logger.info("Rugby ML model loaded (%d feature columns)", len(RUGBY_FEATURE_COLUMNS))
    else:
        logger.info("Rugby ML model not available — using rule-based only")

    # 1. Fetch fixtures
    try:
        fixtures = await rugby_api.get_fixtures_range(timeframe="48h")
    except Exception as exc:
        logger.error("Rugby fixtures fetch failed: %s", exc)
        return
    if not fixtures:
        logger.info("Rugby scan: no upcoming fixtures")
        cache_set("scan:rugby:all", {"_cached_at": time.time(), "duration": 0, "matches": []}, ttl=SCAN_CACHE_TTL + 300)
        return

    logger.info("Rugby scan: %d fixtures found", len(fixtures))

    # 2. Fetch standings per league (cached 24h)
    standings_by_id: dict[int, dict] = {}
    for league_info in rugby_api.get_tracked_leagues():
        league_standings = await rugby_api.get_standings(league_info["id"])
        for s in league_standings:
            if s.get("team_id"):
                standings_by_id[s["team_id"]] = s

    matches: list[AIScanMatch] = []
    teams_data = rugby_snapshot.get("teams", {}) if rugby_snapshot else {}

    for fix in fixtures:
        try:
            home = fix["home_name"]
            away = fix["away_name"]
            home_id = fix.get("home_id")
            away_id = fix.get("away_id")
            game_id = fix.get("game_id")
            league = fix.get("league", "Rugby Union")
            league_id = fix.get("league_id")

            # Fetch odds
            odds_data = await rugby_api.get_odds(game_id) if game_id else {}
            h2h = odds_data.get("h2h", {})
            totals = odds_data.get("totals", {})

            odds_home = h2h.get("home") or 0
            odds_draw = h2h.get("draw")
            odds_away = h2h.get("away") or 0
            odds_over = totals.get("over")
            odds_under = totals.get("under")
            total_line = totals.get("line")

            if not odds_home or not odds_away or odds_home <= 1.0 or odds_away <= 1.0:
                continue

            # Fetch live stats
            h_last = await rugby_api.get_last_games(home_id) if home_id else []
            a_last = await rugby_api.get_last_games(away_id) if away_id else []

            h_standing = standings_by_id.get(home_id, {})
            a_standing = standings_by_id.get(away_id, {})

            h_team_stats = await rugby_api.get_team_stats(home_id, league_id) if home_id and league_id else {}
            a_team_stats = await rugby_api.get_team_stats(away_id, league_id) if away_id and league_id else {}

            h_live = rugby_api.compute_live_stats(h_last, h_standing, h_team_stats)
            a_live = rugby_api.compute_live_stats(a_last, a_standing, a_team_stats)

            h_snap = teams_data.get(home, {})
            a_snap = teams_data.get(away, {})

            def _pick(live: dict, snap: dict, key: str):
                return live.get(key) if live.get(key) is not None else snap.get(key)

            # Rule-based baseline (1X2 with draw)
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

            odds = {
                "1x2": {
                    "H": odds_home,
                    "A": odds_away,
                },
            }
            if odds_draw and float(odds_draw) > 1.0:
                odds["1x2"]["D"] = float(odds_draw)
            if odds_over:
                odds["over_under"] = {"Over": odds_over, "Under": odds_under, "line": total_line}

            matches.append(AIScanMatch(
                sport="rugby",
                home_team=home,
                away_team=away,
                player1=None,
                player2=None,
                league=league,
                date=fix.get("date", ""),
                odds=odds,
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
    logger.info("Rugby scan completed: %d matches in %.1fs", len(matches), duration)


# ---------------------------------------------------------------------------
# MLB scan
# ---------------------------------------------------------------------------

MLB_SCAN_INTERVAL = 60 * 60  # 1h
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
    """Run MLB scan — fetch games + odds + stats from API-Sports Baseball."""
    from src.data.api_baseball_client import ApiBaseballClient
    from src.services.probability_calculator import calculate_mlb
    from src.api.schemas import AIScanMatch

    t0 = time.time()
    bb = ApiBaseballClient()

    mlb_ml_model, mlb_snapshot = _load_mlb_model()
    if mlb_ml_model:
        from src.features.mlb_features import MLB_FEATURE_COLUMNS, build_mlb_live_features as _mlb_feats
        _mlb_medians = np.array(mlb_snapshot.get("col_medians", [np.nan] * len(MLB_FEATURE_COLUMNS)))
        logger.info("MLB ML model loaded (%d feature columns)", len(MLB_FEATURE_COLUMNS))
    else:
        logger.info("MLB ML model not available — using rule-based only")

    # 1. Fetch fixtures
    try:
        fixtures = await bb.get_fixtures_range(timeframe="48h")
    except Exception as exc:
        logger.error("MLB fixtures fetch failed: %s", exc)
        return
    if not fixtures:
        logger.info("MLB scan: no upcoming fixtures")
        cache_set("scan:mlb:all", {"_cached_at": time.time(), "duration": 0, "matches": []}, ttl=SCAN_CACHE_TTL + 300)
        return

    logger.info("MLB scan: %d fixtures found", len(fixtures))

    # 2. Fetch standings (cached 24h)
    standings = await bb.get_standings()
    standings_by_id: dict[int, dict] = {}
    standings_by_name: dict[str, dict] = {}
    for s in standings:
        standings_by_name[s["team_name"]] = s
        if s.get("team_id"):
            standings_by_id[s["team_id"]] = s

    matches: list[AIScanMatch] = []
    teams_data = mlb_snapshot.get("teams", {}) if mlb_snapshot else {}

    for fix in fixtures:
        try:
            home = fix["home_name"]
            away = fix["away_name"]
            home_id = fix.get("home_id")
            away_id = fix.get("away_id")
            game_id = fix.get("game_id")

            # Fetch odds
            odds_data = await bb.get_odds(game_id) if game_id else {}
            h2h = odds_data.get("h2h", {})
            totals = odds_data.get("totals", {})

            odds_home = h2h.get("home") or 0
            odds_away = h2h.get("away") or 0
            odds_over = totals.get("over")
            odds_under = totals.get("under")
            total_line = totals.get("line")

            if not odds_home or not odds_away or odds_home <= 1.0 or odds_away <= 1.0:
                continue

            # Fetch live stats
            h_team_stats = await bb.get_team_stats(home_id) if home_id else {}
            a_team_stats = await bb.get_team_stats(away_id) if away_id else {}
            h_last = await bb.get_last_games(home_id, team_name=home) if home_id else []
            a_last = await bb.get_last_games(away_id, team_name=away) if away_id else []

            h_standing = standings_by_id.get(home_id) or standings_by_name.get(home, {})
            a_standing = standings_by_id.get(away_id) or standings_by_name.get(away, {})

            h_live = bb.compute_live_stats(h_last, h_standing, h_team_stats)
            a_live = bb.compute_live_stats(a_last, a_standing, a_team_stats)

            h_snap = teams_data.get(home, {})
            a_snap = teams_data.get(away, {})

            def _pick(live: dict, snap: dict, key: str):
                return live.get(key) if live.get(key) is not None else snap.get(key)

            # Rule-based baseline
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
                        rest_days_home=h_live.get("rest_days"),
                        rest_days_away=a_live.get("rest_days"),
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

            odds_dict: dict = {
                "winner": {
                    "Home": odds_home,
                    "Away": odds_away,
                },
            }
            if h2h.get("bookmakers"):
                odds_dict["winner_bookmakers"] = h2h["bookmakers"]
            if odds_over:
                odds_dict["over_under"] = {"Over": odds_over, "Under": odds_under, "line": total_line}

            h_record = f"{h_standing.get('wins', '?')}-{h_standing.get('losses', '?')}" if h_standing else None
            a_record = f"{a_standing.get('wins', '?')}-{a_standing.get('losses', '?')}" if a_standing else None

            matches.append(AIScanMatch(
                sport="mlb",
                home_team=home,
                away_team=away,
                league="MLB",
                date=fix.get("date", ""),
                venue=fix.get("venue"),
                odds=odds_dict,
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
                position_home=h_live.get("division_rank"),
                position_away=a_live.get("division_rank"),
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
                # Enriched stats from API-Sports
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
                home_division=h_live.get("division"),
                away_division=a_live.get("division"),
                home_division_rank=h_live.get("division_rank"),
                away_division_rank=a_live.get("division_rank"),
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

    # File backup
    try:
        _MLB_FILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        scan_key = "mlb_latest"
        backup_file = _MLB_FILE_CACHE_DIR / f"scan_result_{scan_key}.json"
        backup_file.write_text(json.dumps(cache_payload, ensure_ascii=False, default=str), encoding="utf-8")
    except Exception as exc:
        logger.warning("MLB file backup failed: %s", exc)

    logger.info("MLB scan completed: %d games in %.1fs", len(matches), duration)


# ---------------------------------------------------------------------------
# PMU scan
# ---------------------------------------------------------------------------

PMU_SCAN_INTERVAL = 60 * 30  # 30 minutes (programme mis a jour souvent)
_PMU_FILE_CACHE_DIR = Path("data/cache/pmu")


def _load_pmu_models():
    """Charge les modeles PMU win + place si disponibles. Retourne (win_model, place_model) ou (None, None)."""
    try:
        from src.ml.pmu_model import PMUWinModel, PMUPlaceModel, MODEL_DIR_WIN, MODEL_DIR_PLACE
        if not (MODEL_DIR_WIN / "model.joblib").exists():
            return None, None
        if not (MODEL_DIR_PLACE / "model.joblib").exists():
            return None, None
        win_model = PMUWinModel.load_from_dir(MODEL_DIR_WIN)
        place_model = PMUPlaceModel.load_from_dir(MODEL_DIR_PLACE)
        return win_model, place_model
    except Exception as exc:
        logger.warning("PMU models not available: %s", exc)
        return None, None


async def run_pmu_scan():
    """Run PMU scan — recupere le programme du jour et calcule les edges."""
    from src.services.probability_calculator import calculate_pmu
    from src.api.schemas import PMURaceCard, PMURunnerCard

    t0 = time.time()

    # Charger les modeles PMU si disponibles
    win_model, place_model = _load_pmu_models()
    if win_model and place_model:
        from src.features.pmu_features import PMU_FEATURE_COLUMNS
        logger.info("PMU ML models loaded (%d features)", len(PMU_FEATURE_COLUMNS))
    else:
        logger.info("PMU ML models not available — using implied probabilities only")

    # Recuperer les courses PMU depuis la base de donnees (races du jour ou a venir)
    races_out: list[PMURaceCard] = []
    try:
        import datetime as _dt
        from src.database import SessionLocal
        from src.models.pmu_race import PMURace, PMURunner

        db = SessionLocal()
        today = _dt.date.today()
        races = (
            db.query(PMURace)
            .filter(PMURace.race_date >= today)
            .order_by(PMURace.race_date, PMURace.race_number)
            .all()
        )
        race_ids = {r.id for r in races}
        runners_all = (
            db.query(PMURunner)
            .filter(PMURunner.race_id.in_(race_ids), PMURunner.is_scratched.is_(False))
            .all()
        )
        db.close()

        # Regrouper les partants par course
        runners_by_race: dict[int, list[PMURunner]] = {}
        for ru in runners_all:
            runners_by_race.setdefault(ru.race_id, []).append(ru)

        for race in races:
            race_runners = runners_by_race.get(race.id, [])

            # Construire les runners cards avec enrichissement ML si dispo
            runner_dicts: list[dict] = []
            for ru in sorted(race_runners, key=lambda x: x.number):
                # Parsing last_5_positions JSON
                last5: list[int] | None = None
                if ru.last_5_positions:
                    try:
                        import json as _json_inner
                        last5 = _json_inner.loads(ru.last_5_positions)
                    except Exception:
                        pass

                runner_dicts.append({
                    "number": ru.number,
                    "horse_name": ru.horse_name,
                    "jockey": ru.jockey_name,
                    "trainer": ru.trainer_name,
                    "weight": ru.weight,
                    "odds": ru.odds_final,
                    "odds_morning": ru.odds_morning,
                    "form": ru.form_string,
                    "last_5": last5,
                    "model_prob_win": None,
                    "model_prob_place": None,
                    "edge_win": None,
                    "edge_place": None,
                })

            # Enrichir avec ML si disponible
            if win_model and place_model and runner_dicts:
                try:
                    from src.features.pmu_features import PMUFeatureBuilder, PMU_FEATURE_COLUMNS
                    import numpy as np
                    import json as _json

                    # Charger les medians du modele pour imputer les NaN
                    metadata_path = Path("models/pmu/win_model/metadata.json")
                    col_medians = None
                    if metadata_path.exists():
                        meta = _json.loads(metadata_path.read_text())
                        col_medians = np.array(meta.get("col_medians", []))

                    # Construire le feature builder avec l'historique complet
                    builder = PMUFeatureBuilder()

                    # Charger les courses passees pour construire les caches
                    db2 = SessionLocal()
                    past_races = (
                        db2.query(PMURace)
                        .filter(PMURace.race_date < today)
                        .order_by(PMURace.race_date)
                        .all()
                    )
                    past_race_ids = {r.id for r in past_races}
                    past_runners = (
                        db2.query(PMURunner)
                        .filter(PMURunner.race_id.in_(past_race_ids), PMURunner.is_scratched.is_(False))
                        .all()
                    )
                    db2.close()

                    # Alimenter les caches du builder avec les courses passees
                    past_runners_by_race: dict[int, list] = {}
                    for ru in past_runners:
                        past_runners_by_race.setdefault(ru.race_id, []).append(ru)

                    for pr in past_races:
                        for ru in past_runners_by_race.get(pr.id, []):
                            finish = ru.finish_position
                            if finish is None:
                                continue
                            builder._update_cache(
                                runner={
                                    "horse_name": ru.horse_name,
                                    "jockey_name": ru.jockey_name,
                                    "trainer_name": ru.trainer_name,
                                    "finish_position": finish,
                                    "weight": ru.weight,
                                },
                                race_date=pr.race_date,
                                hippodrome=pr.hippodrome,
                                race_type=pr.race_type,
                                distance=pr.distance or 0,
                                terrain=pr.terrain or "",
                                prize_pool=pr.prize_pool or 0,
                            )

                    logger.info(
                        "PMU feature builder: %d horses, %d jockeys, %d trainers in cache",
                        len(builder.horse_history),
                        len(builder.jockey_history),
                        len(builder.trainer_history),
                    )

                    # Construire les features pour les runners du jour
                    feat_rows = []
                    for rd in runner_dicts:
                        horse = rd.get("horse_name", "")
                        jockey = rd.get("jockey", "")
                        trainer = rd.get("trainer", "")
                        h_hist = builder.horse_history.get(horse, [])
                        j_hist = builder.jockey_history.get(jockey, [])
                        t_hist = builder.trainer_history.get(trainer, [])
                        c_hist = builder.combo_history.get((horse, jockey), [])

                        if h_hist:  # cheval a de l'historique
                            f = builder._build_features(
                                runner={
                                    "horse_name": horse,
                                    "jockey_name": jockey,
                                    "trainer_name": trainer,
                                    "weight": rd.get("weight"),
                                    "age": None,  # pas dispo en live
                                    "number": rd.get("number"),
                                    "odds_final": rd.get("odds"),
                                },
                                horse=horse,
                                jockey=jockey,
                                trainer=trainer,
                                h_hist=h_hist,
                                j_hist=j_hist,
                                t_hist=t_hist,
                                c_hist=c_hist,
                                race_date=race.race_date,
                                hippodrome=race.hippodrome or "",
                                race_type=race.race_type or "",
                                distance=race.distance or 0,
                                terrain=race.terrain or "",
                                prize_pool=race.prize_pool or 0,
                                num_runners_race=len(runner_dicts),
                                is_quinteplus=int(bool(race.is_quinteplus)),
                            )
                        else:  # pas d'historique - features minimales
                            odds_val = rd.get("odds")
                            implied = (1.0 / float(odds_val)) if odds_val and float(odds_val) > 1.0 else np.nan
                            f = {col: np.nan for col in PMU_FEATURE_COLUMNS}
                            f["odds_implied_prob"] = implied
                            f["num_runners"] = float(len(runner_dicts))
                            f["post_position"] = float(rd.get("number", 0))
                            f["is_quinteplus"] = float(int(bool(race.is_quinteplus)))
                            # Remplir jockey/trainer stats meme sans historique cheval
                            if j_hist:
                                f["jockey_win_rate_20"] = builder._win_rate(j_hist, 20)
                                f["jockey_place_rate_20"] = builder._place_rate(j_hist, 20)
                            if t_hist:
                                f["trainer_win_rate_20"] = builder._win_rate(t_hist, 20)
                                f["trainer_place_rate_20"] = builder._place_rate(t_hist, 20)

                        feat_rows.append(f)

                    X = np.array([[r.get(col, np.nan) for col in PMU_FEATURE_COLUMNS] for r in feat_rows], dtype=float)

                    # Imputer NaN avec les medians du training (pas 0!)
                    if col_medians is not None and len(col_medians) == X.shape[1]:
                        for col_idx in range(X.shape[1]):
                            mask = np.isnan(X[:, col_idx])
                            X[mask, col_idx] = col_medians[col_idx]
                    else:
                        X = np.where(np.isnan(X), 0.0, X)

                    proba_win = win_model.predict_proba(X)
                    proba_place = place_model.predict_proba(X)

                    for i, rd in enumerate(runner_dicts):
                        rd["model_prob_win"] = round(float(proba_win[i]), 4)
                        rd["model_prob_place"] = round(float(proba_place[i]), 4)
                        # Stocker le nb de features non-NaN pour data quality
                        rd["_features_available"] = int(np.sum(~np.isnan(np.array([feat_rows[i].get(c, np.nan) for c in PMU_FEATURE_COLUMNS]))))

                    # Enrichir avec stats pour le frontend
                    for i, rd in enumerate(runner_dicts):
                        horse = rd.get("horse_name", "")
                        jockey = rd.get("jockey", "")
                        trainer = rd.get("trainer", "")
                        h_hist = builder.horse_history.get(horse, [])
                        j_hist = builder.jockey_history.get(jockey, [])
                        t_hist = builder.trainer_history.get(trainer, [])

                        if h_hist:
                            rd["horse_win_rate"] = round(builder._win_rate(h_hist, 10), 3)
                            rd["horse_place_rate"] = round(builder._place_rate(h_hist, 10), 3)
                            rest = builder._rest_days(h_hist, race.race_date)
                            rd["rest_days"] = rest
                            rd["horse_runs"] = len(h_hist)
                        if j_hist:
                            rd["jockey_win_rate"] = round(builder._win_rate(j_hist, 20), 3)
                            rd["jockey_place_rate"] = round(builder._place_rate(j_hist, 20), 3)
                            rd["jockey_runs"] = len(j_hist)
                        if t_hist:
                            rd["trainer_win_rate"] = round(builder._win_rate(t_hist, 20), 3)
                            rd["trainer_place_rate"] = round(builder._place_rate(t_hist, 20), 3)
                            rd["trainer_runs"] = len(t_hist)

                except Exception as ml_exc:
                    logger.error("PMU ML enrichment failed: %s", ml_exc, exc_info=True)

            # Calculer edges via probability_calculator
            enriched = calculate_pmu(runner_dicts)

            runner_cards = []
            for rd in enriched:
                try:
                    runner_cards.append(PMURunnerCard(
                        number=rd["number"],
                        horse_name=rd["horse_name"],
                        jockey=rd.get("jockey"),
                        trainer=rd.get("trainer"),
                        weight=rd.get("weight"),
                        odds=rd.get("odds"),
                        odds_morning=rd.get("odds_morning"),
                        model_prob_win=rd.get("model_prob_win"),
                        model_prob_place=rd.get("model_prob_place"),
                        edge_win=rd.get("edge_win"),
                        edge_place=rd.get("edge_place"),
                        form=rd.get("form"),
                        last_5=rd.get("last_5"),
                    ))
                except Exception:
                    continue

            races_out.append(PMURaceCard(
                race_id=race.race_id,
                hippodrome=race.hippodrome,
                race_number=race.race_number,
                race_type=race.race_type,
                distance=race.distance,
                terrain=race.terrain,
                post_time=race.race_time,
                prize_pool=race.prize_pool,
                num_runners=race.num_runners or len(runner_cards),
                is_quinteplus=race.is_quinteplus,
                runners=runner_cards,
            ))

    except Exception as exc:
        logger.error("PMU scan failed: %s", exc)
        return

    duration = time.time() - t0

    cache_payload = {
        "_cached_at": time.time(),
        "duration": duration,
        "races": [r.model_dump() for r in races_out],
    }
    cache_set("scan:pmu:all", cache_payload, ttl=PMU_SCAN_INTERVAL)
    cache_set("scan:meta:last_pmu", time.time(), ttl=86400)

    # File backup
    try:
        _PMU_FILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        backup_file = _PMU_FILE_CACHE_DIR / "scan_result_pmu_latest.json"
        backup_file.write_text(json.dumps(cache_payload, ensure_ascii=False, default=str), encoding="utf-8")
    except Exception as exc:
        logger.warning("PMU file backup failed: %s", exc)

    logger.info("PMU scan completed: %d races in %.1fs", len(races_out), duration)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def main():
    logger.info("Scan worker starting...")

    # Initial scan on startup (each wrapped to avoid crashing the whole worker)
    for scan_name, scan_fn in [
        ("football", run_football_scan),
        ("tennis", run_tennis_scan),
        ("NBA", run_nba_scan),
        ("rugby", run_rugby_scan),
        ("MLB", run_mlb_scan),
    ]:
        logger.info("Running initial %s scan...", scan_name)
        try:
            await scan_fn()
        except Exception as exc:
            logger.error("Initial %s scan failed: %s", scan_name, exc)

    # Schedule recurring scans
    async def _football_loop():
        while True:
            await asyncio.sleep(FOOTBALL_SCAN_INTERVAL)
            try:
                await run_football_scan()
            except Exception as exc:
                logger.error("Football scan error: %s", exc)

    async def _tennis_loop():
        while True:
            await asyncio.sleep(TENNIS_SCAN_INTERVAL)
            try:
                await run_tennis_scan()
            except Exception as exc:
                logger.error("Tennis scan error: %s", exc)

    async def _nba_loop():
        while True:
            await asyncio.sleep(NBA_SCAN_INTERVAL)
            try:
                await run_nba_scan()
            except Exception as exc:
                logger.error("NBA scan error: %s", exc)

    async def _rugby_loop():
        while True:
            await asyncio.sleep(RUGBY_SCAN_INTERVAL)
            try:
                await run_rugby_scan()
            except Exception as exc:
                logger.error("Rugby scan error: %s", exc)

    async def _mlb_loop():
        while True:
            await asyncio.sleep(MLB_SCAN_INTERVAL)
            try:
                await run_mlb_scan()
            except Exception as exc:
                logger.error("MLB scan error: %s", exc)

    async def _pmu_loop():
        while True:
            await asyncio.sleep(PMU_SCAN_INTERVAL)
            try:
                await run_pmu_scan()
            except Exception as exc:
                logger.error("PMU scan error: %s", exc)

    logger.info("Worker running — football/tennis/nba/rugby/mlb/pmu every %ds", FOOTBALL_SCAN_INTERVAL)
    await asyncio.gather(_football_loop(), _tennis_loop(), _nba_loop(), _rugby_loop(), _mlb_loop(), _pmu_loop())


if __name__ == "__main__":
    asyncio.run(main())
