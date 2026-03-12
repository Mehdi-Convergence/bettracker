"""NBA ML model: XGBoost (70%) + LightGBM (30%) ensemble for game winner prediction."""

import json
from pathlib import Path

import joblib
import numpy as np
from lightgbm import LGBMClassifier
from sklearn.calibration import CalibratedClassifierCV
from xgboost import XGBClassifier


class NBAModel:
    """Binary classifier: P(home team wins)."""

    def __init__(self):
        self._xgb = XGBClassifier(
            n_estimators=400,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            gamma=0.1,
            eval_metric="logloss",
            random_state=42,
            verbosity=0,
        )
        self._lgb = LGBMClassifier(
            n_estimators=400,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_samples=20,
            random_state=42,
            verbose=-1,
        )
        self._xgb_cal = None
        self._lgb_cal = None
        self._trained = False

    def train(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train ensemble with isotonic calibration (chronological split)."""
        # Use last 20% as calibration set (chronological — data must be sorted by date)
        n = len(X)
        split = int(n * 0.8)
        X_train, X_cal = X[:split], X[split:]
        y_train, y_cal = y[:split], y[split:]

        # Fit base models on training portion
        self._xgb.fit(X_train, y_train)
        self._lgb.fit(X_train, y_train)

        # Calibrate on held-out chronological portion (cv="prefit")
        self._xgb_cal = CalibratedClassifierCV(self._xgb, method="isotonic", cv="prefit")
        self._lgb_cal = CalibratedClassifierCV(self._lgb, method="isotonic", cv="prefit")
        self._xgb_cal.fit(X_cal, y_cal)
        self._lgb_cal.fit(X_cal, y_cal)
        self._trained = True

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return P(home wins) as 1-D array."""
        p_xgb = self._xgb_cal.predict_proba(X)[:, 1]
        p_lgb = self._lgb_cal.predict_proba(X)[:, 1]
        return 0.7 * p_xgb + 0.3 * p_lgb

    def save(self, model_dir: Path, metadata: dict) -> None:
        model_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump({"xgb": self._xgb_cal, "lgb": self._lgb_cal}, model_dir / "model.joblib")
        with open(model_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

    @classmethod
    def load(cls, model_dir: Path) -> "NBAModel":
        obj = cls()
        data = joblib.load(model_dir / "model.joblib")
        obj._xgb_cal = data["xgb"]
        obj._lgb_cal = data["lgb"]
        obj._trained = True
        return obj
