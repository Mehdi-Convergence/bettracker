"""Rugby historical data collector using API-Sports (api-rugby.com).

API base: https://v1.rugby.api-sports.io/
The same API key (API_FOOTBALL_KEY) is used — same platform (api-sports.io).

Leagues collected:
  - Top 14 (France)            league_id = 16
  - Premiership (England)      league_id = 13
  - URC (United Rugby Championship) league_id = 76
  - Champions Cup              league_id = 54

Seasons: 2019 to 2025

Usage:
    uv run python -m src.data.rugby_collector
"""

import logging
import time
from datetime import date

import httpx

from src.config import settings
from src.database import SessionLocal
from src.models.rugby_match import RugbyMatch

logger = logging.getLogger(__name__)

API_BASE = "https://v1.rugby.api-sports.io"

# Rugby league IDs on api-sports.io
RUGBY_LEAGUES: dict[int, str] = {
    16:  "Top 14",
    13:  "Premiership",
    76:  "URC",
    54:  "Champions Cup",
}

SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025]

_REQUEST_DELAY = 1.0  # seconds between API calls (free tier is rate-limited)


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(float(val)) if val is not None and str(val).strip() not in ("", "null", "None") else None
    except (TypeError, ValueError):
        return None


class RugbyCollector:
    """Fetch rugby historical match data from API-Sports."""

    def __init__(self, api_key: str = settings.API_FOOTBALL_KEY):
        self.api_key = api_key
        self.headers = {
            "x-rapidapi-host": "v1.rugby.api-sports.io",
            "x-apisports-key": api_key,
        }

    def _get(self, endpoint: str, params: dict) -> dict:
        time.sleep(_REQUEST_DELAY)
        try:
            resp = httpx.get(
                f"{API_BASE}/{endpoint}",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            logger.error("API-Rugby request failed: %s", e)
            return {}

    def get_games(self, league_id: int, season: int) -> list[dict]:
        """Fetch all games for a league/season. Returns list of raw game dicts."""
        logger.info("Fetching league=%d season=%d...", league_id, season)
        data = self._get("games", {"league": league_id, "season": season})
        response = data.get("response", [])
        logger.info("  %d games found", len(response))
        return response

    def parse_game(self, raw: dict, league_id: int, season: int) -> dict | None:
        """Parse a raw API-Sports game response into a dict for RugbyMatch.

        The API returns fields at the top level (no "game" wrapper key):
          raw["id"], raw["date"], raw["status"], raw["teams"], raw["scores"]
        """
        try:
            teams = raw.get("teams", {})
            scores = raw.get("scores", {})

            game_id = str(raw.get("id", ""))
            date_str = raw.get("date", "")
            status = raw.get("status", {}).get("short", "")

            # Only process finished games
            if status not in ("FT", "WO"):
                return None

            try:
                match_date = date.fromisoformat(date_str[:10]) if date_str else None
            except ValueError:
                match_date = None

            if not match_date:
                return None

            home_team = teams.get("home", {})
            away_team = teams.get("away", {})

            home_name = home_team.get("name", "")
            away_name = away_team.get("name", "")
            home_id = _safe_int(home_team.get("id"))
            away_id = _safe_int(away_team.get("id"))

            if not home_name or not away_name:
                return None

            home_score_val = scores.get("home")
            away_score_val = scores.get("away")

            # Half-time scores (available via "periods" key)
            periods = raw.get("periods", {}) or {}
            home_ht = _safe_int(periods.get("first", {}).get("home") if isinstance(periods.get("first"), dict) else None)
            away_ht = _safe_int(periods.get("first", {}).get("away") if isinstance(periods.get("first"), dict) else None)

            return {
                "match_id": game_id,
                "season": str(season),
                "match_date": match_date,
                "league": RUGBY_LEAGUES.get(league_id, "Rugby"),
                "league_id": league_id,
                "home_team": home_name,
                "away_team": away_name,
                "home_team_id": home_id,
                "away_team_id": away_id,
                "home_score": _safe_int(home_score_val),
                "away_score": _safe_int(away_score_val),
                # Scoring breakdown — not available in base API tier, left as None
                "home_tries": None,
                "away_tries": None,
                "home_conversions": None,
                "away_conversions": None,
                "home_penalties": None,
                "away_penalties": None,
                "home_drop_goals": None,
                "away_drop_goals": None,
            }
        except Exception as e:
            logger.debug("Failed to parse game: %s", e)
            return None


def save_games(db, games: list[dict]) -> tuple[int, int]:
    """Save parsed games to DB. Returns (inserted, skipped)."""
    inserted = 0
    skipped = 0
    for g in games:
        if not g:
            continue
        mid = g.get("match_id")
        if mid and db.query(RugbyMatch).filter(RugbyMatch.match_id == mid).first():
            skipped += 1
            continue
        obj = RugbyMatch(**{k: v for k, v in g.items() if hasattr(RugbyMatch, k)})
        db.add(obj)
        inserted += 1
    db.commit()
    return inserted, skipped


def collect_all() -> None:
    """Collect all seasons for all leagues and save to DB."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if not settings.API_FOOTBALL_KEY:
        logger.error("API_FOOTBALL_KEY not configured — cannot collect rugby data.")
        return

    collector = RugbyCollector()
    db = SessionLocal()
    total_inserted = 0
    total_skipped = 0

    try:
        for league_id, league_name in RUGBY_LEAGUES.items():
            for season in SEASONS:
                raw_games = collector.get_games(league_id, season)
                parsed = [collector.parse_game(g, league_id, season) for g in raw_games]
                parsed = [p for p in parsed if p is not None]
                if parsed:
                    ins, skip = save_games(db, parsed)
                    total_inserted += ins
                    total_skipped += skip
                    logger.info("  %s %s: %d inserted, %d skipped", league_name, season, ins, skip)

        total = db.query(RugbyMatch).count()
        logger.info(
            "Done. Total inserted: %d, skipped: %d. DB total: %d",
            total_inserted, total_skipped, total,
        )
    finally:
        db.close()


if __name__ == "__main__":
    collect_all()
