"""
Import NBA historical betting odds from Kaggle dataset:
  "NBA Betting Data | October 2007 to June 2025" — cviaxmiwnptr

Dataset: cviaxmiwnptr/nba-betting-data-october-2007-to-june-2024
File: nba_2008-2025.csv (23 118 games, American moneylines, totals)

Usage (auto-download via kagglehub):
    uv run python scripts/import_nba_odds.py

Usage (manual CSV):
    uv run python scripts/import_nba_odds.py --csv path/to/nba_2008-2025.csv

Requires KAGGLE_API_TOKEN env var for auto-download.

What it does:
    1. Reads nba_2008-2025.csv (date, away/home abbrev, moneyline_away/home, total)
    2. Converts American odds → decimal
    3. Matches to nba_games rows by date + home_team name
    4. Updates odds_home, odds_away, total_line
"""

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.database import SessionLocal
from src.models.nba_game import NBAGame

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

KAGGLE_SLUG = "cviaxmiwnptr/nba-betting-data-october-2007-to-june-2024"

# Kaggle CSV abbreviation → DB full name
TEAM_MAP: dict[str, str] = {
    "atl": "Atlanta Hawks",
    "bkn": "Brooklyn Nets",
    "bos": "Boston Celtics",
    "cha": "Charlotte Hornets",
    "chi": "Chicago Bulls",
    "cle": "Cleveland Cavaliers",
    "dal": "Dallas Mavericks",
    "den": "Denver Nuggets",
    "det": "Detroit Pistons",
    "gs":  "Golden State Warriors",
    "hou": "Houston Rockets",
    "ind": "Indiana Pacers",
    "lac": "LA Clippers",
    "lal": "Los Angeles Lakers",
    "mem": "Memphis Grizzlies",
    "mia": "Miami Heat",
    "mil": "Milwaukee Bucks",
    "min": "Minnesota Timberwolves",
    "no":  "New Orleans Pelicans",
    "ny":  "New York Knicks",
    "okc": "Oklahoma City Thunder",
    "orl": "Orlando Magic",
    "phi": "Philadelphia 76ers",
    "phx": "Phoenix Suns",
    "por": "Portland Trail Blazers",
    "sa":  "San Antonio Spurs",
    "sac": "Sacramento Kings",
    "tor": "Toronto Raptors",
    "utah": "Utah Jazz",
    "wsh": "Washington Wizards",
    # Historical renames
    "nj":  "Brooklyn Nets",       # New Jersey Nets → Brooklyn 2012
    "sea": "Oklahoma City Thunder", # Seattle SuperSonics → OKC 2008
    "van": "Memphis Grizzlies",   # Vancouver Grizzlies
    "noh": "New Orleans Pelicans",
    "nok": "New Orleans Pelicans",
}


def american_to_decimal(american: float) -> float | None:
    try:
        american = float(american)
    except (TypeError, ValueError):
        return None
    if american == 0 or american != american:  # nan check
        return None
    if american > 0:
        return round(american / 100.0 + 1.0, 4)
    else:
        return round(100.0 / abs(american) + 1.0, 4)


def _kaggle_download() -> Path:
    try:
        import kagglehub
    except ImportError:
        log.error("kagglehub not installed. Run: uv add kagglehub")
        sys.exit(1)
    log.info("Downloading %s ...", KAGGLE_SLUG)
    path = kagglehub.dataset_download(KAGGLE_SLUG)
    log.info("Downloaded to: %s", path)
    return Path(path)


def _find_csv(data_dir: Path) -> Path:
    for f in data_dir.iterdir():
        if f.suffix == ".csv":
            return f
    raise FileNotFoundError(f"No CSV file found in {data_dir}")


def run_import(csv_path: Path, dry_run: bool = False) -> None:
    df = pd.read_csv(csv_path, low_memory=False)
    log.info("Loaded %d rows from %s", len(df), csv_path.name)
    log.info("Columns: %s", list(df.columns))

    # Filter to rows with odds
    has_odds = df["moneyline_home"].notna() | df["moneyline_away"].notna()
    df = df[has_odds].copy()
    log.info("Rows with at least one moneyline: %d", len(df))

    # Convert odds
    df["odds_home_dec"] = df["moneyline_home"].apply(american_to_decimal)
    df["odds_away_dec"] = df["moneyline_away"].apply(american_to_decimal)

    # Normalize team names
    df["home_full"] = df["home"].str.lower().str.strip().map(TEAM_MAP)
    df["away_full"] = df["away"].str.lower().str.strip().map(TEAM_MAP)

    unknown = set(df["home"].str.lower().unique()) - set(TEAM_MAP.keys())
    if unknown:
        log.warning("Unknown team abbreviations (skipped): %s", unknown)

    # Build lookup: (date_str, home_full) → (odds_home, odds_away, total)
    lookup: dict[tuple, dict] = {}
    for row in df.itertuples(index=False):
        date_str = str(row.date).strip()[:10]
        home = row.home_full
        if not home or home != home:  # NaN
            continue
        key = (date_str, home)
        lookup[key] = {
            "odds_home": row.odds_home_dec if pd.notna(row.odds_home_dec) else None,
            "odds_away": row.odds_away_dec if pd.notna(row.odds_away_dec) else None,
            "total_line": float(row.total) if pd.notna(row.total) else None,
        }

    log.info("Built lookup: %d entries (date + home team)", len(lookup))

    db = SessionLocal()
    try:
        db_rows = db.query(NBAGame).filter(NBAGame.home_score.isnot(None)).all()
        log.info("DB has %d completed nba_games rows", len(db_rows))

        updated = 0
        no_match = 0
        already_has_odds = 0

        for row in db_rows:
            date_str = str(row.game_date)[:10]
            key = (date_str, row.home_team)
            entry = lookup.get(key)

            if not entry:
                no_match += 1
                continue

            # Skip if already has real odds (don't overwrite)
            if row.odds_home is not None and row.odds_away is not None:
                already_has_odds += 1

            if entry["odds_home"] is not None:
                row.odds_home = entry["odds_home"]
            if entry["odds_away"] is not None:
                row.odds_away = entry["odds_away"]
            if entry["total_line"] is not None:
                row.total_line = entry["total_line"]

            updated += 1

        log.info(
            "Updated: %d | No match: %d | Already had odds: %d",
            updated, no_match, already_has_odds,
        )

        if dry_run:
            log.info("Dry run — rolling back")
            db.rollback()
        else:
            db.commit()
            log.info("Committed to DB.")

    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import NBA odds from Kaggle into nba_games table")
    parser.add_argument("--csv", default=None, help="Path to nba_2008-2025.csv. If omitted, downloads via kagglehub.")
    parser.add_argument("--dry-run", action="store_true", help="Match without writing to DB")
    args = parser.parse_args()

    if args.csv:
        csv_path = Path(args.csv)
        if not csv_path.exists():
            log.error("File not found: %s", csv_path)
            sys.exit(1)
    else:
        data_dir = _kaggle_download()
        csv_path = _find_csv(data_dir)

    run_import(csv_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
