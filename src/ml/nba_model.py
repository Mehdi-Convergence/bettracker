"""NBA ML model: XGBoost (70%) + LightGBM (30%) ensemble for game winner prediction."""

from src.ml.binary_ensemble_model import BinaryEnsembleModel


class NBAModel(BinaryEnsembleModel):
    """Binary classifier: P(home team wins).

    Inherits training, calibration, prediction, save and load from
    BinaryEnsembleModel. Only overrides hyperparameters.
    """

    DEFAULT_XGB_PARAMS = {
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

    DEFAULT_LGB_PARAMS = {
        "n_estimators": 400,
        "max_depth": 5,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_samples": 20,
        "random_state": 42,
        "verbose": -1,
    }
