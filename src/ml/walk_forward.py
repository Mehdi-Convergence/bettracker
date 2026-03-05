"""Walk-forward (expanding window) validation for time-ordered data.

This is NOT standard cross-validation. It simulates real-world usage:
train on past, predict future. Never leaks future data into training.
"""

import pandas as pd


class WalkForwardSplitter:
    """Split data by season for walk-forward validation.

    Example with 5 seasons (min_train=2):
      Fold 1: Train S1+S2       -> Test S3
      Fold 2: Train S1+S2+S3    -> Test S4
      Fold 3: Train S1+S2+S3+S4 -> Test S5
    """

    def __init__(self, min_train_seasons: int = 2):
        self.min_train = min_train_seasons

    def split(self, df: pd.DataFrame):
        """Generate (train_idx, test_idx) tuples ordered by time."""
        seasons = sorted(df["season"].unique())

        for i in range(self.min_train, len(seasons)):
            train_seasons = seasons[:i]
            test_season = seasons[i]

            train_mask = df["season"].isin(train_seasons)
            test_mask = df["season"] == test_season

            train_idx = df[train_mask].index.tolist()
            test_idx = df[test_mask].index.tolist()

            if len(train_idx) > 0 and len(test_idx) > 0:
                yield train_idx, test_idx, train_seasons, test_season

    def n_splits(self, df: pd.DataFrame) -> int:
        seasons = sorted(df["season"].unique())
        return max(0, len(seasons) - self.min_train)
