"""MLB historical data collector using MLB-StatsAPI (free, no key required).

Collects Regular Season game data for seasons 2019-2025.
Stores results in mlb_games table.

Usage:
    uv run python -m src.data.mlb_collector
"""

import logging
import time
from datetime import date, datetime

import statsapi

from src.database import SessionLocal
from src.models.mlb_game import MLBGame

logger = logging.getLogger(__name__)

# Seasons to collect
SEASONS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025"]

# Rate limiting — be respectful of the MLB Stats API
_REQUEST_DELAY = 0.5  # seconds between API calls


def _safe_int(val) -> int | None:
    try:
        return int(val) if val is not None and str(val).strip() != "" else None
    except (TypeError, ValueError):
        return None


def _safe_str(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _parse_date(date_str: str) -> date | None:
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except (ValueError, TypeError):
            continue
    # Try parsing just the first 10 chars as YYYY-MM-DD
    try:
        return datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _fetch_boxscore(game_id: int) -> dict:
    """Fetch boxscore data for a single game. Returns empty dict on failure."""
    time.sleep(_REQUEST_DELAY)
    try:
        data = statsapi.boxscore_data(game_id)
        return data or {}
    except Exception as e:
        logger.debug("Boxscore fetch failed for game %d: %s", game_id, e)
        return {}


def collect_season(season: str, with_details: bool = False) -> list[dict]:
    """Fetch all Regular Season games for a season via statsapi.schedule.

    Args:
        season: Season year string, e.g. "2024"
        with_details: If True, fetch boxscore for each game (slow — 1 API call per game)
    """
    logger.info("Fetching MLB %s...", season)

    start_date = f"{season}-03-20"
    end_date = f"{season}-11-05"

    try:
        schedule = statsapi.schedule(start_date=start_date, end_date=end_date)
    except Exception as e:
        logger.warning("Schedule fetch failed for %s: %s", season, e)
        return []

    if not schedule:
        logger.info("  No games found for %s", season)
        return []

    # Filter to completed games
    completed = [g for g in schedule if g.get("status") in ("Final", "Completed Early", "Game Over")]
    logger.info("  %d completed games found for %s", len(completed), season)

    games = []
    for entry in completed:
        game_id = _safe_int(entry.get("game_id"))
        game_date_str = entry.get("game_date", "")
        gdate = _parse_date(game_date_str) if game_date_str else None

        if not game_id or not gdate:
            continue

        game: dict = {
            "game_id": game_id,
            "season": season,
            "game_date": gdate,
            "home_team": _safe_str(entry.get("home_name")),
            "away_team": _safe_str(entry.get("away_name")),
            "home_team_id": _safe_int(entry.get("home_id")),
            "away_team_id": _safe_int(entry.get("away_id")),
            "home_score": _safe_int(entry.get("home_score")),
            "away_score": _safe_int(entry.get("away_score")),
            "innings": 9,
            # Box score details (populated below if with_details=True)
            "home_hits": None,
            "away_hits": None,
            "home_errors": None,
            "away_errors": None,
            "home_starter_name": None,
            "away_starter_name": None,
            "home_starter_id": None,
            "away_starter_id": None,
        }

        if not game["home_team"] or not game["away_team"]:
            continue

        if with_details:
            box = _fetch_boxscore(game_id)
            if box:
                # Hits and errors from teamStats
                home_stats = box.get("home", {}).get("teamStats", {}).get("batting", {})
                away_stats = box.get("away", {}).get("teamStats", {}).get("batting", {})
                game["home_hits"] = _safe_int(home_stats.get("hits"))
                game["away_hits"] = _safe_int(away_stats.get("hits"))

                home_field = box.get("home", {}).get("teamStats", {}).get("fielding", {})
                away_field = box.get("away", {}).get("teamStats", {}).get("fielding", {})
                game["home_errors"] = _safe_int(home_field.get("errors"))
                game["away_errors"] = _safe_int(away_field.get("errors"))

                # Innings played
                innings_played = _safe_int(box.get("gameBoxInfo", [{}])[-1].get("value") if box.get("gameBoxInfo") else None)
                if innings_played:
                    game["innings"] = innings_played

                # Starting pitchers — first pitcher in the pitchers list
                home_pitchers = box.get("home", {}).get("pitchers", [])
                away_pitchers = box.get("away", {}).get("pitchers", [])

                if home_pitchers:
                    starter_id = home_pitchers[0]
                    pitcher_info = box.get("home", {}).get("players", {}).get(f"ID{starter_id}", {})
                    game["home_starter_id"] = _safe_int(starter_id)
                    game["home_starter_name"] = _safe_str(
                        pitcher_info.get("person", {}).get("fullName")
                    )

                if away_pitchers:
                    starter_id = away_pitchers[0]
                    pitcher_info = box.get("away", {}).get("players", {}).get(f"ID{starter_id}", {})
                    game["away_starter_id"] = _safe_int(starter_id)
                    game["away_starter_name"] = _safe_str(
                        pitcher_info.get("person", {}).get("fullName")
                    )

        games.append(game)

    logger.info("  %d valid games for %s", len(games), season)
    return games


def save_games(db, games: list[dict]) -> tuple[int, int]:
    """Save games to DB. Returns (inserted, skipped)."""
    inserted = 0
    skipped = 0
    for g in games:
        if g.get("game_id") and db.query(MLBGame).filter(MLBGame.game_id == g["game_id"]).first():
            skipped += 1
            continue
        obj = MLBGame(**{k: v for k, v in g.items() if hasattr(MLBGame, k)})
        db.add(obj)
        inserted += 1

    db.commit()
    return inserted, skipped


def collect_all(with_details: bool = False) -> None:
    """Collect all seasons and save to DB."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    db = SessionLocal()
    total_inserted = 0
    total_skipped = 0

    try:
        for season in SEASONS:
            games = collect_season(season, with_details=with_details)
            if games:
                ins, skip = save_games(db, games)
                total_inserted += ins
                total_skipped += skip
                logger.info("  Saved: %d inserted, %d skipped", ins, skip)

        total = db.query(MLBGame).count()
        logger.info(
            "Done. Total inserted: %d, skipped: %d. DB total: %d",
            total_inserted,
            total_skipped,
            total,
        )
    finally:
        db.close()


if __name__ == "__main__":
    collect_all()
