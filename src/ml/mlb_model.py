"""MLB ML model: XGBoost (70%) + LightGBM (30%) ensemble for game winner prediction."""

from src.ml.binary_ensemble_model import BinaryEnsembleModel


class MLBModel(BinaryEnsembleModel):
    """Binary classifier: P(home team wins).

    Inherits training, calibration, prediction, save and load from
    BinaryEnsembleModel. Only overrides hyperparameters.

    MLB specifics: shallower trees (max_depth=4), lower learning rates and
    lower subsampling ratios to account for the noisier nature of baseball data.
    """

    DEFAULT_XGB_PARAMS = {
        "n_estimators": 400,
        "max_depth": 4,
        "learning_rate": 0.03,
        "subsample": 0.7,
        "colsample_bytree": 0.7,
        "eval_metric": "logloss",
        "random_state": 42,
        "verbosity": 0,
    }

    DEFAULT_LGB_PARAMS = {
        "n_estimators": 400,
        "max_depth": 4,
        "learning_rate": 0.025,
        "subsample": 0.7,
        "colsample_bytree": 0.6,
        "min_child_samples": 20,
        "random_state": 42,
        "verbose": -1,
    }
