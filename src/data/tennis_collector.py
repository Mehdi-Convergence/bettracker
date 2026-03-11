"""Tennis data collector from tennis-data.co.uk (ATP CSV files)."""

from pathlib import Path

import pandas as pd
from rich.console import Console
from sqlalchemy.orm import Session

from src.data.downloader import DataDownloader
from src.database import SessionLocal
from src.models.tennis_match import TennisMatch

console = Console()

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "raw" / "tennis"

# Years available on tennis-data.co.uk
TENNIS_YEARS = list(range(2019, 2026))  # 2019–2025

# URL pattern: http://www.tennis-data.co.uk/{year}/{year}.csv
TENNIS_BASE_URL = "http://www.tennis-data.co.uk"

# Column mapping: CSV -> model field
_COL_MAP = {
    "Location": "location",
    "Tournament": "tournament",
    "Series": "series",
    "Court": "court",
    "Surface": "surface",
    "Round": "round",
    "Best of": "best_of",
    "Winner": "winner",
    "Loser": "loser",
    "WRank": "winner_rank",
    "LRank": "loser_rank",
    "WPts": "winner_rank_pts",
    "LPts": "loser_rank_pts",
    "W1": "w1",
    "L1": "l1",
    "W2": "w2",
    "L2": "l2",
    "W3": "w3",
    "L3": "l3",
    "W4": "w4",
    "L4": "l4",
    "W5": "w5",
    "L5": "l5",
    "Wsets": "wsets",
    "Lsets": "lsets",
    "Comment": "comment",
    # Pinnacle odds (reference market)
    "PSW": "odds_winner",
    "PSL": "odds_loser",
    # Max / Avg
    "MaxW": "max_odds_winner",
    "MaxL": "max_odds_loser",
    "AvgW": "avg_odds_winner",
    "AvgL": "avg_odds_loser",
}


class TennisCollector:
    """Collect and ingest ATP tennis data from tennis-data.co.uk."""

    def __init__(self):
        self.downloader = DataDownloader()

    def collect_files(self, years: list[int] | None = None) -> list[Path]:
        """Download xlsx files for the given years."""
        years = years or TENNIS_YEARS
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        downloaded: list[Path] = []

        console.print(f"[bold]Downloading {len(years)} tennis files...[/bold]")

        for year in years:
            url = f"{TENNIS_BASE_URL}/{year}/{year}.xlsx"
            path = DATA_DIR / f"atp_{year}.xlsx"

            if path.exists():
                console.print(f"  [dim]Skip (cached): ATP {year}[/dim]")
                downloaded.append(path)
                continue

            try:
                self.downloader.download_csv(url, path)  # same download logic
                console.print(f"  [green]OK[/green]: ATP {year}")
                downloaded.append(path)
            except Exception as e:
                console.print(f"  [red]FAIL[/red]: ATP {year} - {e}")

        return downloaded

    def ingest_file(self, path: Path, year: int, db: Session) -> int:
        """Parse a tennis xlsx/csv and insert matches into the database."""
        try:
            if path.suffix == ".xlsx":
                df = pd.read_excel(path)
            else:
                df = pd.read_csv(path, encoding="utf-8", encoding_errors="replace")
        except Exception as e:
            console.print(f"  [red]Error reading {path}: {e}[/red]")
            return 0

        df = df.rename(columns=_COL_MAP)

        # Parse date — tennis-data uses DD/MM/YYYY
        if "Date" in df.columns:
            df["date"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
        elif "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"], dayfirst=True, errors="coerce")
        else:
            console.print(f"  [yellow]No date column in {path.name}[/yellow]")
            return 0

        # Drop rows without winner/loser/date
        df = df.dropna(subset=["winner", "loser", "date"])

        if df.empty:
            console.print(f"  [yellow]No valid data in {path.name}[/yellow]")
            return 0

        count = 0
        for _, row in df.iterrows():
            date_val = row["date"]
            if pd.isna(date_val):
                continue

            date_dt = date_val.to_pydatetime() if hasattr(date_val, "to_pydatetime") else date_val

            existing = (
                db.query(TennisMatch)
                .filter(
                    TennisMatch.date == date_dt,
                    TennisMatch.winner == str(row["winner"]),
                    TennisMatch.loser == str(row["loser"]),
                )
                .first()
            )
            if existing:
                continue

            match = TennisMatch(
                year=year,
                date=date_dt,
                tournament=self._to_str(row.get("tournament")),
                location=self._to_str(row.get("location")),
                series=self._to_str(row.get("series")),
                court=self._to_str(row.get("court")),
                surface=self._to_str(row.get("surface")),
                round=self._to_str(row.get("round")),
                best_of=self._to_int(row.get("best_of")),
                winner=str(row["winner"]),
                loser=str(row["loser"]),
                winner_rank=self._to_int(row.get("winner_rank")),
                loser_rank=self._to_int(row.get("loser_rank")),
                winner_rank_pts=self._to_int(row.get("winner_rank_pts")),
                loser_rank_pts=self._to_int(row.get("loser_rank_pts")),
                w1=self._to_int(row.get("w1")),
                l1=self._to_int(row.get("l1")),
                w2=self._to_int(row.get("w2")),
                l2=self._to_int(row.get("l2")),
                w3=self._to_int(row.get("w3")),
                l3=self._to_int(row.get("l3")),
                w4=self._to_int(row.get("w4")),
                l4=self._to_int(row.get("l4")),
                w5=self._to_int(row.get("w5")),
                l5=self._to_int(row.get("l5")),
                wsets=self._to_int(row.get("wsets")),
                lsets=self._to_int(row.get("lsets")),
                comment=self._to_str(row.get("comment")),
                odds_winner=self._to_float(row.get("odds_winner")),
                odds_loser=self._to_float(row.get("odds_loser")),
                max_odds_winner=self._to_float(row.get("max_odds_winner")),
                max_odds_loser=self._to_float(row.get("max_odds_loser")),
                avg_odds_winner=self._to_float(row.get("avg_odds_winner")),
                avg_odds_loser=self._to_float(row.get("avg_odds_loser")),
            )
            db.add(match)
            count += 1

        db.commit()
        return count

    def collect_and_ingest(self, years: list[int] | None = None) -> dict:
        """Full pipeline: download files + clean + store in DB."""
        years = years or TENNIS_YEARS
        paths = self.collect_files(years)

        db = SessionLocal()
        total_inserted = 0

        console.print(f"\n[bold]Ingesting {len(paths)} tennis files into database...[/bold]")

        for path in paths:
            year = int(path.stem.split("_")[1])
            count = self.ingest_file(path, year, db)
            total_inserted += count
            console.print(f"  ATP {year}: [green]{count}[/green] matches")

        db.close()

        total_in_db = self._count_in_db()
        console.print(f"\n[bold green]Total inserted: {total_inserted} matches[/bold green]")
        console.print(f"[bold]Total in DB: {total_in_db} matches[/bold]")

        return {"total_inserted": total_inserted, "total_in_db": total_in_db}

    def _count_in_db(self) -> int:
        db = SessionLocal()
        count = db.query(TennisMatch).count()
        db.close()
        return count

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
            return f if f > 1.0 else None
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _to_str(val) -> str | None:
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None
        s = str(val).strip()
        return s if s else None
