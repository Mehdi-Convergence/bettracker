"""API-Basketball client (API-Sports) — replaces nba_client.py (Odds API).

Base URL: https://v1.basketball.api-sports.io
Auth: x-apisports-key header (same key as API-Football)
Free tier: 100 req/day, 10 req/min

Data fetched:
  - Fixtures (upcoming games with date, teams, venue, status)
  - Odds (h2h moneyline + totals from multiple bookmakers)
  - Team statistics (season: wins, losses, points avg, FG%, 3P%, FT%, rebounds, assists, turnovers)
  - Standings (conference rankings, W/L record, streaks)
  - Last games per team (form, rest days, back-to-back detection)

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

API_BASE = "https://v1.basketball.api-sports.io"

# NBA league ID in API-Sports Basketball
NBA_LEAGUE_ID = 12
NBA_SEASON = "2024-2025"

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
    return f"ab:{key_type}:{key_id}"


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
    cached = cache_get(f"ab_quota:{today}")
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
    _cache_set(f"ab_quota:{today}", q, ttl=86400)
    if q["remaining"] < 10:
        logger.warning("API-Basketball quota low: %d remaining", q["remaining"])


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

async def _get(path: str, params: dict | None = None, _retry: int = 0) -> dict | None:
    """GET request to API-Basketball. Returns JSON or None on error."""
    url = f"{API_BASE}{path}"
    api_key = settings.API_SPORTS_KEY if hasattr(settings, "API_SPORTS_KEY") and settings.API_SPORTS_KEY else settings.API_FOOTBALL_KEY
    if not api_key:
        logger.warning("No API-Sports key configured for Basketball")
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
            logger.error("API-Basketball %s -> %d: %s", path, resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        errors = data.get("errors")
        if errors and (isinstance(errors, dict) and errors or isinstance(errors, list) and errors):
            if "rateLimit" in str(errors) and _retry < 2:
                logger.warning("API-Basketball rate limit for %s, retry %d", path, _retry + 1)
                await asyncio.sleep(7)
                return await _get(path, params, _retry + 1)
            logger.error("API-Basketball errors for %s: %s", path, errors)
            return None
        return data
    except Exception as exc:
        logger.error("API-Basketball request failed %s: %s", path, exc)
        return None


async def _get_cached(key_type: str, key_id: str, path: str, params: dict | None = None) -> Any | None:
    """GET with cache. Skips API call if quota exhausted."""
    cached = _cache_read(key_type, key_id)
    if cached is not None:
        return cached
    quota = _quota_get()
    if quota["remaining"] <= 0:
        logger.warning("API-Basketball quota exhausted for %s/%s", key_type, key_id)
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

class ApiBasketballClient:
    """Fetch NBA data from API-Sports Basketball."""

    # --- Fixtures ---

    async def get_fixtures(self, date_str: str | None = None, timeframe: str = "48h") -> list[dict]:
        """Return upcoming NBA games for date range.

        Each dict: {game_id, date, home_id, home_name, away_id, away_name,
                    venue, league, status, quarter, home_score, away_score}
        """
        if date_str is None:
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        key_id = f"nba_{date_str}"
        raw = await _get_cached(
            "fixtures", key_id,
            "/games",
            {"date": date_str},
        )
        if not raw:
            return []
        # Filter to NBA league only (free plan doesn't support season filter)
        raw = [g for g in raw if g.get("league", {}).get("id") == NBA_LEAGUE_ID]

        fixtures = []
        for g in (raw or []):
            try:
                status_short = g.get("status", {}).get("short", "")
                # Only future or live games
                if status_short in ("FT", "AOT", "POST"):
                    continue
                fixture = {
                    "game_id": g.get("id"),
                    "date": g.get("date", ""),
                    "home_id": g.get("teams", {}).get("home", {}).get("id"),
                    "home_name": g.get("teams", {}).get("home", {}).get("name", ""),
                    "away_id": g.get("teams", {}).get("away", {}).get("id"),
                    "away_name": g.get("teams", {}).get("away", {}).get("name", ""),
                    "venue": g.get("venue"),
                    "league": g.get("league", {}).get("name", "NBA"),
                    "status": status_short,
                    "home_score": g.get("scores", {}).get("home", {}).get("total"),
                    "away_score": g.get("scores", {}).get("away", {}).get("total"),
                }
                fixtures.append(fixture)
            except (KeyError, TypeError):
                continue
        return fixtures

    # Also fetch tomorrow's games for 48h window
    async def get_fixtures_range(self, timeframe: str = "48h") -> list[dict]:
        """Fetch fixtures for today + tomorrow (48h window)."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

        fixtures_today = await self.get_fixtures(date_str=today, timeframe=timeframe)
        fixtures_tomorrow = await self.get_fixtures(date_str=tomorrow, timeframe=timeframe)

        # Deduplicate by game_id
        seen = set()
        result = []
        for f in fixtures_today + fixtures_tomorrow:
            gid = f.get("game_id")
            if gid and gid not in seen:
                seen.add(gid)
                result.append(f)
        return result

    # --- Odds ---

    async def get_odds(self, game_id: int) -> dict:
        """Return odds for a game.

        Returns {h2h: {home: float, away: float, bookmakers: {bk: {home: f, away: f}}},
                 totals: {over: float, under: float, line: float, bookmakers: {...}}}
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

                    if "winner" in label or "home/away" in label or "match" in label:
                        home_odd = None
                        away_odd = None
                        for v in values:
                            val_label = (v.get("value") or "").lower()
                            odd = _safe_float(v.get("odd"))
                            if odd and odd > 1.0:
                                if "home" in val_label or val_label == "1":
                                    home_odd = odd
                                elif "away" in val_label or val_label == "2":
                                    away_odd = odd
                        if home_odd and away_odd:
                            h2h_bookmakers[bk_name] = {"home": home_odd, "away": away_odd}
                            if best_home is None or home_odd > best_home:
                                best_home = home_odd
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
                            totals_bookmakers[bk_name] = {"over": over_odd, "under": under_odd, "line": line}
                            if best_over is None or over_odd > best_over:
                                best_over = over_odd
                            if best_under is None or under_odd > best_under:
                                best_under = under_odd
                            if line is not None:
                                best_line = line

        result["h2h"] = {
            "home": best_home,
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

    async def get_standings(self) -> list[dict]:
        """Return NBA standings.

        Each dict: {team_id, team_name, conference, division, rank,
                    wins, losses, win_pct, streak, home_record, away_record,
                    last_10, games_behind}
        """
        raw = await _get_cached(
            "standings", f"nba_{NBA_SEASON}",
            "/standings",
            {"league": NBA_LEAGUE_ID, "season": "2023-2024"},
        )
        if not raw:
            return []

        standings = []
        # API-Sports wraps standings in nested groups (by conference) — flatten
        entries: list[dict] = []
        for item in raw:
            if isinstance(item, list):
                entries.extend(item)
            elif isinstance(item, dict):
                entries.append(item)

        for entry in entries:
            try:
                team = entry.get("team", {})
                group_info = entry.get("group", {})
                games = entry.get("games", {})
                win_info = games.get("win", {})
                lose_info = games.get("lose", {})

                wins = win_info.get("total", 0) or 0
                losses = lose_info.get("total", 0) or 0
                total = wins + losses

                standings.append({
                    "team_id": team.get("id"),
                    "team_name": team.get("name", ""),
                    "conference": group_info.get("name", ""),
                    "rank": entry.get("position"),
                    "wins": wins,
                    "losses": losses,
                    "win_pct": round(wins / total, 3) if total > 0 else 0,
                    "streak": entry.get("streak"),
                    "form": entry.get("form", ""),
                    "home_wins": win_info.get("home", 0) or 0,
                    "home_losses": lose_info.get("home", 0) or 0,
                    "away_wins": win_info.get("away", 0) or 0,
                    "away_losses": lose_info.get("away", 0) or 0,
                    "points_for": entry.get("points", {}).get("for", 0),
                    "points_against": entry.get("points", {}).get("against", 0),
                })
            except (KeyError, TypeError):
                continue
        return standings

    # --- Team statistics ---

    async def get_team_stats(self, team_id: int) -> dict:
        """Return season statistics for a team.

        Returns: {games_played, wins, losses, win_pct,
                  pts_avg, pts_allowed_avg, pt_diff,
                  fg_pct, three_pct, ft_pct,
                  rebounds_avg, assists_avg, turnovers_avg,
                  steals_avg, blocks_avg}
        """
        raw = await _get_cached(
            "team_stats", str(team_id),
            "/statistics",
            {"team": team_id, "league": NBA_LEAGUE_ID, "season": "2023-2024"},
        )
        if not raw:
            return {}

        try:
            # API-Sports Basketball /statistics returns aggregated stats
            s = raw if isinstance(raw, dict) else (raw[0] if raw else {})
            games = s.get("games", {})
            points = s.get("points", {})

            played = games.get("played", {}).get("all", 0) or 0
            wins_total = games.get("wins", {}).get("all", {}).get("total", 0) or 0
            losses_total = games.get("loses", {}).get("all", {}).get("total", 0) or 0

            pts_for = points.get("for", {}).get("average", {}).get("all")
            pts_against = points.get("against", {}).get("average", {}).get("all")

            return {
                "team_id": team_id,
                "games_played": played,
                "wins": wins_total,
                "losses": losses_total,
                "win_pct": round(wins_total / played, 3) if played > 0 else None,
                "pts_avg": _safe_float(pts_for),
                "pts_allowed_avg": _safe_float(pts_against),
                "pt_diff": round((_safe_float(pts_for) or 0) - (_safe_float(pts_against) or 0), 1),
                "fg_pct": _safe_float(s.get("field_goals", {}).get("percentage")),
                "three_pct": _safe_float(s.get("three_points", {}).get("percentage")),
                "ft_pct": _safe_float(s.get("free_throws", {}).get("percentage")),
                "rebounds_avg": _safe_float(s.get("rebounds", {}).get("average")),
                "assists_avg": _safe_float(s.get("assists", {}).get("average")),
                "turnovers_avg": _safe_float(s.get("turnovers", {}).get("average")),
                "steals_avg": _safe_float(s.get("steals", {}).get("average")),
                "blocks_avg": _safe_float(s.get("blocks", {}).get("average")),
            }
        except Exception as exc:
            logger.error("Basketball team_stats parse error team=%d: %s", team_id, exc)
            return {}

    # --- Last games (form + rest days) ---

    async def get_last_games(self, team_id: int, n: int = 10) -> list[dict]:
        """Return last N games for a team.

        Each dict: {date, opponent, is_home, won, pts_scored, pts_allowed, score}
        """
        raw = await _get_cached(
            "last_games", f"{team_id}_last{n}",
            "/games",
            {"team": team_id, "league": NBA_LEAGUE_ID, "last": n},
        )
        if not raw:
            return []

        games = []
        for g in raw:
            try:
                home_team = g.get("teams", {}).get("home", {})
                away_team = g.get("teams", {}).get("away", {})
                scores = g.get("scores", {})
                home_score = scores.get("home", {}).get("total")
                away_score = scores.get("away", {}).get("total")

                is_home = (home_team.get("id") == team_id)
                if is_home:
                    pts_scored = home_score
                    pts_allowed = away_score
                    opponent = away_team.get("name", "")
                else:
                    pts_scored = away_score
                    pts_allowed = home_score
                    opponent = home_team.get("name", "")

                won = pts_scored is not None and pts_allowed is not None and pts_scored > pts_allowed

                games.append({
                    "date": g.get("date", ""),
                    "opponent": opponent,
                    "is_home": is_home,
                    "won": won,
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
        {win_rate_10, pts_avg_10, pts_allowed_10, pt_diff_10, streak,
         fg_pct, three_pct, ft_pct, rebounds_avg, assists_avg, turnovers_avg,
         rest_days, is_b2b, form, conference_rank, ...}
        """
        stats: dict = {}

        # From last games
        if last_games:
            n = len(last_games)
            wins = sum(1 for g in last_games if g.get("won"))
            stats["win_rate_10"] = round(wins / n, 3) if n > 0 else None

            pts_scored = [g["pts_scored"] for g in last_games if g.get("pts_scored") is not None]
            pts_allowed = [g["pts_allowed"] for g in last_games if g.get("pts_allowed") is not None]
            stats["pts_avg_10"] = round(sum(pts_scored) / len(pts_scored), 1) if pts_scored else None
            stats["pts_allowed_10"] = round(sum(pts_allowed) / len(pts_allowed), 1) if pts_allowed else None

            if stats["pts_avg_10"] is not None and stats["pts_allowed_10"] is not None:
                stats["pt_diff_10"] = round(stats["pts_avg_10"] - stats["pts_allowed_10"], 1)
            else:
                stats["pt_diff_10"] = None

            # Streak
            streak = 0
            for g in reversed(last_games):
                if streak == 0:
                    streak = 1 if g.get("won") else -1
                elif (streak > 0 and g.get("won")) or (streak < 0 and not g.get("won")):
                    streak += 1 if streak > 0 else -1
                else:
                    break
            stats["streak"] = streak

            # Form string (W/L last 5)
            form_games = last_games[-5:] if len(last_games) >= 5 else last_games
            stats["form"] = "".join("W" if g.get("won") else "L" for g in form_games)

            # Rest days (time since last game)
            try:
                last_date_str = last_games[-1].get("date", "")
                if last_date_str:
                    last_dt = datetime.fromisoformat(last_date_str.replace("Z", "+00:00"))
                    now = datetime.now(timezone.utc)
                    stats["rest_days"] = (now - last_dt).days
                    stats["is_b2b"] = stats["rest_days"] <= 1
                else:
                    stats["rest_days"] = None
                    stats["is_b2b"] = False
            except Exception:
                stats["rest_days"] = None
                stats["is_b2b"] = False

            # Home/away split from last games
            home_games = [g for g in last_games if g.get("is_home")]
            away_games = [g for g in last_games if not g.get("is_home")]
            if home_games:
                stats["home_win_rate"] = round(sum(1 for g in home_games if g["won"]) / len(home_games), 3)
            if away_games:
                stats["away_win_rate"] = round(sum(1 for g in away_games if g["won"]) / len(away_games), 3)

            # Recent results for display
            stats["last_5_results"] = [
                {"opponent": g["opponent"], "score": g.get("score"), "won": g["won"], "is_home": g["is_home"]}
                for g in last_games[-5:]
            ]

        # From standings
        if standings_entry:
            stats["conference"] = standings_entry.get("conference")
            stats["conference_rank"] = standings_entry.get("rank")
            stats["season_wins"] = standings_entry.get("wins")
            stats["season_losses"] = standings_entry.get("losses")
            stats["season_win_pct"] = standings_entry.get("win_pct")
            stats["home_record"] = f"{standings_entry.get('home_wins', 0)}-{standings_entry.get('home_losses', 0)}"
            stats["away_record"] = f"{standings_entry.get('away_wins', 0)}-{standings_entry.get('away_losses', 0)}"

        # From team stats (season-level shooting, rebounds, etc.)
        if team_stats:
            stats["fg_pct"] = team_stats.get("fg_pct")
            stats["three_pct"] = team_stats.get("three_pct")
            stats["ft_pct"] = team_stats.get("ft_pct")
            stats["rebounds_avg"] = team_stats.get("rebounds_avg")
            stats["assists_avg"] = team_stats.get("assists_avg")
            stats["turnovers_avg"] = team_stats.get("turnovers_avg")
            stats["steals_avg"] = team_stats.get("steals_avg")
            stats["blocks_avg"] = team_stats.get("blocks_avg")
            # Season-level points (more stable than 10-game window)
            stats["season_pts_avg"] = team_stats.get("pts_avg")
            stats["season_pts_allowed_avg"] = team_stats.get("pts_allowed_avg")

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
