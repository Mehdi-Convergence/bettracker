from pathlib import Path

import pandas as pd
from rich.console import Console
from sqlalchemy.orm import Session

from src.data.cleaner import DataCleaner
from src.data.constants import (
    FOOTBALL_DATA_BASE_URL,
    FOOTBALL_LEAGUES,
    FOOTBALL_SEASONS,
    SEASON_DISPLAY,
)
from src.data.downloader import DataDownloader
from src.database import SessionLocal
from src.models.match import FootballMatch

console = Console()

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "raw" / "football"


class FootballCollector:
    """Collect and ingest football data from football-data.co.uk."""

    def __init__(self):
        self.downloader = DataDownloader()
        self.cleaner = DataCleaner()

    def collect_csvs(
        self,
        seasons: list[str] | None = None,
        leagues: list[str] | None = None,
    ) -> list[Path]:
        """Download CSV files for specified seasons and leagues."""
        seasons = seasons or FOOTBALL_SEASONS
        leagues = leagues or list(FOOTBALL_LEAGUES.keys())
        downloaded = []

        total = len(seasons) * len(leagues)
        console.print(f"[bold]Downloading {total} CSV files...[/bold]")

        for season in seasons:
            for league in leagues:
                url = f"{FOOTBALL_DATA_BASE_URL}/{season}/{league}.csv"
                path = DATA_DIR / f"{season}_{league}.csv"

                if path.exists():
                    console.print(f"  [dim]Skip (cached): {season} {FOOTBALL_LEAGUES[league]}[/dim]")
                    downloaded.append(path)
                    continue

                try:
                    self.downloader.download_csv(url, path)
                    console.print(f"  [green]OK[/green]: {SEASON_DISPLAY.get(season, season)} {FOOTBALL_LEAGUES[league]}")
                    downloaded.append(path)
                except Exception as e:
                    console.print(f"  [red]FAIL[/red]: {season} {league} - {e}")

        return downloaded

    def ingest_csv(self, csv_path: Path, season: str, db: Session) -> int:
        """Parse a CSV file, clean data, and insert into database."""
        try:
            df = pd.read_csv(csv_path, encoding="utf-8", encoding_errors="replace")
        except Exception as e:
            console.print(f"  [red]Error reading {csv_path}: {e}[/red]")
            return 0

        df = self.cleaner.clean_football(df, season)

        if df.empty:
            console.print(f"  [yellow]No valid data in {csv_path.name}[/yellow]")
            return 0

        count = 0
        for _, row in df.iterrows():
            # Check for existing match (avoid duplicates)
            existing = (
                db.query(FootballMatch)
                .filter(
                    FootballMatch.date == row["date"],
                    FootballMatch.home_team == row["home_team"],
                    FootballMatch.away_team == row["away_team"],
                )
                .first()
            )
            if existing:
                continue

            match = FootballMatch(
                season=row.get("season"),
                league=row.get("league"),
                date=row.get("date"),
                home_team=row.get("home_team"),
                away_team=row.get("away_team"),
                fthg=int(row.get("fthg", 0)),
                ftag=int(row.get("ftag", 0)),
                ftr=row.get("ftr"),
                hthg=self._to_int(row.get("hthg")),
                htag=self._to_int(row.get("htag")),
                home_shots=self._to_int(row.get("home_shots")),
                away_shots=self._to_int(row.get("away_shots")),
                home_shots_target=self._to_int(row.get("home_shots_target")),
                away_shots_target=self._to_int(row.get("away_shots_target")),
                home_corners=self._to_int(row.get("home_corners")),
                away_corners=self._to_int(row.get("away_corners")),
                home_fouls=self._to_int(row.get("home_fouls")),
                away_fouls=self._to_int(row.get("away_fouls")),
                home_yellow=self._to_int(row.get("home_yellow")),
                away_yellow=self._to_int(row.get("away_yellow")),
                home_red=self._to_int(row.get("home_red")),
                away_red=self._to_int(row.get("away_red")),
                odds_home=self._to_float(row.get("odds_home")),
                odds_draw=self._to_float(row.get("odds_draw")),
                odds_away=self._to_float(row.get("odds_away")),
                odds_home_close=self._to_float(row.get("odds_home_close")),
                odds_draw_close=self._to_float(row.get("odds_draw_close")),
                odds_away_close=self._to_float(row.get("odds_away_close")),
                max_odds_home=self._to_float(row.get("max_odds_home")),
                max_odds_draw=self._to_float(row.get("max_odds_draw")),
                max_odds_away=self._to_float(row.get("max_odds_away")),
                avg_odds_home=self._to_float(row.get("avg_odds_home")),
                avg_odds_draw=self._to_float(row.get("avg_odds_draw")),
                avg_odds_away=self._to_float(row.get("avg_odds_away")),
            )
            db.add(match)
            count += 1

        db.commit()
        return count

    def collect_and_ingest(
        self,
        seasons: list[str] | None = None,
        leagues: list[str] | None = None,
    ) -> dict:
        """Full pipeline: download CSVs + clean + store in DB."""
        seasons = seasons or FOOTBALL_SEASONS
        leagues = leagues or list(FOOTBALL_LEAGUES.keys())

        csv_paths = self.collect_csvs(seasons, leagues)

        db = SessionLocal()
        total_inserted = 0

        console.print(f"\n[bold]Ingesting {len(csv_paths)} files into database...[/bold]")

        for path in csv_paths:
            # Extract season from filename (e.g., "2324_E0.csv")
            season = path.stem.split("_")[0]
            league_code = path.stem.split("_")[1]
            league_name = FOOTBALL_LEAGUES.get(league_code, league_code)

            count = self.ingest_csv(path, season, db)
            total_inserted += count
            console.print(f"  {SEASON_DISPLAY.get(season, season)} {league_name}: [green]{count}[/green] matches")

        db.close()

        # Summary
        summary = self._get_summary()
        console.print(f"\n[bold green]Total inserted: {total_inserted} matches[/bold green]")
        console.print(f"[bold]Total in DB: {summary['total']} matches[/bold]")

        return summary

    def _get_summary(self) -> dict:
        """Get summary of data in database."""
        db = SessionLocal()
        total = db.query(FootballMatch).count()
        leagues = (
            db.query(FootballMatch.league, FootballMatch.season)
            .distinct()
            .all()
        )
        db.close()
        return {
            "total": total,
            "leagues_seasons": [(l, s) for l, s in leagues],
        }

    @staticmethod
    def _to_int(val) -> int | None:
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _to_float(val) -> float | None:
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None
        try:
            f = float(val)
            return f if f > 1.0 else None  # Odds must be > 1.0
        except (ValueError, TypeError):
            return None
