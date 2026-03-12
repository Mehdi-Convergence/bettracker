"""Enrich football_matches DB with real xG from FBref (via soccerdata).

This script:
1. Scrapes xG from FBref for Big 5 leagues (E0, SP1, D1, I1, F1)
2. Matches FBref records to DB rows by (league, date ±1day, home_team fuzzy, away_team fuzzy)
3. Updates home_xg / away_xg columns in football_matches table
4. Reports match rate and statistics

Run once to enrich, then re-run periodically to update current season:
    uv run python scripts/enrich_xg.py

Options:
    --force     Force re-scrape even if cache is fresh
    --dry-run   Show what would be updated without writing to DB
    --league E0 Only process one league
    --season 2324 Only process one season
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import timedelta
from pathlib import Path

# Ensure project root is in path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from sqlalchemy.orm import Session

from src.data.fbref_client import FBrefClient, FBREF_LEAGUES, SEASON_TO_YEAR
from src.database import SessionLocal
from src.models.match import FootballMatch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Team name normalization map: FBref name -> football-data.co.uk name
# These differ because FBref uses official names while football-data.co.uk uses short names.
# Only add mappings where fuzzy match fails.
TEAM_NAME_MAP: dict[str, str] = {
    # Premier League
    "manchester city": "man city",
    "manchester united": "man united",
    "tottenham hotspur": "tottenham",
    "newcastle united": "newcastle",
    "brighton & hove albion": "brighton",
    "brighton and hove albion": "brighton",
    "wolverhampton wanderers": "wolves",
    "west ham united": "west ham",
    "nottingham forest": "nott'm forest",
    "leeds united": "leeds",
    "sheffield united": "sheffield utd",
    "leicester city": "leicester",
    "norwich city": "norwich",
    "watford fc": "watford",
    "brentford fc": "brentford",
    # Bundesliga
    "fc bayern münchen": "bayern munich",
    "borussia dortmund": "dortmund",
    "rasenballsport leipzig": "rb leipzig",
    "bayer 04 leverkusen": "leverkusen",
    "1. fc union berlin": "union berlin",
    "1. fsv mainz 05": "mainz",
    "vfb stuttgart": "stuttgart",
    "sc freiburg": "freiburg",
    "tsg hoffenheim": "hoffenheim",
    "fc augsburg": "augsburg",
    "hamburger sv": "hamburg",
    "vfl wolfsburg": "wolfsburg",
    "eintracht frankfurt": "ein frankfurt",
    # La Liga
    "atletico madrid": "ath madrid",
    "athletic club": "ath bilbao",
    "athletic bilbao": "ath bilbao",
    "real betis": "betis",
    "real sociedad": "r sociedad",
    "deportivo alaves": "alaves",
    "rcd espanyol": "espanol",
    "rcd mallorca": "mallorca",
    "ud almeria": "almeria",
    "cadiz cf": "cadiz",
    "getafe cf": "getafe",
    "villarreal cf": "villarreal",
    # Serie A
    "inter milan": "inter",
    "ac milan": "milan",
    "as roma": "roma",
    "ssc napoli": "napoli",
    "ss lazio": "lazio",
    "acf fiorentina": "fiorentina",
    "atalanta bc": "atalanta",
    "hellas verona": "verona",
    "udinese calcio": "udinese",
    "us sassuolo": "sassuolo",
    "us lecce": "lecce",
    "us salernitana": "salernitana",
    # Ligue 1
    "paris s-g": "paris sg",
    "paris saint-germain": "paris sg",
    "psg": "paris sg",
    "olympique lyonnais": "lyon",
    "olympique de marseille": "marseille",
    "stade rennais": "rennes",
    "as monaco": "monaco",
    "stade brestois 29": "brest",
    "rc lens": "lens",
    "losc lille": "lille",
    "nice": "nice",
    "ogc nice": "nice",
    "fc nantes": "nantes",
    "rc strasbourg": "strasbourg",
    "montpellier hsc": "montpellier",
    "stade de reims": "reims",
    "fc lorient": "lorient",
    "toulouse fc": "toulouse",
    "angers sco": "angers",
    "fc metz": "metz",
    "le havre ac": "le havre",
    "havre ac": "le havre",
}


def normalize_team(name: str) -> str:
    """Normalize team name for fuzzy matching."""
    n = name.lower().strip()
    return TEAM_NAME_MAP.get(n, n)


def find_match(
    db_row: FootballMatch,
    lookup: pd.DataFrame,
    date_tolerance_days: int = 1,
) -> tuple[float, float] | None:
    """Find xG values for a DB match in the FBref lookup DataFrame.

    Matching strategy:
    1. Filter by league + season
    2. Filter by date (±date_tolerance_days)
    3. Match home/away team names after normalization

    Returns (home_xg, away_xg) or None if no match found.
    """
    if lookup.empty:
        return None

    # Filter by league + season
    mask = (lookup["league"] == db_row.league) & (lookup["season"] == db_row.season)
    subset = lookup[mask]
    if subset.empty:
        return None

    # Filter by date window
    match_date = pd.Timestamp(db_row.date)
    date_min = match_date - timedelta(days=date_tolerance_days)
    date_max = match_date + timedelta(days=date_tolerance_days)
    subset = subset[(subset["date"] >= date_min) & (subset["date"] <= date_max)]
    if subset.empty:
        return None

    # Normalize team names
    home_norm = normalize_team(db_row.home_team)
    away_norm = normalize_team(db_row.away_team)

    # Exact match on normalized names
    exact = subset[
        (subset["_home_norm"].apply(normalize_team) == home_norm) &
        (subset["_away_norm"].apply(normalize_team) == away_norm)
    ]
    if not exact.empty:
        row = exact.iloc[0]
        return float(row["home_xg"]), float(row["away_xg"])

    # Partial match: one team name contains the other (handles "Man City" vs "Manchester City")
    for _, fbref_row in subset.iterrows():
        fh = normalize_team(fbref_row["_home_norm"])
        fa = normalize_team(fbref_row["_away_norm"])
        home_match = (home_norm in fh) or (fh in home_norm)
        away_match = (away_norm in fa) or (fa in away_norm)
        if home_match and away_match:
            return float(fbref_row["home_xg"]), float(fbref_row["away_xg"])

    return None


def run_enrichment(
    leagues: list[str] | None = None,
    seasons: list[str] | None = None,
    force_scrape: bool = False,
    dry_run: bool = False,
) -> dict:
    """Main enrichment logic.

    Returns summary dict with match rates and counts.
    """
    leagues = leagues or list(FBREF_LEAGUES.keys())
    seasons = seasons or list(SEASON_TO_YEAR.keys())

    client = FBrefClient()

    # Scrape / load from cache
    logger.info("Loading FBref xG data...")
    lookup = client.build_lookup(leagues=leagues, seasons=seasons)

    if lookup.empty:
        logger.error(
            "No xG data available. Make sure soccerdata is installed and "
            "FBref is reachable. Install: uv add soccerdata"
        )
        return {"status": "error", "reason": "no_xg_data"}

    logger.info("xG lookup: %d records", len(lookup))

    # Load DB matches for targeted leagues/seasons
    db: Session = SessionLocal()
    try:
        query = db.query(FootballMatch).filter(
            FootballMatch.league.in_(leagues)
        )
        db_matches = query.all()
        logger.info("DB matches to process: %d", len(db_matches))

        matched = 0
        skipped_already_set = 0
        not_found = 0
        updated = 0

        for match in db_matches:
            # Skip if already enriched (unless force)
            if not force_scrape and match.home_xg is not None and match.away_xg is not None:
                skipped_already_set += 1
                continue

            result = find_match(match, lookup)
            if result is None:
                not_found += 1
                continue

            home_xg, away_xg = result

            # Sanity check: xG should be in plausible range
            if not (0.0 <= home_xg <= 8.0 and 0.0 <= away_xg <= 8.0):
                logger.warning(
                    "Implausible xG for %s vs %s: %.2f / %.2f — skipping",
                    match.home_team, match.away_team, home_xg, away_xg
                )
                not_found += 1
                continue

            matched += 1
            if not dry_run:
                match.home_xg = home_xg
                match.away_xg = away_xg
                updated += 1

        if not dry_run:
            db.commit()
            logger.info("Committed %d xG updates to DB", updated)
        else:
            logger.info("[DRY RUN] Would update %d matches", matched)

    finally:
        db.close()

    total_processed = matched + not_found
    match_rate = matched / total_processed if total_processed > 0 else 0.0

    summary = {
        "status": "ok",
        "total_db": len(db_matches),
        "skipped_already_set": skipped_already_set,
        "matched": matched,
        "not_found": not_found,
        "updated": updated if not dry_run else 0,
        "match_rate_pct": round(match_rate * 100, 1),
        "dry_run": dry_run,
    }

    logger.info(
        "Enrichment complete: %d matched / %d processed (%.1f%% match rate)",
        matched, total_processed, match_rate * 100
    )
    logger.info(
        "  Already set: %d | Not found: %d | Updated: %d",
        skipped_already_set, not_found, updated if not dry_run else 0
    )

    return summary


def main():
    parser = argparse.ArgumentParser(description="Enrich football DB with FBref xG data")
    parser.add_argument("--force", action="store_true", help="Force re-scrape cache")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no DB writes")
    parser.add_argument("--league", type=str, help="Single league code (e.g. E0)")
    parser.add_argument("--season", type=str, help="Single season code (e.g. 2324)")
    args = parser.parse_args()

    leagues = [args.league] if args.league else None
    seasons = [args.season] if args.season else None

    summary = run_enrichment(
        leagues=leagues,
        seasons=seasons,
        force_scrape=args.force,
        dry_run=args.dry_run,
    )

    print("\n--- Enrichment Summary ---")
    for k, v in summary.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
