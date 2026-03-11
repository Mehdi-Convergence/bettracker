"""Ensemble (XGBoost + LightGBM) binary tennis prediction model.

Predicts P(p1 wins) — binary classification, no draw.
Target: 1 = p1 won, 0 = p2 won (roles are randomly assigned during feature building).
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from rich.console import Console
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score
from xgboost import XGBClassifier

from src.features.tennis_features import TENNIS_FEATURE_COLUMNS

console = Console()

# Ensemble weight: XGBoost vs LightGBM
XGB_WEIGHT = 0.70
LGB_WEIGHT = 0.30

# Model save directory
MODEL_DIR = Path("models/tennis")


class TennisModel:
    """Ensemble XGBoost + LightGBM binary classifier (p1 wins vs p2 wins)."""

    def __init__(self):
        self.base_model = XGBClassifier(
            objective="binary:logistic",
            n_estimators=300,
            max_depth=3,
            learning_rate=0.02,
            subsample=0.6,
            colsample_bytree=0.7,
            min_child_weight=20,
            reg_alpha=1.0,
            reg_lambda=1.0,
            gamma=1.0,
            eval_metric="logloss",
            verbosity=0,
        )
        self.lgb_model = LGBMClassifier(
            objective="binary",
            n_estimators=400,
            max_depth=3,
            learning_rate=0.015,
            subsample=0.6,
            colsample_bytree=0.6,
            min_child_samples=15,
            reg_alpha=0.5,
            reg_lambda=1.0,
            num_leaves=31,
            verbose=-1,
        )
        self.calibrator: IsotonicRegression | None = None
        self.feature_columns: list[str] = TENNIS_FEATURE_COLUMNS

    def train(self, X_train, y_train):
        """Train both models without calibration."""
        self.calibrator = None
        self.base_model.fit(X_train, y_train)
        self.lgb_model.fit(X_train, y_train)

    def train_with_calibration(self, X_train, y_train, X_cal, y_cal):
        """Train both models then calibrate on held-out set."""
        self.base_model.fit(X_train, y_train)
        self.lgb_model.fit(X_train, y_train)

        raw = self._ensemble_proba(X_cal)
        self.calibrator = IsotonicRegression(out_of_bounds="clip")
        self.calibrator.fit(raw, y_cal)

    def _ensemble_proba(self, X) -> np.ndarray:
        """Soft-voting: P(p1 wins) as 1D array."""
        xgb_p = self.base_model.predict_proba(X)[:, 1]
        lgb_p = self.lgb_model.predict_proba(X)[:, 1]
        return XGB_WEIGHT * xgb_p + LGB_WEIGHT * lgb_p

    def predict_proba(self, X) -> np.ndarray:
        """Return P(p1 wins) as 1D array."""
        raw = self._ensemble_proba(X)
        if self.calibrator is not None:
            return self.calibrator.predict(raw)
        return raw

    def walk_forward_train(self, df: pd.DataFrame) -> dict:
        """Walk-forward training: train on years [Y-5..Y-2], test on [Y-1, Y].

        Tennis uses years instead of seasons.
        Train: 2019–2023 (5 years), Test: 2024–2025 (2 years).
        """
        fold_results = []

        test_years = sorted(df["year"].unique())[-2:]   # last 2 years
        train_years = sorted(df["year"].unique())[:-2]  # all before

        if not train_years or not test_years:
            console.print("[red]Not enough years for walk-forward split[/red]")
            return {"folds": [], "average": {}}

        # Single split (5 train / 2 test — same as football)
        train_mask = df["year"].isin(train_years)
        test_mask = df["year"].isin(test_years)

        X_train = df.loc[train_mask, self.feature_columns].values
        y_train = df.loc[train_mask, "target"].values
        X_test = df.loc[test_mask, self.feature_columns].values
        y_test = df.loc[test_mask, "target"].values

        # Fill NaN with column median (train set)
        col_medians = np.nanmedian(X_train, axis=0)
        for col_idx in range(X_train.shape[1]):
            X_train[:, col_idx] = np.where(
                np.isnan(X_train[:, col_idx]),
                col_medians[col_idx],
                X_train[:, col_idx],
            )
            X_test[:, col_idx] = np.where(
                np.isnan(X_test[:, col_idx]),
                col_medians[col_idx],
                X_test[:, col_idx],
            )

        console.print(f"\n[bold]Tennis Walk-Forward[/bold]")
        console.print(f"  Train years: {train_years} ->{len(X_train)} matches")
        console.print(f"  Test years: {test_years} ->{len(X_test)} matches")

        self.train(X_train, y_train)

        proba = self.predict_proba(X_test)
        train_proba = self.predict_proba(X_train)

        fold_metric = self._evaluate(y_test, proba, y_train, train_proba, test_years)
        fold_results.append(fold_metric)

        console.print(f"  [green]Accuracy: {fold_metric['accuracy']:.1%}[/green]")
        console.print(f"  Log loss: {fold_metric['log_loss']:.4f}")
        console.print(f"  ROC AUC: {fold_metric['roc_auc']:.4f}")
        console.print(f"  Brier score: {fold_metric['brier']:.4f}")

        return {"folds": fold_results, "average": fold_metric}

    def _evaluate(self, y_test, proba_test, y_train, proba_train, test_years) -> dict:
        pred = (proba_test >= 0.5).astype(int)
        train_pred = (proba_train >= 0.5).astype(int)

        # Binary log loss needs shape (n, 2)
        proba_2d = np.column_stack([1 - proba_test, proba_test])

        return {
            "test_years": list(test_years),
            "n_train": len(y_train),
            "n_test": len(y_test),
            "accuracy": float(accuracy_score(y_test, pred)),
            "log_loss": float(log_loss(y_test, proba_2d)),
            "roc_auc": float(roc_auc_score(y_test, proba_test)),
            "brier": float(brier_score_loss(y_test, proba_test)),
            "train_accuracy": float(accuracy_score(y_train, train_pred)),
        }

    def save(self, path: Path, metadata: dict):
        """Save model and metadata."""
        path.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "base_model": self.base_model,
            "lgb_model": self.lgb_model,
            "calibrator": self.calibrator,
            "feature_columns": self.feature_columns,
        }, path / "model.joblib")
        with open(path / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2, default=str)

    def load(self, path: Path):
        """Load saved model."""
        data = joblib.load(path / "model.joblib")
        self.base_model = data["base_model"]
        self.lgb_model = data["lgb_model"]
        self.calibrator = data.get("calibrator")
        self.feature_columns = data.get("feature_columns", TENNIS_FEATURE_COLUMNS)
