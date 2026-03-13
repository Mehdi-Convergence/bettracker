"""API-Rugby client (API-Sports) — rugby union fixtures, odds, standings, stats.

Base URL: https://v1.rugby.api-sports.io
Auth: x-apisports-key header (same key as API-Football / API-Sports)
Free tier: 100 req/day, 10 req/min

Leagues tracked:
  - Top 14         (id: 16)
  - Premiership    (id: 13)
  - URC            (id: 76)
  - Champions Cup  (id: 54)

Data fetched:
  - Fixtures (upcoming games with date, teams, venue, status)
  - Odds (h2h 3-way H/D/A + totals from multiple bookmakers)
  - Team statistics (season: games, wins, draws, losses, points, tries, penalties, cards)
  - Standings (league points, bonus points, W/D/L, points for/against)
  - Last games per team (form, rest days)

Cache TTLs:
  fixtures  12h | odds  2h  | standings  24h
  team_stats 24h | last_games 24h
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from src.cache import cache_get, cache_set as _cache_set
from src.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://v1.rugby.api-sports.io"

RUGBY_LEAGUES: dict[str, dict] = {
    "top_14": {"id": 16, "name": "Top 14"},
    "premiership": {"id": 13, "name": "Premiership"},
    "urc": {"id": 76, "name": "United Rugby Championship"},
    "champions_cup": {"id": 54, "name": "Champions Cup"},
}

RUGBY_SEASON = "2024"

# Cache TTLs (seconds)
TTL = {
    "fixtures": 12 * 3600,
    "odds": 2 * 3600,
    "standings": 24 * 3600,
    "team_stats": 24 * 3600,
    "last_games": 24 * 3600,
}


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_key(key_type: str, key_id: str) -> str:
    return f"ar:{key_type}:{key_id}"


def _cache_read(key_type: str, key_id: str) -> Any | None:
    return cache_get(_cache_key(key_type, key_id))


def _cache_write(key_type: str, key_id: str, payload: Any) -> None:
    ttl = TTL.get(key_type, 3600)
    _cache_set(_cache_key(key_type, key_id), payload, ttl=ttl)


# ---------------------------------------------------------------------------
# Quota tracker
# ---------------------------------------------------------------------------

def _quota_get() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    cached = cache_get(f"ar_quota:{today}")
    if cached:
        return cached
    return {"requests_made": 0, "remaining": 100}


def _quota_update(remaining: int | None) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    q = _quota_get()
    q["requests_made"] += 1
    if remaining is not None:
        q["remaining"] = remaining
    else:
        q["remaining"] = max(0, q.get("remaining", 100) - 1)
    _cache_set(f"ar_quota:{today}", q, ttl=86400)
    if q["remaining"] < 10:
        logger.warning("API-Rugby quota low: %d remaining", q["remaining"])


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

async def _get(path: str, params: dict | None = None, _retry: int = 0) -> dict | None:
    """GET request to API-Rugby. Returns JSON or None on error."""
    url = f"{API_BASE}{path}"
    api_key = (
        settings.API_SPORTS_KEY
        if hasattr(settings, "API_SPORTS_KEY") and settings.API_SPORTS_KEY
        else settings.API_FOOTBALL_KEY
    )
    if not api_key:
        logger.warning("No API-Sports key configured for Rugby")
        return None
    headers = {"x-apisports-key": api_key}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers, params=params or {})
        remaining = resp.headers.get("x-ratelimit-requests-remaining")
        _quota_update(int(remaining) if remaining and remaining.isdigit() else None)
        if resp.status_code == 429 and _retry < 2:
            await asyncio.sleep(7)
            return await _get(path, params, _retry + 1)
        if resp.status_code != 200:
            logger.error("API-Rugby %s -> %d: %s", path, resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        errors = data.get("errors")
        if errors and (isinstance(errors, dict) and errors or isinstance(errors, list) and errors):
            if "rateLimit" in str(errors) and _retry < 2:
                logger.warning("API-Rugby rate limit for %s, retry %d", path, _retry + 1)
                await asyncio.sleep(7)
                return await _get(path, params, _retry + 1)
            logger.error("API-Rugby errors for %s: %s", path, errors)
            return None
        return data
    except Exception as exc:
        logger.error("API-Rugby request failed %s: %s", path, exc)
        return None


async def _get_cached(key_type: str, key_id: str, path: str, params: dict | None = None) -> Any | None:
    """GET with cache. Skips API call if quota exhausted."""
    cached = _cache_read(key_type, key_id)
    if cached is not None:
        return cached
    quota = _quota_get()
    if quota["remaining"] <= 0:
        logger.warning("API-Rugby quota exhausted for %s/%s", key_type, key_id)
        return None
    data = await _get(path, params)
    if data is None:
        return None
    payload = data.get("response", [])
    _cache_write(key_type, key_id, payload)
    return payload


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class ApiRugbyClient:
    """Fetch rugby union data from API-Sports Rugby."""

    @staticmethod
    def get_tracked_leagues() -> list[dict]:
        """Return list of tracked rugby leagues with id and name."""
        return [{"id": v["id"], "name": v["name"], "key": k} for k, v in RUGBY_LEAGUES.items()]

    # --- Fixtures ---

    async def get_fixtures(self, date_str: str | None = None, timeframe: str = "48h") -> list[dict]:
        """Return upcoming rugby games for date range across all tracked leagues.

        Each dict: {game_id, date, home_id, home_name, away_id, away_name,
                    venue, league, league_id, status, home_score, away_score}
        """
        if date_str is None:
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        all_fixtures: list[dict] = []
        seen_ids: set = set()

        # Single date-only request (free plan doesn't support season filter)
        all_raw = await _get_cached(
            "fixtures", f"all_{date_str}",
            "/games",
            {"date": date_str},
        )
        if not all_raw:
            all_raw = []

        tracked_ids = {v["id"] for v in RUGBY_LEAGUES.values()}

        for g in all_raw:
            try:
                league_id = g.get("league", {}).get("id")
                if league_id not in tracked_ids:
                    continue
                status_short = g.get("status", {}).get("short", "")
                if status_short in ("FT", "AOT", "POST", "CANC", "ABD"):
                    continue
                game_id = g.get("id")
                if game_id in seen_ids:
                    continue
                seen_ids.add(game_id)
                league_name = next(
                    (v["name"] for v in RUGBY_LEAGUES.values() if v["id"] == league_id),
                    "Rugby"
                )
                fixture = {
                    "game_id": game_id,
                    "date": g.get("date", ""),
                    "home_id": g.get("teams", {}).get("home", {}).get("id"),
                    "home_name": g.get("teams", {}).get("home", {}).get("name", ""),
                    "away_id": g.get("teams", {}).get("away", {}).get("id"),
                    "away_name": g.get("teams", {}).get("away", {}).get("name", ""),
                    "venue": g.get("venue"),
                    "league": league_name,
                    "league_id": league_id,
                    "status": status_short,
                    "home_score": g.get("scores", {}).get("home"),
                    "away_score": g.get("scores", {}).get("away"),
                }
                all_fixtures.append(fixture)
            except (KeyError, TypeError):
                continue

        return all_fixtures

    # --- Fixtures range ---

    async def get_fixtures_range(self, timeframe: str = "48h") -> list[dict]:
        """Fetch fixtures for today + tomorrow (48h window) across all leagues."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

        fixtures_today = await self.get_fixtures(date_str=today, timeframe=timeframe)
        fixtures_tomorrow = await self.get_fixtures(date_str=tomorrow, timeframe=timeframe)

        # Deduplicate by game_id
        seen: set = set()
        result: list[dict] = []
        for f in fixtures_today + fixtures_tomorrow:
            gid = f.get("game_id")
            if gid and gid not in seen:
                seen.add(gid)
                result.append(f)
        return result

    # --- Odds ---

    async def get_odds(self, game_id: int) -> dict:
        """Return odds for a game.

        Rugby has 3 outcomes: home / draw / away.

        Returns {h2h: {home: float, draw: float, away: float,
                        bookmakers: {bk: {home: f, draw: f, away: f}}},
                 totals: {over: float, under: float, line: float,
                          bookmakers: {...}}}
        """
        raw = await _get_cached(
            "odds", str(game_id),
            "/odds",
            {"game": game_id},
        )
        if not raw:
            return {}

        result: dict = {"h2h": {}, "totals": {}}
        best_home: float | None = None
        best_draw: float | None = None
        best_away: float | None = None
        best_over: float | None = None
        best_under: float | None = None
        best_line: float | None = None
        h2h_bookmakers: dict = {}
        totals_bookmakers: dict = {}

        for entry in raw:
            for bk in entry.get("bookmakers", []):
                bk_name = bk.get("name", "unknown")
                for bet in bk.get("bets", []):
                    label = (bet.get("name") or "").lower()
                    values = bet.get("values", [])

                    if "winner" in label or "match" in label or "1x2" in label or "home/draw/away" in label:
                        home_odd = None
                        draw_odd = None
                        away_odd = None
                        for v in values:
                            val_label = (v.get("value") or "").lower()
                            odd = _safe_float(v.get("odd"))
                            if odd and odd > 1.0:
                                if val_label in ("home", "1"):
                                    home_odd = odd
                                elif val_label in ("draw", "x"):
                                    draw_odd = odd
                                elif val_label in ("away", "2"):
                                    away_odd = odd
                        if home_odd and away_odd:
                            h2h_bookmakers[bk_name] = {
                                "home": home_odd,
                                "draw": draw_odd,
                                "away": away_odd,
                            }
                            if best_home is None or home_odd > best_home:
                                best_home = home_odd
                            if draw_odd and (best_draw is None or draw_odd > best_draw):
                                best_draw = draw_odd
                            if best_away is None or away_odd > best_away:
                                best_away = away_odd

                    elif "over" in label or "total" in label:
                        over_odd = None
                        under_odd = None
                        line = None
                        for v in values:
                            val_label = (v.get("value") or "").lower()
                            odd = _safe_float(v.get("odd"))
                            if odd and odd > 1.0:
                                if "over" in val_label:
                                    over_odd = odd
                                    line = _safe_float(v.get("handicap"))
                                elif "under" in val_label:
                                    under_odd = odd
                                    if line is None:
                                        line = _safe_float(v.get("handicap"))
                        if over_odd and under_odd:
                            totals_bookmakers[bk_name] = {
                                "over": over_odd,
                                "under": under_odd,
                                "line": line,
                            }
                            if best_over is None or over_odd > best_over:
                                best_over = over_odd
                            if best_under is None or under_odd > best_under:
                                best_under = under_odd
                            if line is not None:
                                best_line = line

        result["h2h"] = {
            "home": best_home,
            "draw": best_draw,
            "away": best_away,
            "bookmakers": h2h_bookmakers,
        }
        result["totals"] = {
            "over": best_over,
            "under": best_under,
            "line": best_line,
            "bookmakers": totals_bookmakers,
        }
        return result

    # --- Standings ---

    async def get_standings(self, league_id: int) -> list[dict]:
        """Return standings for a given rugby league.

        Each dict: {team_id, team_name, rank, league_points, bonus_points,
                    wins, draws, losses, games_played, points_for,
                    points_against, point_diff, win_pct, form}
        """
        raw = await _get_cached(
            "standings", f"{league_id}_{RUGBY_SEASON}",
            "/standings",
            {"league": league_id, "season": RUGBY_SEASON},
        )
        if not raw:
            return []

        standings = []
        # API-Sports Rugby wraps standings in nested groups — flatten
        entries: list[dict] = []
        for item in raw:
            if isinstance(item, list):
                entries.extend(item)
            elif isinstance(item, dict):
                entries.append(item)

        for entry in entries:
            try:
                team = entry.get("team", {})
                games = entry.get("games", {})
                pts_info = entry.get("points", {})

                played = games.get("played", 0) or 0
                wins = games.get("win", 0) or 0
                draws = games.get("draw", 0) or 0
                losses = games.get("lose", 0) or 0

                points_for = pts_info.get("for", 0) or 0
                points_against = pts_info.get("against", 0) or 0

                standings.append({
                    "team_id": team.get("id"),
                    "team_name": team.get("name", ""),
                    "rank": entry.get("position"),
                    "league_points": entry.get("points", {}).get("league") if isinstance(entry.get("points"), dict) else entry.get("league_points"),
                    "bonus_points": entry.get("points", {}).get("bonus") if isinstance(entry.get("points"), dict) else None,
                    "wins": wins,
                    "draws": draws,
                    "losses": losses,
                    "games_played": played,
                    "points_for": points_for,
                    "points_against": points_against,
                    "point_diff": points_for - points_against,
                    "win_pct": round(wins / played, 3) if played > 0 else 0.0,
                    "form": entry.get("form", ""),
                })
            except (KeyError, TypeError):
                continue
        return standings

    # --- Team statistics ---

    async def get_team_stats(self, team_id: int, league_id: int) -> dict:
        """Return season statistics for a rugby team.

        Returns: {games_played, wins, draws, losses, win_pct,
                  pts_avg, pts_allowed_avg, pt_diff,
                  tries_avg, conversions_avg, penalties_avg,
                  yellow_cards_avg, red_cards_avg}
        """
        raw = await _get_cached(
            "team_stats", f"{team_id}_{league_id}",
            "/statistics",
            {"team": team_id, "league": league_id, "season": RUGBY_SEASON},
        )
        if not raw:
            return {}

        try:
            s = raw if isinstance(raw, dict) else (raw[0] if raw else {})
            games = s.get("games", {})
            points = s.get("points", {})

            played = games.get("played", {})
            played_all = played.get("all", 0) if isinstance(played, dict) else (played or 0)
            wins_all = (games.get("wins", {}).get("all", {}).get("total", 0)
                        if isinstance(games.get("wins"), dict)
                        else games.get("wins", 0)) or 0
            draws_all = (games.get("draws", {}).get("all", {}).get("total", 0)
                         if isinstance(games.get("draws"), dict)
                         else games.get("draws", 0)) or 0
            losses_all = (games.get("loses", {}).get("all", {}).get("total", 0)
                          if isinstance(games.get("loses"), dict)
                          else games.get("loses", 0)) or 0

            pts_for_avg = None
            pts_against_avg = None
            if isinstance(points, dict):
                pts_for_raw = points.get("for", {})
                pts_against_raw = points.get("against", {})
                if isinstance(pts_for_raw, dict):
                    pts_for_avg = _safe_float(pts_for_raw.get("average", {}).get("all") if isinstance(pts_for_raw.get("average"), dict) else pts_for_raw.get("average"))
                else:
                    pts_for_avg = _safe_float(pts_for_raw)
                if isinstance(pts_against_raw, dict):
                    pts_against_avg = _safe_float(pts_against_raw.get("average", {}).get("all") if isinstance(pts_against_raw.get("average"), dict) else pts_against_raw.get("average"))
                else:
                    pts_against_avg = _safe_float(pts_against_raw)

            # Rugby-specific stats
            tries_info = s.get("tries", {})
            conversions_info = s.get("conversions", {})
            penalties_info = s.get("penalty_goals", s.get("penalties", {}))
            cards_info = s.get("cards", {})

            tries_avg = _safe_float(
                tries_info.get("average", {}).get("all")
                if isinstance(tries_info.get("average"), dict)
                else tries_info.get("average")
            ) if isinstance(tries_info, dict) else None

            conversions_avg = _safe_float(
                conversions_info.get("average", {}).get("all")
                if isinstance(conversions_info.get("average"), dict)
                else conversions_info.get("average")
            ) if isinstance(conversions_info, dict) else None

            penalties_avg = _safe_float(
                penalties_info.get("average", {}).get("all")
                if isinstance(penalties_info.get("average"), dict)
                else penalties_info.get("average")
            ) if isinstance(penalties_info, dict) else None

            yellow_cards_avg = None
            red_cards_avg = None
            if isinstance(cards_info, dict):
                yellow = cards_info.get("yellow", {})
                red = cards_info.get("red", {})
                yellow_cards_avg = _safe_float(
                    yellow.get("average", {}).get("all")
                    if isinstance(yellow.get("average"), dict)
                    else yellow.get("average")
                ) if isinstance(yellow, dict) else _safe_float(yellow)
                red_cards_avg = _safe_float(
                    red.get("average", {}).get("all")
                    if isinstance(red.get("average"), dict)
                    else red.get("average")
                ) if isinstance(red, dict) else _safe_float(red)

            pt_diff = None
            if pts_for_avg is not None and pts_against_avg is not None:
                pt_diff = round(pts_for_avg - pts_against_avg, 1)

            return {
                "team_id": team_id,
                "games_played": played_all,
                "wins": wins_all,
                "draws": draws_all,
                "losses": losses_all,
                "win_pct": round(wins_all / played_all, 3) if played_all > 0 else None,
                "pts_avg": pts_for_avg,
                "pts_allowed_avg": pts_against_avg,
                "pt_diff": pt_diff,
                "tries_avg": tries_avg,
                "conversions_avg": conversions_avg,
                "penalties_avg": penalties_avg,
                "yellow_cards_avg": yellow_cards_avg,
                "red_cards_avg": red_cards_avg,
            }
        except Exception as exc:
            logger.error("Rugby team_stats parse error team=%d league=%d: %s", team_id, league_id, exc)
            return {}

    # --- Last games (form + rest days) ---

    async def get_last_games(self, team_id: int, n: int = 10) -> list[dict]:
        """Return last N games for a team.

        Each dict: {date, opponent, is_home, won, drew, pts_scored, pts_allowed, score}
        Rugby includes draws, so 'won' and 'drew' are both tracked.
        """
        raw = await _get_cached(
            "last_games", f"{team_id}_last{n}",
            "/games",
            {"team": team_id, "last": n},
        )
        if not raw:
            return []

        games = []
        for g in raw:
            try:
                home_team = g.get("teams", {}).get("home", {})
                away_team = g.get("teams", {}).get("away", {})
                scores = g.get("scores", {})
                home_score = _safe_int(scores.get("home"))
                away_score = _safe_int(scores.get("away"))

                is_home = (home_team.get("id") == team_id)
                if is_home:
                    pts_scored = home_score
                    pts_allowed = away_score
                    opponent = away_team.get("name", "")
                else:
                    pts_scored = away_score
                    pts_allowed = home_score
                    opponent = home_team.get("name", "")

                won = (
                    pts_scored is not None
                    and pts_allowed is not None
                    and pts_scored > pts_allowed
                )
                drew = (
                    pts_scored is not None
                    and pts_allowed is not None
                    and pts_scored == pts_allowed
                )

                games.append({
                    "date": g.get("date", ""),
                    "opponent": opponent,
                    "is_home": is_home,
                    "won": won,
                    "drew": drew,
                    "pts_scored": pts_scored,
                    "pts_allowed": pts_allowed,
                    "score": f"{home_score}-{away_score}" if home_score is not None else None,
                })
            except (KeyError, TypeError):
                continue
        return games

    # --- High-level enrichment ---

    def compute_live_stats(
        self,
        last_games: list[dict],
        standings_entry: dict | None = None,
        team_stats: dict | None = None,
    ) -> dict:
        """Compute live stats from last games + standings + team stats.

        Returns dict compatible with scan_worker expectations:
        {win_rate_10, pts_avg_10, pts_allowed_10, pt_diff_10, tries_avg_10,
         penalties_avg_10, streak, form, rest_days, league_rank,
         season_wins, season_draws, season_losses, last_5_results, ...}
        """
        stats: dict = {}

        # From last games
        if last_games:
            n = len(last_games)
            wins = sum(1 for g in last_games if g.get("won"))
            draws = sum(1 for g in last_games if g.get("drew"))
            stats["win_rate_10"] = round(wins / n, 3) if n > 0 else None
            stats["draw_rate_10"] = round(draws / n, 3) if n > 0 else None

            pts_scored_list = [g["pts_scored"] for g in last_games if g.get("pts_scored") is not None]
            pts_allowed_list = [g["pts_allowed"] for g in last_games if g.get("pts_allowed") is not None]
            stats["pts_avg_10"] = round(sum(pts_scored_list) / len(pts_scored_list), 1) if pts_scored_list else None
            stats["pts_allowed_10"] = round(sum(pts_allowed_list) / len(pts_allowed_list), 1) if pts_allowed_list else None

            if stats["pts_avg_10"] is not None and stats["pts_allowed_10"] is not None:
                stats["pt_diff_10"] = round(stats["pts_avg_10"] - stats["pts_allowed_10"], 1)
            else:
                stats["pt_diff_10"] = None

            # Streak (positive = wins, negative = losses, 0 on draw resets)
            streak = 0
            for g in reversed(last_games):
                if g.get("drew"):
                    # A draw resets the streak
                    break
                if streak == 0:
                    streak = 1 if g.get("won") else -1
                elif (streak > 0 and g.get("won")) or (streak < 0 and not g.get("won") and not g.get("drew")):
                    streak += 1 if streak > 0 else -1
                else:
                    break
            stats["streak"] = streak

            # Form string (W/D/L last 5)
            form_games = last_games[-5:] if len(last_games) >= 5 else last_games
            stats["form"] = "".join(
                "W" if g.get("won") else ("D" if g.get("drew") else "L")
                for g in form_games
            )

            # Rest days (time since last game)
            try:
                last_date_str = last_games[-1].get("date", "")
                if last_date_str:
                    last_dt = datetime.fromisoformat(last_date_str.replace("Z", "+00:00"))
                    now = datetime.now(timezone.utc)
                    stats["rest_days"] = (now - last_dt).days
                else:
                    stats["rest_days"] = None
            except Exception:
                stats["rest_days"] = None

            # Home/away split
            home_games = [g for g in last_games if g.get("is_home")]
            away_games = [g for g in last_games if not g.get("is_home")]
            if home_games:
                stats["home_win_rate"] = round(
                    sum(1 for g in home_games if g["won"]) / len(home_games), 3
                )
            if away_games:
                stats["away_win_rate"] = round(
                    sum(1 for g in away_games if g["won"]) / len(away_games), 3
                )

            # Recent results for display
            stats["last_5_results"] = [
                {
                    "opponent": g["opponent"],
                    "score": g.get("score"),
                    "won": g["won"],
                    "drew": g.get("drew", False),
                    "is_home": g["is_home"],
                }
                for g in last_games[-5:]
            ]

            # Tries and penalties from last games (if available)
            # These may not always be present in the last games endpoint
            tries_list = [g["tries_scored"] for g in last_games if g.get("tries_scored") is not None]
            penalties_list = [g["penalties_scored"] for g in last_games if g.get("penalties_scored") is not None]
            stats["tries_avg_10"] = round(sum(tries_list) / len(tries_list), 2) if tries_list else None
            stats["penalties_avg_10"] = round(sum(penalties_list) / len(penalties_list), 2) if penalties_list else None

        # From standings
        if standings_entry:
            stats["league_rank"] = standings_entry.get("rank")
            stats["season_wins"] = standings_entry.get("wins")
            stats["season_draws"] = standings_entry.get("draws")
            stats["season_losses"] = standings_entry.get("losses")
            stats["season_win_pct"] = standings_entry.get("win_pct")
            stats["league_points"] = standings_entry.get("league_points")
            stats["bonus_points"] = standings_entry.get("bonus_points")
            stats["points_for"] = standings_entry.get("points_for")
            stats["points_against"] = standings_entry.get("points_against")
            stats["point_diff_season"] = standings_entry.get("point_diff")

        # From team stats (season-level rugby-specific stats)
        if team_stats:
            stats["season_pts_avg"] = team_stats.get("pts_avg")
            stats["season_pts_allowed_avg"] = team_stats.get("pts_allowed_avg")
            stats["season_pt_diff"] = team_stats.get("pt_diff")
            stats["season_tries_avg"] = team_stats.get("tries_avg")
            stats["season_conversions_avg"] = team_stats.get("conversions_avg")
            stats["season_penalties_avg"] = team_stats.get("penalties_avg")
            stats["season_yellow_cards_avg"] = team_stats.get("yellow_cards_avg")
            stats["season_red_cards_avg"] = team_stats.get("red_cards_avg")
            # Fill tries/penalties from season stats if not in last_games
            if stats.get("tries_avg_10") is None:
                stats["tries_avg_10"] = team_stats.get("tries_avg")
            if stats.get("penalties_avg_10") is None:
                stats["penalties_avg_10"] = team_stats.get("penalties_avg")

        return stats


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        v = float(val)
        return v if v == v else None  # NaN check
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None
