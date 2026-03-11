"""API-Football client — unified cache via src/cache.py (Redis + in-memory).

Replaces claude_researcher.py for structured football data:
fixtures, standings, H2H, injuries, team stats, odds, lineups, players.

Cache TTLs:
  fixtures      12h   standings    24h   h2h     48h
  team_stats    12h   injuries      2h   odds    30min
  lineup        30min squad        24h   topscorers 24h
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from src.cache import cache_get, cache_set as _cache_set_global
from src.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path("data/cache/api_football")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# TTLs in seconds
TTL = {
    "fixtures":     12 * 3600,
    "standings":    24 * 3600,
    "h2h":          48 * 3600,
    "team_stats":   12 * 3600,
    "injuries":      2 * 3600,
    "odds":              1800,
    "lineup":            1800,
    "squad":        24 * 3600,
    "topscorers":   24 * 3600,
    "fixture_stats":12 * 3600,
}

# BetTracker league codes → API-Football league IDs
LEAGUE_ID_MAP: dict[str, int] = {
    # --- Ligues (16) ---
    "E0": 39,   # Premier League
    "F1": 61,   # Ligue 1
    "D1": 78,   # Bundesliga
    "SP1": 140, # La Liga
    "I1": 135,  # Serie A
    "N1": 88,   # Eredivisie
    "E1": 40,   # Championship
    "D2": 79,   # 2. Bundesliga
    "I2": 136,  # Serie B
    "SP2": 141, # La Liga 2
    "F2": 62,   # Ligue 2
    "P1": 94,   # Primeira Liga
    "B1": 144,  # Pro League (Belgique)
    "T1": 203,  # Super Lig (Turquie)
    "G1": 197,  # Super League (Grece)
    "SC0": 179, # Scottish Premiership
    # --- Coupes domestiques ---
    "EFA": 45,  # FA Cup (Angleterre)
    "EFLC": 48, # Carabao Cup (Angleterre)
    "FCF": 66,  # Coupe de France
    "DDFB": 81, # DFB Pokal (Allemagne)
    "SPDR": 143,# Copa del Rey (Espagne)
    "ICI": 137, # Coppa Italia
    "NKNVB": 90,# KNVB Cup (Pays-Bas)
    "PTP": 96,  # Taca de Portugal
    "BCB": 148, # Coupe de Belgique
    "TTC": 209, # Coupe de Turquie
    "GGC": 200, # Coupe de Grece
    "SCFA": 182,# Scottish FA Cup
    # --- Coupes europeennes ---
    "UCL": 2,   # UEFA Champions League
    "UEL": 3,   # UEFA Europa League
    "UECL": 848,# UEFA Conference League
}
LEAGUE_ID_TO_CODE = {v: k for k, v in LEAGUE_ID_MAP.items()}

SEASON = 2025  # saison 2025-2026 (courante en mars 2026)
HOME_ADVANTAGE = 1.10  # facteur Poisson domicile


# ---------------------------------------------------------------------------
# Cache helpers — unified via src/cache.py (Redis + in-memory)
# ---------------------------------------------------------------------------

def _cache_key(key_type: str, key_id: str) -> str:
    """Build Redis-compatible cache key."""
    return f"af:{key_type}:{key_id}"


def _cache_read(key_type: str, key_id: str) -> Any | None:
    return cache_get(_cache_key(key_type, key_id))


def _cache_write(key_type: str, key_id: str, payload: Any) -> None:
    ttl = TTL.get(key_type, 3600)
    _cache_set_global(_cache_key(key_type, key_id), payload, ttl=ttl)


# ---------------------------------------------------------------------------
# Quota tracker — shared via Redis (or in-memory fallback)
# ---------------------------------------------------------------------------

def _quota_get() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    cached = cache_get(f"af_quota:{today}")
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
    _cache_set_global(f"af_quota:{today}", q, ttl=86400)
    if q["remaining"] < 10:
        logger.warning("API-Football quota low: %d requests remaining today", q["remaining"])


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

async def _get(path: str, params: dict | None = None, _retry: int = 0) -> dict | None:
    """Single GET to API-Football. Returns response JSON or None on error.
    Auto-retries once on rate limit (429 or rateLimit error) with 7s delay."""
    url = f"https://v3.football.api-sports.io{path}"
    headers = {"x-apisports-key": settings.API_FOOTBALL_KEY}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers, params=params or {})
        remaining = resp.headers.get("x-ratelimit-requests-remaining")  # daily quota
        _quota_update(int(remaining) if remaining and remaining.isdigit() else None)
        if resp.status_code == 429 and _retry < 2:
            await asyncio.sleep(7)
            return await _get(path, params, _retry + 1)
        if resp.status_code != 200:
            logger.error("API-Football %s -> %d: %s", path, resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        errors = data.get("errors", {})
        if errors:
            if "rateLimit" in str(errors) and _retry < 2:
                logger.warning("Rate limit hit for %s, retrying in 7s (attempt %d)", path, _retry + 1)
                await asyncio.sleep(7)
                return await _get(path, params, _retry + 1)
            logger.error("API-Football errors for %s: %s", path, errors)
            return None
        return data
    except Exception as exc:
        logger.error("API-Football request failed %s: %s", path, exc)
        return None


async def _get_cached(key_type: str, key_id: str, path: str, params: dict | None = None) -> Any | None:
    """Get with cache. Falls back to stale cache if quota exhausted."""
    cached = _cache_read(key_type, key_id)
    if cached is not None:
        return cached

    quota = _quota_get()
    if quota["remaining"] <= 0:
        logger.warning("API-Football quota exhausted, serving stale cache for %s/%s", key_type, key_id)
        p = _cache_path(key_type, key_id)
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8")).get("payload")
            except Exception:
                pass
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

class ApiFootballClient:

    # --- Fixtures ---

    async def get_fixtures(self, league_codes: list[str], timeframe: str = "48h") -> list[dict]:
        """Return upcoming fixtures for given league codes within timeframe."""
        # Convert timeframe to date range
        now = datetime.now()
        hours_map = {"24h": 24, "48h": 48, "72h": 72, "1w": 168, "1m": 720}
        hours = hours_map.get(timeframe, 48)
        date_from = now.strftime("%Y-%m-%d")
        date_to = (now + timedelta(hours=hours)).strftime("%Y-%m-%d")

        league_ids = [LEAGUE_ID_MAP[c] for c in (league_codes or list(LEAGUE_ID_MAP.keys())) if c in LEAGUE_ID_MAP]
        if not league_ids:
            return []

        all_fixtures: list[dict] = []
        for league_id in league_ids:
            key_id = f"{league_id}_{SEASON}_{date_from}_{date_to}"
            fixtures = await _get_cached(
                "fixtures", key_id,
                "/fixtures",
                {"league": league_id, "season": SEASON, "from": date_from, "to": date_to},
            )
            if fixtures:
                all_fixtures.extend(fixtures)

        return all_fixtures

    async def get_last_fixture_date(self, team_id: int) -> datetime | None:
        """Return the date of the team's most recent played match (for rest_days calc)."""
        raw = await _get_cached(
            "fixtures", f"last_{team_id}",
            "/fixtures",
            {"team": team_id, "season": SEASON, "last": 1},
        )
        if not raw:
            return None
        try:
            dt_str = raw[0]["fixture"]["date"]
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00")).replace(tzinfo=None)
        except (KeyError, IndexError, TypeError):
            return None

    # --- Standings ---

    async def get_standings(self, league_id: int) -> list[dict]:
        """Return standings for a league. Each entry: {rank, team_id, team_name, points, form, goals_for, goals_against, home_rank, away_rank}"""
        raw = await _get_cached(
            "standings", str(league_id),
            "/standings",
            {"league": league_id, "season": SEASON},
        )
        if not raw:
            return []
        try:
            standings_groups = raw[0]["league"]["standings"]
            result = []
            for group in standings_groups:
                for entry in group:
                    result.append({
                        "rank": entry["rank"],
                        "team_id": entry["team"]["id"],
                        "team_name": entry["team"]["name"],
                        "points": entry["points"],
                        "played": entry["all"]["played"],
                        "wins": entry["all"]["win"],
                        "draws": entry["all"]["draw"],
                        "losses": entry["all"]["lose"],
                        "goals_for": entry["all"]["goals"]["for"],
                        "goals_against": entry["all"]["goals"]["against"],
                        "form": entry.get("form", ""),
                        "home_wins": entry["home"]["win"],
                        "home_draws": entry["home"]["draw"],
                        "home_losses": entry["home"]["lose"],
                        "away_wins": entry["away"]["win"],
                        "away_draws": entry["away"]["draw"],
                        "away_losses": entry["away"]["lose"],
                    })
            return result
        except (KeyError, IndexError, TypeError) as exc:
            logger.error("standings parse error for league %d: %s", league_id, exc)
            return []

    def _find_rank(self, standings: list[dict], team_id: int) -> int | None:
        for s in standings:
            if s["team_id"] == team_id:
                return s["rank"]
        return None

    # --- H2H ---

    async def get_h2h(self, team1_id: int, team2_id: int, last: int = 10) -> list[dict]:
        """Return last N H2H matches as [{date, home_id, home_name, away_id, away_name, score_h, score_a, winner_id}]"""
        key_id = f"{min(team1_id, team2_id)}_{max(team1_id, team2_id)}"
        raw = await _get_cached(
            "h2h", key_id,
            "/fixtures/headtohead",
            {"h2h": f"{team1_id}-{team2_id}", "last": last},
        )
        if not raw:
            return []
        result = []
        for m in raw:
            try:
                result.append({
                    "date": m["fixture"]["date"][:10],
                    "home_id": m["teams"]["home"]["id"],
                    "home_name": m["teams"]["home"]["name"],
                    "away_id": m["teams"]["away"]["id"],
                    "away_name": m["teams"]["away"]["name"],
                    "score_h": m["goals"]["home"],
                    "score_a": m["goals"]["away"],
                    "winner_id": (m["teams"]["home"]["id"] if m["teams"]["home"].get("winner")
                                  else m["teams"]["away"]["id"] if m["teams"]["away"].get("winner")
                                  else None),
                })
            except (KeyError, TypeError):
                pass
        return result

    def _h2h_summary(self, h2h: list[dict], home_team_id: int) -> str:
        """Build '5V 2N 3D' summary from H2H list, from home_team perspective."""
        wins = sum(1 for m in h2h if m.get("winner_id") == home_team_id)
        draws = sum(1 for m in h2h if m.get("winner_id") is None and m.get("score_h") is not None)
        losses = len(h2h) - wins - draws
        return f"{wins}V {draws}N {losses}D"

    # --- Injuries ---

    async def get_injuries(self, fixture_id: int) -> list[dict]:
        """Return [{player_id, player_name, team_id, type, reason}]"""
        raw = await _get_cached(
            "injuries", str(fixture_id),
            "/injuries",
            {"fixture": fixture_id},
        )
        if not raw:
            return []
        result = []
        for entry in raw:
            try:
                result.append({
                    "player_id": entry["player"]["id"],
                    "player_name": entry["player"]["name"],
                    "team_id": entry["team"]["id"],
                    "type": entry["player"].get("type", ""),
                    "reason": entry["player"].get("reason", ""),
                })
            except (KeyError, TypeError):
                pass
        return result

    # --- Team statistics ---

    async def get_team_stats(self, team_id: int, league_id: int) -> dict:
        """Return team season stats including goals avg, form, clean sheets, BTTS%."""
        key_id = f"{team_id}_{league_id}"
        raw = await _get_cached(
            "team_stats", key_id,
            "/teams/statistics",
            {"team": team_id, "league": league_id, "season": SEASON},
        )
        if not raw:
            return {}
        try:
            s = raw  # /teams/statistics returns object, not list
            goals_for = s.get("goals", {}).get("for", {})
            goals_against = s.get("goals", {}).get("against", {})
            clean_sheets = s.get("clean_sheet", {})
            failed_score = s.get("failed_to_score", {})
            fixtures = s.get("fixtures", {})

            def _avg(d: dict, venue: str) -> float | None:
                val = d.get("average", {}).get(venue)
                try:
                    return float(val) if val is not None else None
                except (ValueError, TypeError):
                    return None

            def _int(d: dict, venue: str) -> int | None:
                val = d.get(venue)
                return int(val) if val is not None else None

            form_raw = s.get("form", "") or ""

            # Extra fields we already pay for but weren't parsing
            shots = s.get("shots", {})
            shots_on = shots.get("on", {})
            shots_total = shots.get("total", {})
            possession = s.get("possession", {})
            corners = s.get("corners", {})
            cards_yellow = s.get("cards", {}).get("yellow", {})
            cards_red = s.get("cards", {}).get("red", {})
            passes_acc = s.get("passes", {}).get("accuracy", {})

            # BTTS % — compute from goals data
            played_h = _int(fixtures.get("played", {}), "home") or 1
            played_a = _int(fixtures.get("played", {}), "away") or 1
            # Goals scored AND conceded in same match = rough BTTS proxy
            gs_home = goals_for.get("total", {}).get("home") or 0
            gc_home = goals_against.get("total", {}).get("home") or 0
            gs_away = goals_for.get("total", {}).get("away") or 0
            gc_away = goals_against.get("total", {}).get("away") or 0
            fts_home = _int(failed_score, "home") or 0
            fts_away = _int(failed_score, "away") or 0
            cs_home = _int(clean_sheets, "home") or 0
            cs_away = _int(clean_sheets, "away") or 0
            btts_home = round((played_h - fts_home - cs_home) / played_h * 100, 1) if played_h else None
            btts_away = round((played_a - fts_away - cs_away) / played_a * 100, 1) if played_a else None

            # xG approximation from shots on target × historical conversion rate (~0.33)
            sot_h = _avg(shots_on, "home")
            sot_a = _avg(shots_on, "away")
            xg_home = round(sot_h * 0.33, 2) if sot_h else None
            xg_away = round(sot_a * 0.33, 2) if sot_a else None

            return {
                "team_id": team_id,
                "league_id": league_id,
                "form": form_raw[-5:],  # last 5 results (WWDLW)
                "played_home": _int(fixtures.get("played", {}), "home"),
                "played_away": _int(fixtures.get("played", {}), "away"),
                "wins_home": _int(fixtures.get("wins", {}), "home"),
                "wins_away": _int(fixtures.get("wins", {}), "away"),
                "draws_home": _int(fixtures.get("draws", {}), "home"),
                "draws_away": _int(fixtures.get("draws", {}), "away"),
                "losses_home": _int(fixtures.get("losses", {}), "home"),
                "losses_away": _int(fixtures.get("losses", {}), "away"),
                "goals_scored_avg_home": _avg(goals_for, "home"),
                "goals_scored_avg_away": _avg(goals_for, "away"),
                "goals_scored_avg_total": _avg(goals_for, "total"),
                "goals_conceded_avg_home": _avg(goals_against, "home"),
                "goals_conceded_avg_away": _avg(goals_against, "away"),
                "goals_conceded_avg_total": _avg(goals_against, "total"),
                "clean_sheets_home": _int(clean_sheets, "home"),
                "clean_sheets_away": _int(clean_sheets, "away"),
                "failed_to_score_home": _int(failed_score, "home"),
                "failed_to_score_away": _int(failed_score, "away"),
                # --- Newly parsed fields (0 extra API calls) ---
                "home_shots_pg": _avg(shots_total, "home"),
                "away_shots_pg": _avg(shots_total, "away"),
                "home_sot_pg": sot_h,
                "away_sot_pg": sot_a,
                "home_possession_avg": _avg(possession, "home"),
                "away_possession_avg": _avg(possession, "away"),
                "home_corners_pg": _avg(corners, "home"),
                "away_corners_pg": _avg(corners, "away"),
                "home_yellow_cards_pg": _avg(cards_yellow, "home"),
                "away_yellow_cards_pg": _avg(cards_yellow, "away"),
                "home_red_cards_total": _int(cards_red, "home"),
                "away_red_cards_total": _int(cards_red, "away"),
                "home_pass_accuracy": _avg(passes_acc, "home"),
                "away_pass_accuracy": _avg(passes_acc, "away"),
                "home_btts_pct": btts_home,
                "away_btts_pct": btts_away,
                "home_xg_avg": xg_home,
                "away_xg_avg": xg_away,
            }
        except Exception as exc:
            logger.error("team_stats parse error team=%d league=%d: %s", team_id, league_id, exc)
            return {}

    # --- Odds ---

    async def get_odds(self, fixture_id: int) -> dict:
        """Return odds dict: {1x2: {H: {bet365: 1.85, ...}, D: {...}, A: {...}}, btts: {...}, ...}"""
        raw = await _get_cached(
            "odds", str(fixture_id),
            "/odds",
            {"fixture": fixture_id},
        )
        if not raw:
            return {}
        try:
            result: dict[str, dict] = {}
            bookmakers = raw[0].get("bookmakers", []) if raw else []
            for bk in bookmakers:
                bk_name = bk.get("name", "unknown")
                for bet in bk.get("bets", []):
                    bet_name = bet.get("name", "").lower()
                    market_key = _normalize_market_name(bet_name)
                    if not market_key:
                        continue
                    if market_key not in result:
                        result[market_key] = {}
                    for val in bet.get("values", []):
                        outcome = _normalize_outcome(market_key, val.get("value", ""))
                        if outcome:
                            if outcome not in result[market_key]:
                                result[market_key][outcome] = {}
                            try:
                                result[market_key][outcome][bk_name] = float(val["odd"])
                            except (ValueError, KeyError):
                                pass
            return result
        except Exception as exc:
            logger.error("odds parse error fixture=%d: %s", fixture_id, exc)
            return {}

    # --- Lineups ---

    async def get_lineup(self, fixture_id: int) -> dict | None:
        """Return lineup if confirmed, else None. Format: {home: [{name, pos, number}], away: [...]}"""
        raw = await _get_cached(
            "lineup", str(fixture_id),
            "/fixtures/lineups",
            {"fixture": fixture_id},
        )
        if not raw or len(raw) < 2:
            return None
        try:
            result = {}
            for team_data in raw:
                team_name = team_data["team"]["name"]
                players = []
                for p in team_data.get("startXI", []):
                    players.append({
                        "name": p["player"]["name"],
                        "pos": p["player"].get("pos", ""),
                        "number": p["player"].get("number"),
                    })
                result[team_name] = players
            return result if result else None
        except Exception as exc:
            logger.error("lineup parse error fixture=%d: %s", fixture_id, exc)
            return None

    # --- Squad (fallback for presumed lineup) ---

    async def get_squad(self, team_id: int) -> list[dict]:
        """Return squad [{player_id, name, position, age}]"""
        raw = await _get_cached(
            "squad", str(team_id),
            "/players/squads",
            {"team": team_id},
        )
        if not raw:
            return []
        try:
            players = []
            for entry in raw:
                for p in entry.get("players", []):
                    players.append({
                        "player_id": p["id"],
                        "name": p["name"],
                        "position": p.get("position", ""),
                        "age": p.get("age"),
                    })
            return players
        except Exception as exc:
            logger.error("squad parse error team=%d: %s", team_id, exc)
            return []

    # --- Top scorers ---

    async def get_topscorers(self, league_id: int) -> list[dict]:
        """Return [{player_id, name, team_id, goals, assists, rating}]"""
        raw = await _get_cached(
            "topscorers", str(league_id),
            "/players/topscorers",
            {"league": league_id, "season": SEASON},
        )
        if not raw:
            return []
        result = []
        for entry in raw:
            try:
                stats = entry.get("statistics", [{}])[0]
                goals = stats.get("goals", {})
                games = stats.get("games", {})
                result.append({
                    "player_id": entry["player"]["id"],
                    "name": entry["player"]["name"],
                    "team_id": stats.get("team", {}).get("id"),
                    "goals": goals.get("total") or 0,
                    "assists": goals.get("assists") or 0,
                    "played": games.get("appearences") or 1,
                    "rating": float(games.get("rating") or 0),
                })
            except (KeyError, TypeError, IndexError):
                pass
        return result

    # --- High-level helpers ---

    async def get_team_key_players(
        self,
        team_id: int,
        league_id: int,
        injured_player_ids: list[int],
        topscorers: list[dict],
        max_players: int = 5,
    ) -> list[dict]:
        """Build key players list: top scorers of this team, with absence flag."""
        team_scorers = [p for p in topscorers if p.get("team_id") == team_id][:max_players]
        result = []
        for p in team_scorers:
            played = max(p["played"], 1)
            result.append({
                "name": p["name"],
                "goals": p["goals"],
                "assists": p["assists"],
                "goals_per_match": round(p["goals"] / played, 2),
                "rating": p["rating"],
                "is_absent": p["player_id"] in injured_player_ids,
            })
        return result

    async def get_presumed_lineup(
        self,
        team_id: int,
        injured_player_ids: list[int],
    ) -> list[dict]:
        """Build presumed lineup: squad members not injured, sorted by position."""
        squad = await self.get_squad(team_id)
        position_order = {"Goalkeeper": 0, "Defender": 1, "Midfielder": 2, "Attacker": 3}
        available = [p for p in squad if p["player_id"] not in injured_player_ids]
        available.sort(key=lambda p: position_order.get(p.get("position", ""), 9))
        return [{"name": p["name"], "pos": p["position"][:2] if p["position"] else "", "number": None}
                for p in available[:11]]

    def form_to_bettracker(self, form_api: str) -> str:
        """Convert API-Football form 'WWDLW' to BetTracker 'VVNDN' (V/N/D)."""
        mapping = {"W": "V", "D": "N", "L": "D"}
        return "".join(mapping.get(c, c) for c in (form_api or "").upper())


# ---------------------------------------------------------------------------
# Helpers for odds normalization
# ---------------------------------------------------------------------------

_MARKET_NAMES = {
    "match winner": "1x2",
    "match result": "1x2",
    "1x2": "1x2",
    "both teams score": "btts",
    "both teams to score": "btts",
    "btts": "btts",
    "goals over/under": "over_under",
    "goals over under": "over_under",
    "over/under": "over_under",
    "anytime score": "goalscorer_anytime",
    "anytime goalscorer": "goalscorer_anytime",
    "first goalscorer": "goalscorer_first",
    "last goalscorer": "goalscorer_last",
    "double chance": "double_chance",
    "draw no bet": "draw_no_bet",
    "asian handicap": "asian_handicap",
}


def _normalize_market_name(name: str) -> str | None:
    return _MARKET_NAMES.get(name.lower().strip())


def _normalize_outcome(market: str, value: str) -> str | None:
    if market == "1x2":
        v = value.upper().strip()
        if v in ("HOME", "1"):
            return "H"
        if v in ("DRAW", "X"):
            return "D"
        if v in ("AWAY", "2"):
            return "A"
        return v if v in ("H", "D", "A") else None
    if market == "btts":
        v = value.lower().strip()
        if v in ("yes", "oui"):
            return "Yes"
        if v in ("no", "non"):
            return "No"
        return value
    if market in ("over_under", "double_chance", "draw_no_bet", "asian_handicap"):
        return value
    if market in ("goalscorer_anytime", "goalscorer_first", "goalscorer_last"):
        return value  # player name
    return value
