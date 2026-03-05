from datetime import datetime

import numpy as np
import pandas as pd

from src.data.constants import FOOTBALL_COLUMN_MAP, FOOTBALL_ODDS_FALLBACK


class DataCleaner:
    """Clean and normalize football CSV data."""

    def clean_football(self, df: pd.DataFrame, season: str) -> pd.DataFrame:
        """Clean a football CSV dataframe for DB ingestion."""
        # 1. Rename columns using primary mapping (Pinnacle odds)
        rename_map = {}
        for csv_col, db_col in FOOTBALL_COLUMN_MAP.items():
            if csv_col in df.columns:
                rename_map[csv_col] = db_col

        df = df.rename(columns=rename_map)

        # 2. Fallback: if Pinnacle odds missing, use Bet365
        for csv_col, db_col in FOOTBALL_ODDS_FALLBACK.items():
            if db_col not in df.columns or df[db_col].isna().all():
                if csv_col in df.columns:
                    df[db_col] = df[csv_col]

        # 3. Add season column
        df["season"] = season

        # 4. Parse dates (handle dd/mm/yy and dd/mm/yyyy)
        df["date"] = df["date"].apply(self._parse_date)

        # 5. Drop rows missing essential fields
        essential = ["date", "home_team", "away_team", "fthg", "ftag", "ftr"]
        df = df.dropna(subset=[c for c in essential if c in df.columns])

        # 6. Validate FTR values
        df = df[df["ftr"].isin(["H", "D", "A"])]

        # 7. Ensure goals are non-negative integers
        for col in ["fthg", "ftag"]:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

        # 8. Validate odds (must be > 1.0)
        odds_cols = [
            "odds_home", "odds_draw", "odds_away",
            "odds_home_close", "odds_draw_close", "odds_away_close",
            "max_odds_home", "max_odds_draw", "max_odds_away",
            "avg_odds_home", "avg_odds_draw", "avg_odds_away",
        ]
        for col in odds_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                df.loc[df[col] <= 1.0, col] = np.nan

        # 9. Convert optional int columns
        int_cols = [
            "hthg", "htag", "home_shots", "away_shots",
            "home_shots_target", "away_shots_target",
            "home_corners", "away_corners",
            "home_fouls", "away_fouls",
            "home_yellow", "away_yellow",
            "home_red", "away_red",
        ]
        for col in int_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                df[col] = df[col].where(df[col].notna(), None)

        # 10. Keep only columns that map to DB fields
        db_cols = list(FOOTBALL_COLUMN_MAP.values()) + ["season"]
        existing_cols = [c for c in db_cols if c in df.columns]
        # Also keep xG columns if present
        for xg_col in ["home_xg", "away_xg"]:
            if xg_col in df.columns:
                existing_cols.append(xg_col)

        df = df[existing_cols]

        # 11. Drop duplicate matches (same date, same teams)
        df = df.drop_duplicates(subset=["date", "home_team", "away_team"], keep="first")

        return df.reset_index(drop=True)

    def remove_vig(
        self, odds_h: float, odds_d: float, odds_a: float
    ) -> tuple[float, float, float]:
        """Remove bookmaker overround to get fair probabilities."""
        raw_probs = [1 / odds_h, 1 / odds_d, 1 / odds_a]
        total = sum(raw_probs)
        return tuple(p / total for p in raw_probs)

    def _parse_date(self, date_str) -> datetime | None:
        """Parse date string, handling multiple formats."""
        if pd.isna(date_str):
            return None
        date_str = str(date_str).strip()
        for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        return None
