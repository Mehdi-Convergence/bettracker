"""PMU ML models: XGBoost (70%) + LightGBM (30%) ensemble for horse racing.

Two separate models in this file:
  - PMUWinModel   : P(horse wins the race) — ~8% positive class
  - PMUPlaceModel : P(horse finishes top-3) — ~25% positive class

Both use:
  - Binary classification with class-imbalance handling (scale_pos_weight)
  - Isotonic calibration on a chronological held-out set
  - Soft-voting ensemble: 70% XGBoost + 30% LightGBM
"""

import json
from pathlib import Path

import joblib
import numpy as np
from lightgbm import LGBMClassifier
from sklearn.isotonic import IsotonicRegression
from xgboost import XGBClassifier

from src.features.pmu_features import PMU_FEATURE_COLUMNS

# Ensemble weights
_XGB_WEIGHT = 0.70
_LGB_WEIGHT = 0.30

# Approximate class ratios (used as default scale_pos_weight)
_WIN_SCALE_POS_WEIGHT = 11.0   # ~8% positif → (1-0.08)/0.08 ≈ 11.5, rounded
_PLACE_SCALE_POS_WEIGHT = 3.0  # ~25% positif → (1-0.25)/0.25 = 3.0

MODEL_DIR_WIN = Path("models/pmu/win_model")
MODEL_DIR_PLACE = Path("models/pmu/place_model")


class _PMUBaseModel:
    """Shared base for PMUWinModel and PMUPlaceModel."""

    _scale_pos_weight: float = 1.0
    _model_name: str = "pmu_base"

    def __init__(self, scale_pos_weight: float | None = None):
        spw = scale_pos_weight if scale_pos_weight is not None else self._scale_pos_weight
        self._xgb = XGBClassifier(
            objective="binary:logistic",
            n_estimators=300,
            max_depth=4,
            learning_rate=0.03,
            subsample=0.7,
            colsample_bytree=0.7,
            min_child_weight=10,
            reg_alpha=0.5,
            reg_lambda=1.0,
            gamma=0.5,
            scale_pos_weight=spw,
            eval_metric="logloss",
            verbosity=0,
            random_state=42,
        )
        self._lgb = LGBMClassifier(
            objective="binary",
            n_estimators=300,
            max_depth=4,
            learning_rate=0.03,
            subsample=0.7,
            colsample_bytree=0.7,
            min_child_samples=20,
            reg_alpha=0.5,
            reg_lambda=1.0,
            num_leaves=31,
            is_unbalance=True,
            verbose=-1,
            random_state=42,
        )
        self._calibrator: IsotonicRegression | None = None
        self._trained: bool = False
        self.feature_columns: list[str] = PMU_FEATURE_COLUMNS

    def train(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on X, y without calibration."""
        self._xgb.fit(X, y)
        self._lgb.fit(X, y)
        self._trained = True
        self._calibrator = None

    def train_with_calibration(
        self, X_train: np.ndarray, y_train: np.ndarray,
        X_cal: np.ndarray, y_cal: np.ndarray
    ) -> None:
        """Train on X_train / y_train, then calibrate isotonically on X_cal / y_cal.

        The calibration set must come AFTER the training set chronologically.
        """
        self._xgb.fit(X_train, y_train)
        self._lgb.fit(X_train, y_train)
        self._trained = True

        raw = self._ensemble_proba(X_cal)
        self._calibrator = IsotonicRegression(out_of_bounds="clip")
        self._calibrator.fit(raw, y_cal)

    def _ensemble_proba(self, X: np.ndarray) -> np.ndarray:
        """Soft voting: 70% XGBoost + 30% LightGBM, returns 1-D array."""
        p_xgb = self._xgb.predict_proba(X)[:, 1]
        p_lgb = self._lgb.predict_proba(X)[:, 1]
        return _XGB_WEIGHT * p_xgb + _LGB_WEIGHT * p_lgb

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return probability for the positive class (win or place) as 1-D array."""
        if not self._trained:
            raise RuntimeError(f"{self._model_name} has not been trained yet.")
        raw = self._ensemble_proba(X)
        if self._calibrator is not None:
            return self._calibrator.predict(raw)
        return raw

    def save(self, model_dir: Path, metadata: dict) -> None:
        model_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "xgb": self._xgb,
                "lgb": self._lgb,
                "calibrator": self._calibrator,
                "feature_columns": self.feature_columns,
            },
            model_dir / "model.joblib",
        )
        with open(model_dir / "metadata.json", "w") as fh:
            json.dump(metadata, fh, indent=2, default=str)

    def load(self, model_dir: Path) -> None:
        data = joblib.load(model_dir / "model.joblib")
        self._xgb = data["xgb"]
        self._lgb = data["lgb"]
        self._calibrator = data.get("calibrator")
        self.feature_columns = data.get("feature_columns", PMU_FEATURE_COLUMNS)
        self._trained = True


class PMUWinModel(_PMUBaseModel):
    """Binary classifier: P(horse wins the race).

    Class imbalance: ~8% positive (1 winner per race of ~12 runners).
    scale_pos_weight ~ 11 by default.
    """

    _scale_pos_weight: float = _WIN_SCALE_POS_WEIGHT
    _model_name: str = "PMUWinModel"

    def __init__(self, scale_pos_weight: float | None = None):
        super().__init__(scale_pos_weight=scale_pos_weight)

    @classmethod
    def load_from_dir(cls, model_dir: Path = MODEL_DIR_WIN) -> "PMUWinModel":
        obj = cls()
        obj.load(model_dir)
        return obj


class PMUPlaceModel(_PMUBaseModel):
    """Binary classifier: P(horse finishes in top-3).

    Class imbalance: ~25% positive (3 places per ~12 runners).
    scale_pos_weight ~ 3 by default.
    """

    _scale_pos_weight: float = _PLACE_SCALE_POS_WEIGHT
    _model_name: str = "PMUPlaceModel"

    def __init__(self, scale_pos_weight: float | None = None):
        super().__init__(scale_pos_weight=scale_pos_weight)

    @classmethod
    def load_from_dir(cls, model_dir: Path = MODEL_DIR_PLACE) -> "PMUPlaceModel":
        obj = cls()
        obj.load(model_dir)
        return obj
