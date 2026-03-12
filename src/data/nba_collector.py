"""NBA historical data collector using nba_api (free, no key required).

Collects Regular Season + Playoffs game logs for seasons 2018-19 to 2024-25.
Stores results in nba_games table.

Usage:
    uv run python -m src.data.nba_collector
"""

import logging
import time
from datetime import date

from nba_api.stats.endpoints import leaguegamefinder
from nba_api.stats.static import teams as nba_teams_static

from src.database import SessionLocal
from src.models.nba_game import NBAGame

logger = logging.getLogger(__name__)

# Seasons to collect (NBA season format: "2018-19" means Oct 2018 - Jun 2019)
SEASONS = [
    "2018-19",
    "2019-20",
    "2020-21",
    "2021-22",
    "2022-23",
    "2023-24",
    "2024-25",
]

# Rate limiting — nba_api requires throttling to avoid 429
_REQUEST_DELAY = 0.7  # seconds between API calls

# Map NBA API team abbreviation / full name to a consistent name
_NBA_TEAMS: dict[int, str] = {}


def _get_team_name(team_id: int) -> str:
    global _NBA_TEAMS
    if not _NBA_TEAMS:
        for t in nba_teams_static.get_teams():
            _NBA_TEAMS[t["id"]] = t["full_name"]
    return _NBA_TEAMS.get(team_id, str(team_id))


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return v if v == v else None  # NaN check
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(float(val)) if val is not None and str(val).strip() != "" else None
    except (TypeError, ValueError):
        return None


def collect_season(season: str, season_type: str = "Regular Season") -> list[dict]:
    """Fetch all games for a season via LeagueGameFinder."""
    logger.info("Fetching %s %s...", season, season_type)
    time.sleep(_REQUEST_DELAY)
    try:
        finder = leaguegamefinder.LeagueGameFinder(
            season_nullable=season,
            season_type_nullable=season_type,
            league_id_nullable="00",  # NBA
        )
        df = finder.get_data_frames()[0]
    except Exception as e:
        logger.warning("LeagueGameFinder failed for %s %s: %s", season, season_type, e)
        return []

    if df.empty:
        logger.info("  No games found for %s %s", season, season_type)
        return []

    # LeagueGameFinder returns one row per team per game — deduplicate to one row per game
    games: dict[str, dict] = {}
    for _, row in df.iterrows():
        gid = str(row["GAME_ID"])
        team_id = int(row["TEAM_ID"])
        team_name = str(row["TEAM_NAME"])
        pts = _safe_int(row.get("PTS"))
        fg_pct = _safe_float(row.get("FG_PCT"))
        fg3_pct = _safe_float(row.get("FG3_PCT"))
        ft_pct = _safe_float(row.get("FT_PCT"))
        reb = _safe_int(row.get("REB"))
        ast = _safe_int(row.get("AST"))
        tov = _safe_int(row.get("TOV"))
        stl = _safe_int(row.get("STL"))
        blk = _safe_int(row.get("BLK"))

        # MATCHUP: "LAL vs. BOS" (home) or "LAL @ BOS" (away)
        matchup = str(row.get("MATCHUP", ""))
        is_home = " vs. " in matchup

        game_date_str = str(row.get("GAME_DATE", ""))
        try:
            gdate = date.fromisoformat(game_date_str)
        except ValueError:
            # Try MM/DD/YYYY
            try:
                from datetime import datetime
                gdate = datetime.strptime(game_date_str, "%b %d, %Y").date()
            except ValueError:
                gdate = None

        if gid not in games:
            games[gid] = {
                "game_id": gid,
                "season": season,
                "season_type": season_type,
                "game_date": gdate,
                "home_team": None, "home_team_id": None,
                "away_team": None, "away_team_id": None,
                "home_score": None, "away_score": None,
                "home_fg_pct": None, "home_fg3_pct": None, "home_ft_pct": None,
                "home_reb": None, "home_ast": None, "home_tov": None,
                "home_stl": None, "home_blk": None, "home_pts": None,
                "away_fg_pct": None, "away_fg3_pct": None, "away_ft_pct": None,
                "away_reb": None, "away_ast": None, "away_tov": None,
                "away_stl": None, "away_blk": None, "away_pts": None,
            }

        g = games[gid]
        if g["game_date"] is None:
            g["game_date"] = gdate

        if is_home:
            g["home_team"] = team_name
            g["home_team_id"] = team_id
            g["home_score"] = pts
            g["home_pts"] = pts
            g["home_fg_pct"] = fg_pct
            g["home_fg3_pct"] = fg3_pct
            g["home_ft_pct"] = ft_pct
            g["home_reb"] = reb
            g["home_ast"] = ast
            g["home_tov"] = tov
            g["home_stl"] = stl
            g["home_blk"] = blk
        else:
            g["away_team"] = team_name
            g["away_team_id"] = team_id
            g["away_score"] = pts
            g["away_pts"] = pts
            g["away_fg_pct"] = fg_pct
            g["away_fg3_pct"] = fg3_pct
            g["away_ft_pct"] = ft_pct
            g["away_reb"] = reb
            g["away_ast"] = ast
            g["away_tov"] = tov
            g["away_stl"] = stl
            g["away_blk"] = blk

    # Filter: keep only games where both teams are identified and date is valid
    complete = [g for g in games.values() if g["home_team"] and g["away_team"] and g["game_date"]]
    logger.info("  %d games collected for %s %s", len(complete), season, season_type)
    return complete


def save_games(db, games: list[dict]) -> tuple[int, int]:
    """Save games to DB. Returns (inserted, skipped)."""
    inserted = 0
    skipped = 0
    for g in games:
        # Check existing
        if g["game_id"] and db.query(NBAGame).filter(NBAGame.game_id == g["game_id"]).first():
            skipped += 1
            continue
        obj = NBAGame(**{k: v for k, v in g.items() if hasattr(NBAGame, k)})
        db.add(obj)
        inserted += 1

    db.commit()
    return inserted, skipped


def collect_all() -> None:
    """Collect all seasons and save to DB."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    db = SessionLocal()
    total_inserted = 0
    total_skipped = 0

    try:
        for season in SEASONS:
            for season_type in ["Regular Season", "Playoffs"]:
                games = collect_season(season, season_type)
                if games:
                    ins, skip = save_games(db, games)
                    total_inserted += ins
                    total_skipped += skip
                    logger.info("  Saved: %d inserted, %d skipped", ins, skip)

        total = db.query(NBAGame).count()
        logger.info("Done. Total inserted: %d, skipped: %d. DB total: %d", total_inserted, total_skipped, total)
    finally:
        db.close()


if __name__ == "__main__":
    collect_all()
