"""Base class for binary (win/lose) ensemble models (XGBoost 70% + LightGBM 30%).

All sport-specific models inherit from this class and only override the
default hyperparameter class attributes when needed.

predict_proba() returns a 1-D array of P(home/p1 wins) — not a 2-column matrix.
This matches the calling convention in scan_worker.py: model.predict_proba(X)[0].
"""

import json
import logging
from pathlib import Path
from typing import ClassVar

import joblib
import numpy as np
from lightgbm import LGBMClassifier
from sklearn.isotonic import IsotonicRegression
from xgboost import XGBClassifier

logger = logging.getLogger(__name__)


class BinaryEnsembleModel:
    """XGBoost + LightGBM ensemble for binary win-probability classification.

    Architecture:
    - Both base models are calibrated independently via isotonic regression
      on the last 20% of the chronological training set.
    - Final probability = 70% XGB + 30% LGB (class-level weight, overridable).

    Subclasses override DEFAULT_XGB_PARAMS / DEFAULT_LGB_PARAMS / XGB_WEIGHT
    to set sport-specific hyperparameters.
    """

    DEFAULT_XGB_PARAMS: ClassVar[dict] = {
        "n_estimators": 400,
        "max_depth": 5,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 3,
        "gamma": 0.1,
        "eval_metric": "logloss",
        "random_state": 42,
        "verbosity": 0,
    }

    DEFAULT_LGB_PARAMS: ClassVar[dict] = {
        "n_estimators": 400,
        "max_depth": 5,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_samples": 20,
        "random_state": 42,
        "verbose": -1,
    }

    XGB_WEIGHT: ClassVar[float] = 0.7

    def __init__(self) -> None:
        self._xgb = XGBClassifier(**self.DEFAULT_XGB_PARAMS)
        self._lgb = LGBMClassifier(**self.DEFAULT_LGB_PARAMS)
        self._xgb_iso: IsotonicRegression | None = None
        self._lgb_iso: IsotonicRegression | None = None
        self._trained = False

    def train(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train ensemble with isotonic calibration on chronological 80/20 split."""
        split = int(len(X) * 0.8)
        X_train, X_cal = X[:split], X[split:]
        y_train, y_cal = y[:split], y[split:]

        self._xgb.fit(X_train, y_train)
        self._lgb.fit(X_train, y_train)

        xgb_raw = self._xgb.predict_proba(X_cal)[:, 1]
        lgb_raw = self._lgb.predict_proba(X_cal)[:, 1]

        self._xgb_iso = IsotonicRegression(out_of_bounds="clip").fit(xgb_raw, y_cal)
        self._lgb_iso = IsotonicRegression(out_of_bounds="clip").fit(lgb_raw, y_cal)
        self._trained = True

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return P(home/p1 wins) as a 1-D array (XGB_WEIGHT * XGB + (1-XGB_WEIGHT) * LGB)."""
        p_xgb = self._xgb_iso.predict(self._xgb.predict_proba(X)[:, 1])
        p_lgb = self._lgb_iso.predict(self._lgb.predict_proba(X)[:, 1])
        return self.XGB_WEIGHT * p_xgb + (1 - self.XGB_WEIGHT) * p_lgb

    def save(self, model_dir: Path, metadata: dict) -> None:
        """Serialize model and metadata to model_dir/model.joblib + metadata.json."""
        model_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "xgb": self._xgb,
                "lgb": self._lgb,
                "xgb_iso": self._xgb_iso,
                "lgb_iso": self._lgb_iso,
            },
            model_dir / "model.joblib",
        )
        with open(model_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

    @classmethod
    def load(cls, model_dir: Path) -> "BinaryEnsembleModel":
        """Load a previously saved model from model_dir."""
        obj = cls()
        data = joblib.load(model_dir / "model.joblib")
        obj._xgb = data["xgb"]
        obj._lgb = data["lgb"]
        obj._xgb_iso = data["xgb_iso"]
        obj._lgb_iso = data["lgb_iso"]
        obj._trained = True
        return obj
