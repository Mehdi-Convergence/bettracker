"""XGBoost multiclass football prediction model with isotonic calibration."""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from rich.console import Console
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
from xgboost import XGBClassifier

from src.features.football_features import FEATURE_COLUMNS
from src.ml.walk_forward import WalkForwardSplitter

console = Console()

LABEL_MAP = {"H": 0, "D": 1, "A": 2}
REVERSE_MAP = {0: "H", 1: "D", 2: "A"}

# Drop xG features (not available). Keep implied odds (carry injury/news info).
MODEL_FEATURES = [f for f in FEATURE_COLUMNS if "xg" not in f]


class FootballModel:
    """XGBoost 3-class (H/D/A) with optional isotonic calibration."""

    def __init__(self):
        self.base_model = XGBClassifier(
            objective="multi:softprob",
            num_class=3,
            n_estimators=250,
            max_depth=3,
            learning_rate=0.018348,
            subsample=0.6448,
            colsample_bytree=0.8828,
            min_child_weight=30,
            reg_alpha=0.749750,
            reg_lambda=0.165750,
            gamma=1.818039,
            eval_metric="mlogloss",
            verbosity=0,
        )
        self.calibrators = None  # One IsotonicRegression per class

    def train(self, X_train, y_train):
        """Train base model without calibration (raw softprob)."""
        self.calibrators = None
        self.base_model.fit(X_train, y_train)

    def train_with_calibration(self, X_train, y_train, X_cal, y_cal):
        """Train base model then calibrate with isotonic regression on held-out set."""
        self.base_model.fit(X_train, y_train)

        # Manual calibration: fit isotonic regression per class on calibration set
        raw_proba = self.base_model.predict_proba(X_cal)
        self.calibrators = []
        for cls_idx in range(3):
            ir = IsotonicRegression(out_of_bounds="clip")
            ir.fit(raw_proba[:, cls_idx], (y_cal == cls_idx).astype(float))
            self.calibrators.append(ir)

    def predict_proba(self, X) -> np.ndarray:
        """Return calibrated probabilities [P(H), P(D), P(A)]."""
        raw = self.base_model.predict_proba(X)
        if self.calibrators is None:
            return raw

        calibrated = np.column_stack([
            self.calibrators[i].predict(raw[:, i]) for i in range(3)
        ])
        # Normalize so probabilities sum to 1
        row_sums = calibrated.sum(axis=1, keepdims=True)
        row_sums = np.maximum(row_sums, 1e-10)
        return calibrated / row_sums

    def predict_proba_uncalibrated(self, X) -> np.ndarray:
        """Return raw (uncalibrated) probabilities."""
        return self.base_model.predict_proba(X)

    def walk_forward_train(self, df: pd.DataFrame) -> dict:
        """Full walk-forward training with per-fold metrics."""
        splitter = WalkForwardSplitter(min_train_seasons=2)
        fold_results = []

        X = df[MODEL_FEATURES].values
        y = df["ftr"].map(LABEL_MAP).values

        for train_idx, test_idx, train_seasons, test_season in splitter.split(df):
            X_train_full = X[train_idx]
            y_train_full = y[train_idx]
            X_test = X[test_idx]
            y_test = y[test_idx]

            console.print(f"\n[bold]Fold: Train {train_seasons} -> Test {test_season}[/bold]")
            console.print(f"  Train: {len(X_train_full)}, Test: {len(X_test)}")

            # Train without calibration (raw XGBoost softprob are better)
            self.train(X_train_full, y_train_full)

            # Evaluate
            proba_cal = self.predict_proba(X_test)
            proba_uncal = proba_cal  # Same since no calibration

            # Also get train accuracy for overfitting check
            train_proba = self.predict_proba(X_train_full)
            train_acc = accuracy_score(y_train_full, train_proba.argmax(axis=1))

            fold_metric = self._evaluate(y_test, proba_cal, proba_uncal, train_acc, test_season)
            fold_results.append(fold_metric)

            console.print(f"  [green]Accuracy: {fold_metric['accuracy']:.1%}[/green]")
            console.print(f"  Log loss (calibrated): {fold_metric['log_loss_cal']:.4f}")
            console.print(f"  Log loss (uncalibrated): {fold_metric['log_loss_uncal']:.4f}")
            console.print(f"  Train accuracy: {fold_metric['train_accuracy']:.1%}")

        # Aggregate
        avg_metrics = self._aggregate_folds(fold_results)
        return {"folds": fold_results, "average": avg_metrics}

    def _evaluate(self, y_true, proba_cal, proba_uncal, train_acc, season) -> dict:
        """Calculate metrics for one fold."""
        pred = proba_cal.argmax(axis=1)

        return {
            "season": season,
            "n_test": len(y_true),
            "accuracy": accuracy_score(y_true, pred),
            "log_loss_cal": log_loss(y_true, proba_cal),
            "log_loss_uncal": log_loss(y_true, proba_uncal),
            "brier_home": brier_score_loss((y_true == 0).astype(int), proba_cal[:, 0]),
            "brier_draw": brier_score_loss((y_true == 1).astype(int), proba_cal[:, 1]),
            "brier_away": brier_score_loss((y_true == 2).astype(int), proba_cal[:, 2]),
            "train_accuracy": train_acc,
            "overfit_gap": train_acc - accuracy_score(y_true, pred),
        }

    def _aggregate_folds(self, folds: list[dict]) -> dict:
        """Average metrics across folds."""
        keys = ["accuracy", "log_loss_cal", "log_loss_uncal", "brier_home",
                "brier_draw", "brier_away", "train_accuracy", "overfit_gap"]
        avg = {}
        for k in keys:
            values = [f[k] for f in folds]
            avg[k] = float(np.mean(values))
            avg[f"{k}_std"] = float(np.std(values))
        avg["n_folds"] = len(folds)
        return avg

    def save(self, path: Path, metadata: dict):
        """Save model and metadata."""
        path.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "base_model": self.base_model,
            "calibrators": self.calibrators,
        }, path / "model.joblib")
        with open(path / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2, default=str)

    def load(self, path: Path):
        """Load saved model."""
        data = joblib.load(path / "model.joblib")
        self.base_model = data["base_model"]
        self.calibrators = data["calibrators"]
