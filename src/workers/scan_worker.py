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

            if sport == "football":
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
             last_fix_home, last_fix_away, weather_data) = await asyncio.gather(
                client.get_standings(league_id),
                client.get_h2h(home_id, away_id),
                client.get_injuries(fid),
                client.get_team_stats(home_id, league_id),
                client.get_team_stats(away_id, league_id),
                client.get_odds(fid),
                client.get_last_fixture_date(home_id),
                client.get_last_fixture_date(away_id),
                get_match_weather(venue_city),
            )

            # Rest days calculation (0 extra cost — uses cached fixtures)
            home_rest = int((fixture_dt - last_fix_home).days) if last_fix_home else None
            away_rest = int((fixture_dt - last_fix_away).days) if last_fix_away else None

            # Topscorers (per league, cached in memory)
            if league_id not in topscorers_cache:
                topscorers_cache[league_id] = await client.get_topscorers(league_id)
            topscorers = topscorers_cache[league_id]

            home_rank = client._find_rank(standings_list, home_id)
            away_rank = client._find_rank(standings_list, away_id)

            form_home = client.form_to_bettracker(stats_h.get("form", ""))
            form_away = client.form_to_bettracker(stats_a.get("form", ""))

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
                    from src.ml.football_model import MODEL_FEATURES
                    live_feats = build_live_features(
                        stats_h=stats_h, stats_a=stats_a,
                        home_rank=home_rank, away_rank=away_rank,
                        h2h_raw=h2h_raw, home_id=home_id,
                        odds_1x2=odds.get("1x2", {}),
                        league_name=league_name, fixture_dt=fixture_dt,
                        home_rest_days=home_rest, away_rest_days=away_rest,
                        weather=weather_data,
                        key_player_absent_home=key_absent_home,
                        key_player_absent_away=key_absent_away,
                    )
                    X = np.array([[live_feats.get(feat, 0.0) for feat in MODEL_FEATURES]])
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
                form_home_home=None, form_away_away=None,
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


async def run_tennis_scan():
    """Run a full tennis scan and store results in cache."""
    from src.data.tennis_client import TennisClient
    from src.services.probability_calculator import calculate_tennis
    from src.api.schemas import AIScanMatch

    t0 = time.time()
    client = TennisClient()

    # Load ML model (optional — fallback to rule-based if unavailable)
    tennis_ml_model, tennis_snapshot = _load_tennis_model()
    if tennis_ml_model:
        from src.features.tennis_features import TENNIS_FEATURE_COLUMNS, build_tennis_live_features as _tennis_live_feats
        _col_medians = np.array(tennis_snapshot.get("col_medians", [np.nan] * len(TENNIS_FEATURE_COLUMNS)))
        logger.info("Tennis ML model loaded (%d feature columns)", len(TENNIS_FEATURE_COLUMNS))
    else:
        logger.info("Tennis ML model not available — using rule-based only")

    # Run sync client in executor
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, lambda: client.get_matches(timeframe="48h", force=True)
        )
    except Exception as exc:
        logger.error("Tennis scan failed: %s", exc)
        return

    raw_matches = result.get("matches", [])
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
                p1_serve_stats=_p1_serve_stats, p2_serve_stats=_p2_serve_stats,
                tennis_ml_used=_tennis_ml_used,
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
    """Run NBA scan — fetch upcoming games with odds and compute ML edges."""
    from src.data.nba_client import NBAClient
    from src.services.probability_calculator import calculate_nba
    from src.api.schemas import AIScanMatch

    t0 = time.time()
    client = NBAClient()

    nba_ml_model, nba_snapshot = _load_nba_model()
    if nba_ml_model:
        from src.features.nba_features import NBA_FEATURE_COLUMNS, build_nba_live_features as _nba_feats
        _nba_medians = np.array(nba_snapshot.get("col_medians", [np.nan] * len(NBA_FEATURE_COLUMNS)))
        logger.info("NBA ML model loaded (%d feature columns)", len(NBA_FEATURE_COLUMNS))
    else:
        logger.info("NBA ML model not available — using rule-based only")

    loop = asyncio.get_event_loop()
    try:
        raw_games = await loop.run_in_executor(None, lambda: client.get_matches(timeframe="48h"))
    except Exception as exc:
        logger.error("NBA scan failed: %s", exc)
        return

    matches: list[AIScanMatch] = []
    teams_data = nba_snapshot.get("teams", {}) if nba_snapshot else {}

    for g in raw_games:
        try:
            home = g["home_team"]
            away = g["away_team"]
            odds_home = float(g.get("odds_home") or 0)
            odds_away = float(g.get("odds_away") or 0)
            odds_over = g.get("odds_over")
            odds_under = g.get("odds_under")
            total_line = g.get("total_line")

            if odds_home <= 1.0 or odds_away <= 1.0:
                continue

            # Get team stats from snapshot
            h_stats = teams_data.get(home, {})
            a_stats = teams_data.get(away, {})

            # Rule-based baseline
            calc = calculate_nba(
                odds_home=odds_home,
                odds_away=odds_away,
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
                home_win_rate=h_stats.get("win_rate_10"),
                away_win_rate=a_stats.get("win_rate_10"),
                home_pt_diff=h_stats.get("pt_diff_10"),
                away_pt_diff=a_stats.get("pt_diff_10"),
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
                    )
                    feat_array = np.array([[feat_dict.get(col, np.nan) for col in NBA_FEATURE_COLUMNS]])
                    for col_idx in range(feat_array.shape[1]):
                        if np.isnan(feat_array[0, col_idx]):
                            feat_array[0, col_idx] = _nba_medians[col_idx] if not np.isnan(_nba_medians[col_idx]) else 0.0
                    ml_prob_home = float(nba_ml_model.predict_proba(feat_array)[0])
                    ml_prob_away = 1.0 - ml_prob_home
                    # Blend: 70% ML + 30% rule-based
                    rule_h = calc.home_prob or 0.5
                    rule_a = calc.away_prob or 0.5
                    blend_h = round(0.70 * ml_prob_home + 0.30 * rule_h, 4)
                    blend_a = round(0.70 * ml_prob_away + 0.30 * rule_a, 4)
                    edges_blended: dict = {}
                    if odds_home > 1.0:
                        edges_blended["Home"] = round(blend_h - 1.0 / odds_home, 4)
                    if odds_away > 1.0:
                        edges_blended["Away"] = round(blend_a - 1.0 / odds_away, 4)
                    # Carry over over/under edges from rule-based (ML doesn't predict totals)
                    for k in ["Over", "Under"]:
                        if k in (calc.edges or {}):
                            edges_blended[k] = calc.edges[k]
                    from dataclasses import replace as _replace
                    calc = _replace(calc, home_prob=blend_h, away_prob=blend_a, edges=edges_blended)
                    _nba_ml_used = True
                except Exception as ml_exc:
                    logger.debug("NBA ML prediction failed: %s", ml_exc)

            odds = {
                "winner": {
                    "Home": odds_home,
                    "Away": odds_away,
                },
            }
            if odds_over:
                odds["over_under"] = {"Over 2.5": odds_over, "Under 2.5": odds_under}

            matches.append(AIScanMatch(
                sport="nba",
                player1=home,
                player2=away,
                home_team=home,
                away_team=away,
                league="NBA",
                date=g.get("date", ""),
                odds=odds,
                model_prob_home=calc.home_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges,
                data_quality=calc.data_quality,
                data_score=calc.data_score,
                nba_ml_used=_nba_ml_used,
                home_win_rate_10=h_stats.get("win_rate_10"),
                away_win_rate_10=a_stats.get("win_rate_10"),
                home_pt_diff_10=h_stats.get("pt_diff_10"),
                away_pt_diff_10=a_stats.get("pt_diff_10"),
                home_pts_avg_10=h_stats.get("pts_avg_10"),
                away_pts_avg_10=a_stats.get("pts_avg_10"),
                home_pts_allowed_10=h_stats.get("pts_allowed_10"),
                away_pts_allowed_10=a_stats.get("pts_allowed_10"),
                home_streak=h_stats.get("streak"),
                away_streak=a_stats.get("streak"),
                odds_over=odds_over,
                odds_under=odds_under,
                total_line=total_line,
            ))
        except Exception:
            continue

    duration = time.time() - t0

    # Persist odds snapshots (non-blocking)
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
# Main loop
# ---------------------------------------------------------------------------

async def main():
    logger.info("Scan worker starting...")

    # Initial scan on startup
    logger.info("Running initial football scan...")
    await run_football_scan()
    logger.info("Running initial tennis scan...")
    await run_tennis_scan()
    logger.info("Running initial NBA scan...")
    await run_nba_scan()

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

    logger.info("Worker running — football/tennis/nba every %ds", FOOTBALL_SCAN_INTERVAL)
    await asyncio.gather(_football_loop(), _tennis_loop(), _nba_loop())


if __name__ == "__main__":
    asyncio.run(main())
