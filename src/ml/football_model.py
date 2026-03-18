"""Ensemble (XGBoost + LightGBM) multiclass football prediction model."""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from rich.console import Console
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
from xgboost import XGBClassifier

from src.features.football_features import FEATURE_COLUMNS
from src.ml.walk_forward import WalkForwardSplitter

console = Console()

LABEL_MAP = {"H": 0, "D": 1, "A": 2}
REVERSE_MAP = {0: "H", 1: "D", 2: "A"}

# xG features — included when real FBref data is available (after enrich_xg.py).
# Falls back to excluding them if still NaN-only (pre-enrichment).
# The model training pipeline detects availability at runtime.
MODEL_FEATURES = list(FEATURE_COLUMNS)

# xG features that require FBref enrichment
XG_FEATURES = [f for f in FEATURE_COLUMNS if "xg" in f]

# Legacy mode: features without xG (used when xG data unavailable)
MODEL_FEATURES_NO_XG = [f for f in FEATURE_COLUMNS if "xg" not in f]

# Clean feature set: excludes features that are always NaN in football-data.co.uk CSVs.
# Use this for the NEXT full re-training to avoid feeding constant-NaN columns to the model.
# Do NOT swap MODEL_FEATURES for this in production until the model is retrained with it.
#
# Always-NaN features excluded:
#   - home_possession, away_possession (not in football-data.co.uk CSVs)
_ALWAYS_NAN_FEATURES = {"home_possession", "away_possession"}
MODEL_FEATURES_CLEAN = [f for f in FEATURE_COLUMNS if f not in _ALWAYS_NAN_FEATURES]
MODEL_FEATURES_CLEAN_NO_XG = [f for f in MODEL_FEATURES_NO_XG if f not in _ALWAYS_NAN_FEATURES]

# Ensemble weight: XGBoost vs LightGBM (sum must = 1.0)
XGB_WEIGHT = 0.80
LGB_WEIGHT = 0.20


class FootballModel:
    """Ensemble XGBoost + LightGBM 3-class (H/D/A) with soft voting."""

    def __init__(self):
        self.base_model = XGBClassifier(
            objective="multi:softprob",
            num_class=3,
            # Optuna-tuned params (v6, 150 trials, log-loss 0.9809, 95 features)
            n_estimators=205,
            max_depth=2,
            learning_rate=0.03655,
            subsample=0.4579,
            colsample_bytree=0.7459,
            min_child_weight=33,
            reg_alpha=2.683,
            reg_lambda=0.716,
            gamma=3.796,
            eval_metric="mlogloss",
            verbosity=0,
        )
        self.lgb_model = LGBMClassifier(
            objective="multiclass",
            num_class=3,
            # Optuna-tuned params (v6, 120 trials, log-loss 0.9825, 95 features)
            n_estimators=504,
            max_depth=3,
            learning_rate=0.00740,
            subsample=0.6054,
            colsample_bytree=0.5297,
            min_child_samples=7,
            reg_alpha=1.661,
            reg_lambda=1.486,
            num_leaves=34,
            verbose=-1,
        )
        self.calibrators = None  # One IsotonicRegression per class

    def train(self, X_train, y_train):
        """Train both models without calibration."""
        self.calibrators = None
        self.base_model.fit(X_train, y_train)
        self.lgb_model.fit(X_train, y_train)

    def train_with_calibration(self, X_train, y_train, X_cal, y_cal):
        """Train both models then calibrate ensemble on held-out set."""
        self.base_model.fit(X_train, y_train)
        self.lgb_model.fit(X_train, y_train)

        # Calibrate on ensemble probabilities
        raw_proba = self._ensemble_proba(X_cal)
        self.calibrators = []
        for cls_idx in range(3):
            ir = IsotonicRegression(out_of_bounds="clip")
            ir.fit(raw_proba[:, cls_idx], (y_cal == cls_idx).astype(float))
            self.calibrators.append(ir)

    def _ensemble_proba(self, X) -> np.ndarray:
        """Soft-voting ensemble: weighted average of XGB and LGB probas."""
        xgb_p = self.base_model.predict_proba(X)
        lgb_p = self.lgb_model.predict_proba(X)
        blended = XGB_WEIGHT * xgb_p + LGB_WEIGHT * lgb_p
        # Normalize (should sum to 1 already, but guard against float errors)
        row_sums = blended.sum(axis=1, keepdims=True)
        return blended / np.maximum(row_sums, 1e-10)

    def predict_proba(self, X) -> np.ndarray:
        """Return ensemble probabilities [P(H), P(D), P(A)]."""
        raw = self._ensemble_proba(X)
        if self.calibrators is None:
            return raw

        calibrated = np.column_stack([
            self.calibrators[i].predict(raw[:, i]) for i in range(3)
        ])
        row_sums = calibrated.sum(axis=1, keepdims=True)
        return calibrated / np.maximum(row_sums, 1e-10)

    def predict_proba_uncalibrated(self, X) -> np.ndarray:
        """Return raw (uncalibrated) ensemble probabilities."""
        return self._ensemble_proba(X)

    @staticmethod
    def select_features(df: pd.DataFrame) -> list[str]:
        """Select active feature set based on xG data availability.

        Returns MODEL_FEATURES (with xG) if at least 10% of rows have real xG data,
        otherwise returns MODEL_FEATURES_NO_XG (legacy, no xG).
        This allows seamless transition before/after FBref enrichment.
        """
        # Check xG coverage in the dataset
        xg_coverage = 0.0
        if "home_xg_avg_5" in df.columns:
            xg_coverage = df["home_xg_avg_5"].notna().mean()

        if xg_coverage >= 0.10:
            console.print(
                f"[green]xG features active[/green] "
                f"(coverage: {xg_coverage:.1%} of rows)"
            )
            return [f for f in MODEL_FEATURES if f in df.columns]
        else:
            console.print(
                f"[yellow]xG features excluded[/yellow] "
                f"(coverage: {xg_coverage:.1%} — run enrich_xg.py to enable)"
            )
            return [f for f in MODEL_FEATURES_NO_XG if f in df.columns]

    def walk_forward_train(self, df: pd.DataFrame) -> dict:
        """Full walk-forward training with per-fold metrics.

        If ``self.active_features`` is already set before this call (e.g. by
        ``train_and_backtest.py`` when USE_CLEAN_FEATURES=True), that feature
        list is used as-is instead of being derived from ``select_features()``.
        """
        splitter = WalkForwardSplitter(min_train_seasons=2)
        fold_results = []

        # Honour pre-set active_features (e.g. clean feature override).
        # Otherwise auto-detect via select_features().
        if hasattr(self, "active_features") and self.active_features:
            active_features = self.active_features
        else:
            active_features = self.select_features(df)
            # Store on instance so save() can persist the feature list
            self.active_features = active_features
        X = df[active_features].values
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
        """Save model, feature list and metadata.

        The active_features list is stored in model.joblib so the inference
        pipeline always uses the exact feature set the model was trained on.
        """
        path.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "base_model": self.base_model,
            "lgb_model": self.lgb_model,
            "calibrators": self.calibrators,
            "active_features": getattr(self, "active_features", MODEL_FEATURES_NO_XG),
        }, path / "model.joblib")
        with open(path / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2, default=str)

    def load(self, path: Path):
        """Load saved model and feature list."""
        data = joblib.load(path / "model.joblib")
        self.base_model = data["base_model"]
        self.lgb_model = data.get("lgb_model", self.lgb_model)
        self.calibrators = data["calibrators"]
        # Restore active features (falls back to no-xG list for old models)
        self.active_features = data.get("active_features", MODEL_FEATURES_NO_XG)
