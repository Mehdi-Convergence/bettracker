"""API-Baseball client (API-Sports) — client MLB.

Base URL: https://v1.baseball.api-sports.io
Auth: x-apisports-key header (same key as API-Football)
Free tier: 100 req/day, 10 req/min

Data fetched:
  - Fixtures (upcoming MLB games with date, teams, venue, status)
  - Odds (h2h moneyline + totals runs from multiple bookmakers)
  - Team statistics (season: wins, losses, runs avg, batting avg, ERA, HR, hits, errors)
  - Standings (division rankings, W/L record, GB)
  - Last games per team (form, rest days, streaks) — via statsapi fallback

Cache TTLs:
  fixtures  12h | odds  2h  | standings  24h
  team_stats 24h | last_games 24h
"""
from __future__ import annotations

import asyncio
import difflib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import statsapi

from src.cache import cache_get, cache_set as _cache_set
from src.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://v1.baseball.api-sports.io"

# MLB league ID in API-Sports Baseball
MLB_LEAGUE_ID = 1
MLB_SEASON = "2024"
MLB_SPRING_TRAINING_ID = 71
MLB_TRACKED_LEAGUES = {MLB_LEAGUE_ID, MLB_SPRING_TRAINING_ID}

# MLB divisions
MLB_DIVISIONS = [
    "AL East", "AL Central", "AL West",
    "NL East", "NL Central", "NL West",
]

# Cache TTLs (seconds)
TTL = {
    "fixtures": 12 * 3600,
    "odds": 2 * 3600,
    "standings": 24 * 3600,
    "team_stats": 24 * 3600,
    "last_games": 24 * 3600,
}

# ---------------------------------------------------------------------------
# MLB Stats API team mapping (statsapi package — gratuit, sans cle)
# Source: statsapi.get('teams', {'sportId': 1})
# ---------------------------------------------------------------------------

# MLB Stats API official team IDs
MLB_STATS_TEAMS: dict[str, int] = {
    "Arizona Diamondbacks": 109,
    "Atlanta Braves": 144,
    "Baltimore Orioles": 110,
    "Boston Red Sox": 111,
    "Chicago Cubs": 112,
    "Chicago White Sox": 145,
    "Cincinnati Reds": 113,
    "Cleveland Guardians": 114,
    "Colorado Rockies": 115,
    "Detroit Tigers": 116,
    "Houston Astros": 117,
    "Kansas City Royals": 118,
    "Los Angeles Angels": 108,
    "Los Angeles Dodgers": 119,
    "Miami Marlins": 146,
    "Milwaukee Brewers": 158,
    "Minnesota Twins": 142,
    "New York Mets": 121,
    "New York Yankees": 147,
    "Oakland Athletics": 133,
    "Philadelphia Phillies": 143,
    "Pittsburgh Pirates": 134,
    "San Diego Padres": 135,
    "San Francisco Giants": 137,
    "Seattle Mariners": 136,
    "St. Louis Cardinals": 138,
    "Tampa Bay Rays": 139,
    "Texas Rangers": 140,
    "Toronto Blue Jays": 141,
    "Washington Nationals": 120,
}

# API-Sports Baseball team ID -> MLB Stats API team ID (peuple dynamiquement si besoin)
API_SPORTS_TO_MLB: dict[int, int] = {}


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_key(key_type: str, key_id: str) -> str:
    return f"abl:{key_type}:{key_id}"


def _cache_read(key_type: str, key_id: str) -> Any | None:
    return cache_get(_cache_key(key_type, key_id))


def _cache_write(key_type: str, key_id: str, payload: Any) -> None:
    ttl = TTL.get(key_type, 3600)
    _cache_set(_cache_key(key_type, key_id), payload, ttl=ttl)


# ---------------------------------------------------------------------------
# statsapi fallback — derniers matchs via MLB Stats API (synchrone)
# ---------------------------------------------------------------------------

def _resolve_mlb_stats_team_id(team_name: str) -> int | None:
    """Resout le MLB Stats API team ID a partir du nom d'equipe (fuzzy match)."""
    if not team_name:
        return None

    # Match exact
    if team_name in MLB_STATS_TEAMS:
        return MLB_STATS_TEAMS[team_name]

    # Match par substring (insensible a la casse)
    lower_name = team_name.lower()
    for canonical, tid in MLB_STATS_TEAMS.items():
        if lower_name in canonical.lower() or canonical.lower() in lower_name:
            return tid

    # Fuzzy match via difflib
    candidates = list(MLB_STATS_TEAMS.keys())
    matches = difflib.get_close_matches(team_name, candidates, n=1, cutoff=0.6)
    if matches:
        return MLB_STATS_TEAMS[matches[0]]

    return None


def _fetch_last_games_statsapi(team_name: str, n: int = 10) -> list[dict]:
    """Recupere les N derniers matchs termines d'une equipe via le package statsapi.

    Synchrone — a appeler via asyncio.to_thread() depuis du code async.
    Cache: cle abl:statsapi_last:{team_name}, TTL 24h.
    Retourne le meme format que get_last_games():
      {date, opponent, is_home, won, runs_scored, runs_allowed, score}
    """
    cache_key = f"abl:statsapi_last:{team_name}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    mlb_id = _resolve_mlb_stats_team_id(team_name)
    if mlb_id is None:
        logger.warning("statsapi: impossible de resoudre l'ID MLB pour '%s'", team_name)
        return []

    try:
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=60)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        raw_games: list[dict] = statsapi.schedule(
            team=mlb_id,
            start_date=start_str,
            end_date=end_str,
        )
    except Exception as exc:
        logger.error("statsapi.schedule error pour team='%s' (id=%s): %s", team_name, mlb_id, exc)
        return []

    # Filtrer les matchs termines
    finished = [
        g for g in raw_games
        if "final" in (g.get("status") or "").lower()
    ]

    # Trier par date DESC et prendre les N derniers
    finished.sort(key=lambda g: g.get("game_date", ""), reverse=True)
    finished = finished[:n]

    games: list[dict] = []
    for g in finished:
        try:
            home_id: int = g.get("home_id")
            away_id: int = g.get("away_id")
            home_name: str = g.get("home_name", "")
            away_name: str = g.get("away_name", "")
            home_score = g.get("home_score")
            away_score = g.get("away_score")

            is_home = (home_id == mlb_id)
            if is_home:
                runs_scored = home_score
                runs_allowed = away_score
                opponent = away_name
            else:
                runs_scored = away_score
                runs_allowed = home_score
                opponent = home_name

            won = (
                runs_scored is not None
                and runs_allowed is not None
                and int(runs_scored) > int(runs_allowed)
            )

            # statsapi retourne game_date au format YYYY-MM-DD
            game_date = g.get("game_date", "")

            games.append({
                "date": game_date,
                "opponent": opponent,
                "is_home": is_home,
                "won": won,
                "runs_scored": runs_scored,
                "runs_allowed": runs_allowed,
                "score": f"{home_score}-{away_score}" if home_score is not None else None,
            })
        except (KeyError, TypeError, ValueError):
            continue

    _cache_set(cache_key, games, ttl=TTL["last_games"])
    return games


# ---------------------------------------------------------------------------
# Quota tracker
# ---------------------------------------------------------------------------

def _quota_get() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    cached = cache_get(f"abl_quota:{today}")
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
    _cache_set(f"abl_quota:{today}", q, ttl=86400)
    if q["remaining"] < 10:
        logger.warning("API-Baseball quota low: %d remaining", q["remaining"])


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

async def _get(path: str, params: dict | None = None, _retry: int = 0) -> dict | None:
    """GET request to API-Baseball. Returns JSON or None on error."""
    url = f"{API_BASE}{path}"
    api_key = settings.API_SPORTS_KEY if hasattr(settings, "API_SPORTS_KEY") and settings.API_SPORTS_KEY else settings.API_FOOTBALL_KEY
    if not api_key:
        logger.warning("No API-Sports key configured for Baseball")
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
            logger.error("API-Baseball %s -> %d: %s", path, resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        errors = data.get("errors")
        if errors and (isinstance(errors, dict) and errors or isinstance(errors, list) and errors):
            if "rateLimit" in str(errors) and _retry < 2:
                logger.warning("API-Baseball rate limit for %s, retry %d", path, _retry + 1)
                await asyncio.sleep(7)
                return await _get(path, params, _retry + 1)
            logger.error("API-Baseball errors for %s: %s", path, errors)
            return None
        return data
    except Exception as exc:
        logger.error("API-Baseball request failed %s: %s", path, exc)
        return None


async def _get_cached(key_type: str, key_id: str, path: str, params: dict | None = None) -> Any | None:
    """GET with cache. Skips API call if quota exhausted."""
    cached = _cache_read(key_type, key_id)
    if cached is not None:
        return cached
    quota = _quota_get()
    if quota["remaining"] <= 0:
        logger.warning("API-Baseball quota exhausted for %s/%s", key_type, key_id)
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

class ApiBaseballClient:
    """Fetch MLB data from API-Sports Baseball."""

    # --- Fixtures ---

    async def get_fixtures(self, date_str: str | None = None, timeframe: str = "48h") -> list[dict]:
        """Return upcoming MLB games for a given date.

        Each dict: {game_id, date, home_id, home_name, away_id, away_name,
                    venue, league, status, inning, home_score, away_score}
        """
        if date_str is None:
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        key_id = f"mlb_{date_str}"
        raw = await _get_cached(
            "fixtures", key_id,
            "/games",
            {"date": date_str},
        )
        if not raw:
            return []
        # Filter to MLB + Spring Training (free plan doesn't support season filter)
        raw = [g for g in raw if g.get("league", {}).get("id") in MLB_TRACKED_LEAGUES]

        fixtures = []
        for g in (raw or []):
            try:
                status_short = g.get("status", {}).get("short", "")
                # Only future or live games — skip completed
                if status_short in ("FT", "POST", "CANC", "ABD", "Final"):
                    continue
                scores = g.get("scores", {})
                fixture = {
                    "game_id": g.get("id"),
                    "date": g.get("date", ""),
                    "home_id": g.get("teams", {}).get("home", {}).get("id"),
                    "home_name": g.get("teams", {}).get("home", {}).get("name", ""),
                    "away_id": g.get("teams", {}).get("away", {}).get("id"),
                    "away_name": g.get("teams", {}).get("away", {}).get("name", ""),
                    "venue": g.get("venue"),
                    "league": g.get("league", {}).get("name", "MLB"),
                    "status": status_short,
                    "inning": g.get("status", {}).get("inning"),
                    "home_score": scores.get("home", {}).get("total") if isinstance(scores.get("home"), dict) else scores.get("home"),
                    "away_score": scores.get("away", {}).get("total") if isinstance(scores.get("away"), dict) else scores.get("away"),
                }
                fixtures.append(fixture)
            except (KeyError, TypeError):
                continue
        return fixtures

    async def get_fixtures_range(self, timeframe: str = "48h") -> list[dict]:
        """Fetch fixtures for today + tomorrow (48h window)."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

        fixtures_today = await self.get_fixtures(date_str=today, timeframe=timeframe)
        fixtures_tomorrow = await self.get_fixtures(date_str=tomorrow, timeframe=timeframe)

        # Deduplicate by game_id
        seen: set = set()
        result = []
        for f in fixtures_today + fixtures_tomorrow:
            gid = f.get("game_id")
            if gid and gid not in seen:
                seen.add(gid)
                result.append(f)
        return result

    # --- Odds ---

    async def get_odds(self, game_id: int) -> dict:
        """Return odds for a MLB game.

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

                    # Moneyline / winner
                    if "winner" in label or "home/away" in label or "moneyline" in label or "match" in label:
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

                    # Totals (over/under runs)
                    elif "over" in label or "total" in label or "run" in label:
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
        """Return MLB standings by division.

        Each dict: {team_id, team_name, division, division_rank,
                    wins, losses, win_pct, games_behind, streak, form,
                    home_wins, home_losses, away_wins, away_losses,
                    runs_scored, runs_allowed}
        """
        raw = await _get_cached(
            "standings", f"mlb_{MLB_SEASON}",
            "/standings",
            {"league": MLB_LEAGUE_ID, "season": MLB_SEASON},
        )
        if not raw:
            return []

        standings = []
        # API-Sports may wrap standings in nested groups (by division) — flatten
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
                    "division": group_info.get("name", ""),
                    "division_rank": entry.get("position"),
                    "wins": wins,
                    "losses": losses,
                    "win_pct": round(wins / total, 3) if total > 0 else 0,
                    "games_behind": entry.get("games_behind"),
                    "streak": entry.get("streak"),
                    "form": entry.get("form", ""),
                    "home_wins": win_info.get("home", 0) or 0,
                    "home_losses": lose_info.get("home", 0) or 0,
                    "away_wins": win_info.get("away", 0) or 0,
                    "away_losses": lose_info.get("away", 0) or 0,
                    "runs_scored": entry.get("points", {}).get("for", 0),
                    "runs_allowed": entry.get("points", {}).get("against", 0),
                })
            except (KeyError, TypeError):
                continue
        return standings

    # --- Team statistics ---

    async def get_team_stats(self, team_id: int) -> dict:
        """Return season statistics for a MLB team.

        Returns: {games_played, wins, losses, win_pct,
                  runs_avg, runs_allowed_avg, run_diff,
                  batting_avg, obp, slg, ops,
                  era, whip, hr, hits, errors,
                  strikeouts_avg, walks_avg}
        """
        raw = await _get_cached(
            "team_stats", str(team_id),
            "/teams/statistics",
            {"team": team_id, "league": MLB_LEAGUE_ID, "season": MLB_SEASON},
        )
        if not raw:
            return {}

        try:
            s = raw if isinstance(raw, dict) else (raw[0] if raw else {})
            games = s.get("games", {})
            batting = s.get("batting", {})
            pitching = s.get("pitching", {})

            played = games.get("played", {}).get("all", 0) or 0
            wins_total = games.get("wins", {}).get("all", {}).get("total", 0) or 0
            losses_total = games.get("loses", {}).get("all", {}).get("total", 0) or 0

            runs_for = _safe_float(s.get("runs", {}).get("for", {}).get("average", {}).get("all"))
            runs_against = _safe_float(s.get("runs", {}).get("against", {}).get("average", {}).get("all"))

            return {
                "team_id": team_id,
                "games_played": played,
                "wins": wins_total,
                "losses": losses_total,
                "win_pct": round(wins_total / played, 3) if played > 0 else None,
                "runs_avg": runs_for,
                "runs_allowed_avg": runs_against,
                "run_diff": round((runs_for or 0) - (runs_against or 0), 2) if runs_for is not None and runs_against is not None else None,
                # Batting stats
                "batting_avg": _safe_float(batting.get("average")),
                "obp": _safe_float(batting.get("obp")),
                "slg": _safe_float(batting.get("slg")),
                "ops": _safe_float(batting.get("ops")),
                "hr": batting.get("home_runs"),
                "hits": batting.get("hits"),
                "strikeouts_avg": _safe_float(batting.get("strikeouts", {}).get("average") if isinstance(batting.get("strikeouts"), dict) else batting.get("strikeouts")),
                "walks_avg": _safe_float(batting.get("walks", {}).get("average") if isinstance(batting.get("walks"), dict) else batting.get("walks")),
                # Pitching stats
                "era": _safe_float(pitching.get("era")),
                "whip": _safe_float(pitching.get("whip")),
                "errors": s.get("errors"),
            }
        except Exception as exc:
            logger.error("Baseball team_stats parse error team=%d: %s", team_id, exc)
            return {}

    # --- Last games (form + rest days) ---

    async def get_last_games(
        self,
        team_id: int,
        n: int = 10,
        team_name: str | None = None,
    ) -> list[dict]:
        """Return last N games for a team.

        Tente d'abord l'API-Sports (parametre `last`). Si le resultat est vide
        (le free plan bloque ce parametre), bascule sur le package statsapi
        (MLB Stats API officiel, gratuit, sans cle).

        Parametre additionnel team_name : nom de l'equipe pour le fallback statsapi.
        Si non fourni, le fallback n'est pas tente.

        Each dict: {date, opponent, is_home, won, runs_scored, runs_allowed, score}
        """
        raw = await _get_cached(
            "last_games", f"{team_id}_last{n}",
            "/games",
            {"team": team_id, "league": MLB_LEAGUE_ID, "last": n},
        )

        if not raw:
            # Fallback statsapi si team_name disponible
            if team_name:
                logger.info(
                    "get_last_games: API-Sports vide pour team_id=%d, fallback statsapi (team_name='%s')",
                    team_id, team_name,
                )
                try:
                    return await asyncio.to_thread(_fetch_last_games_statsapi, team_name, n)
                except Exception as exc:
                    logger.error("statsapi fallback erreur pour team='%s': %s", team_name, exc)
            return []

        games = []
        for g in raw:
            try:
                home_team = g.get("teams", {}).get("home", {})
                away_team = g.get("teams", {}).get("away", {})
                scores = g.get("scores", {})

                # Scores can be int or dict with total key
                home_raw = scores.get("home")
                away_raw = scores.get("away")
                home_score = home_raw.get("total") if isinstance(home_raw, dict) else home_raw
                away_score = away_raw.get("total") if isinstance(away_raw, dict) else away_raw

                is_home = (home_team.get("id") == team_id)
                if is_home:
                    runs_scored = home_score
                    runs_allowed = away_score
                    opponent = away_team.get("name", "")
                else:
                    runs_scored = away_score
                    runs_allowed = home_score
                    opponent = home_team.get("name", "")

                won = runs_scored is not None and runs_allowed is not None and runs_scored > runs_allowed

                games.append({
                    "date": g.get("date", ""),
                    "opponent": opponent,
                    "is_home": is_home,
                    "won": won,
                    "runs_scored": runs_scored,
                    "runs_allowed": runs_allowed,
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
        {win_rate_10, runs_avg_10, runs_allowed_10, run_diff_10, streak,
         form, rest_days, division, division_rank, season_wins, season_losses,
         batting_avg, era, last_5_results, ...}
        """
        stats: dict = {}

        # From last games
        if last_games:
            n = len(last_games)
            wins = sum(1 for g in last_games if g.get("won"))
            stats["win_rate_10"] = round(wins / n, 3) if n > 0 else None

            runs_scored = [g["runs_scored"] for g in last_games if g.get("runs_scored") is not None]
            runs_allowed = [g["runs_allowed"] for g in last_games if g.get("runs_allowed") is not None]
            stats["runs_avg_10"] = round(sum(runs_scored) / len(runs_scored), 2) if runs_scored else None
            stats["runs_allowed_10"] = round(sum(runs_allowed) / len(runs_allowed), 2) if runs_allowed else None

            if stats["runs_avg_10"] is not None and stats["runs_allowed_10"] is not None:
                stats["run_diff_10"] = round(stats["runs_avg_10"] - stats["runs_allowed_10"], 2)
            else:
                stats["run_diff_10"] = None

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
                else:
                    stats["rest_days"] = None
            except Exception:
                stats["rest_days"] = None

            # Home/away split from last games
            home_games = [g for g in last_games if g.get("is_home")]
            away_games = [g for g in last_games if not g.get("is_home")]
            if home_games:
                stats["home_win_rate"] = round(sum(1 for g in home_games if g["won"]) / len(home_games), 3)
            if away_games:
                stats["away_win_rate"] = round(sum(1 for g in away_games if g["won"]) / len(away_games), 3)

            # Recent results for display
            stats["last_5_results"] = [
                {
                    "opponent": g["opponent"],
                    "score": g.get("score"),
                    "won": g["won"],
                    "is_home": g["is_home"],
                }
                for g in last_games[-5:]
            ]

        # From standings
        if standings_entry:
            stats["division"] = standings_entry.get("division")
            stats["division_rank"] = standings_entry.get("division_rank")
            stats["season_wins"] = standings_entry.get("wins")
            stats["season_losses"] = standings_entry.get("losses")
            stats["season_win_pct"] = standings_entry.get("win_pct")
            stats["games_behind"] = standings_entry.get("games_behind")
            stats["home_record"] = f"{standings_entry.get('home_wins', 0)}-{standings_entry.get('home_losses', 0)}"
            stats["away_record"] = f"{standings_entry.get('away_wins', 0)}-{standings_entry.get('away_losses', 0)}"

        # From team stats (season-level baseball stats)
        if team_stats:
            stats["batting_avg"] = team_stats.get("batting_avg")
            stats["obp"] = team_stats.get("obp")
            stats["slg"] = team_stats.get("slg")
            stats["ops"] = team_stats.get("ops")
            stats["era"] = team_stats.get("era")
            stats["whip"] = team_stats.get("whip")
            stats["hr"] = team_stats.get("hr")
            stats["hits"] = team_stats.get("hits")
            stats["errors"] = team_stats.get("errors")
            stats["strikeouts_avg"] = team_stats.get("strikeouts_avg")
            stats["walks_avg"] = team_stats.get("walks_avg")
            # Season-level runs (more stable than 10-game window)
            stats["season_runs_avg"] = team_stats.get("runs_avg")
            stats["season_runs_allowed_avg"] = team_stats.get("runs_allowed_avg")

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
