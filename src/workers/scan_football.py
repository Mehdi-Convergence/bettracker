"""Football scan worker — pre-computes football scans on schedule.

Contient run_football_scan() et ses helpers (V6 model loader, processing fixture).
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
from src.workers.scan_common import (
    DATA_SCORE_MIN,
    SCAN_CACHE_TTL,
    _save_odds_snapshots,
    _track_scan_result,
)

logger = logging.getLogger("scan_worker.football")

# ---------------------------------------------------------------------------
# V6 model loader (same pattern as scanner.py)
# ---------------------------------------------------------------------------
_V6_MODEL = None
_V6_MODEL_LOADED = False
_V6_MEDIANS = None  # np.ndarray of training medians for NaN imputation


def _load_v6_model():
    global _V6_MODEL, _V6_MODEL_LOADED, _V6_MEDIANS
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
        # Load training medians from metadata for NaN imputation at inference
        meta_path = model_path / "metadata.json"
        if meta_path.exists():
            import json as _json_v6
            meta = _json_v6.loads(meta_path.read_text())
            raw_medians = meta.get("col_medians")
            if raw_medians is not None:
                _V6_MEDIANS = np.array(raw_medians, dtype=float)
                logger.info("V6 training medians loaded (%d values)", len(_V6_MEDIANS))
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
            ML_WEIGHT = 0.15
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
                    X = np.array([[live_feats.get(feat, np.nan) for feat in active_feats]])
                    # Fill NaN with training medians (same as backtest). Fall back to 0.0
                    # for features whose median is also NaN (e.g. possession, xG columns).
                    if _V6_MEDIANS is not None and len(_V6_MEDIANS) == X.shape[1]:
                        nan_mask = np.isnan(X[0])
                        for col_idx in np.where(nan_mask)[0]:
                            med = _V6_MEDIANS[col_idx]
                            X[0, col_idx] = med if not np.isnan(med) else 0.0
                    else:
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
                # BTTS: P(home scores >= 1) x P(away scores >= 1)
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

    _track_scan_result("football", len(matches_out))

    logger.info(
        "Football scan completed: %d matches (%d passed filter) in %.1fs",
        len(fixtures), len(matches_out), duration,
    )
