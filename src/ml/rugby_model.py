"""Rugby ML model: XGBoost (70%) + LightGBM (30%) ensemble for match winner prediction.

Binary classifier: P(home team wins) vs not (draw + away).
Rugby has draws but their frequency is low (~5-8%) — binary model is more robust
given the limited dataset size compared to football.
"""

from src.ml.binary_ensemble_model import BinaryEnsembleModel


class RugbyModel(BinaryEnsembleModel):
    """Binary classifier: P(home team wins).

    Inherits training, calibration, prediction, save and load from
    BinaryEnsembleModel. Only overrides hyperparameters.

    Rugby specifics: fewer estimators (300) due to smaller dataset, min_child_weight=5
    and gamma=0.1 for stronger regularisation.
    """

    DEFAULT_XGB_PARAMS = {
        "n_estimators": 300,
        "max_depth": 4,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 5,
        "gamma": 0.1,
        "eval_metric": "logloss",
        "random_state": 42,
        "verbosity": 0,
    }

    DEFAULT_LGB_PARAMS = {
        "n_estimators": 300,
        "max_depth": 4,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_samples": 20,
        "random_state": 42,
        "verbose": -1,
    }
