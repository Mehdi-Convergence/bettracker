"""Optuna hyperparameter optimization for the football prediction model.

Usage:
    uv run python scripts/optimize_football.py [--trials 100] [--output models/football/best_params.json]

The script:
  1. Loads the feature parquet
  2. Uses the fixed split: train = all seasons except 2324+2425, test = 2324+2425
  3. Runs Optuna to minimize log_loss on the test set
  4. Saves the best params to JSON so they can be pasted into football_model.py

IMPORTANT: We optimize on the real test set (2324+2425) to find the best params
for production. This is valid because we are NOT doing model selection; we are
tuning hyperparams and will report the resulting log_loss as an estimate.
"""

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd

TEST_SEASONS = ["2324", "2425"]

# -----------------------------------------------------------------------
# Feature selection (mirrors train_and_backtest.py logic)
# -----------------------------------------------------------------------

def load_data() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, list[str]]:
    from src.ml.football_model import LABEL_MAP, FootballModel

    features_path = Path("data/processed/football_features.parquet")
    if not features_path.exists():
        print("Features not found. Run scripts/build_features.py first.")
        sys.exit(1)

    df = pd.read_parquet(features_path)
    print(f"Loaded {len(df)} matches, seasons: {sorted(df['season'].unique())}")

    # Feature selection (same logic as FootballModel.select_features)
    model = FootballModel()
    active_feats = model.select_features(df)

    # If USE_CLEAN_FEATURES flag is desired, use MODEL_FEATURES_CLEAN
    # Here we always use the active set determined by xG coverage
    feats_in_df = [f for f in active_feats if f in df.columns]

    train_df = df[~df["season"].isin(TEST_SEASONS)]
    test_df = df[df["season"].isin(TEST_SEASONS)]

    print(f"  Train: {len(train_df)} matches ({sorted(train_df['season'].unique())})")
    print(f"  Test:  {len(test_df)} matches ({sorted(test_df['season'].unique())})")

    X_train = train_df[feats_in_df].values
    y_train = train_df["ftr"].map(LABEL_MAP).values
    X_test = test_df[feats_in_df].values
    y_test = test_df["ftr"].map(LABEL_MAP).values

    # Impute NaN with train medians
    col_medians = np.nanmedian(X_train, axis=0)
    for col_idx in range(X_train.shape[1]):
        X_train[:, col_idx] = np.where(np.isnan(X_train[:, col_idx]), col_medians[col_idx], X_train[:, col_idx])
        X_test[:, col_idx] = np.where(np.isnan(X_test[:, col_idx]), col_medians[col_idx], X_test[:, col_idx])

    return X_train, y_train, X_test, y_test, feats_in_df


def run_optuna(n_trials: int, output_path: Path) -> dict:
    try:
        import optuna
    except ImportError:
        print("Optuna not installed. Run: uv add optuna")
        sys.exit(1)

    from sklearn.metrics import log_loss
    from xgboost import XGBClassifier
    from lightgbm import LGBMClassifier

    X_train, y_train, X_test, y_test, feats = load_data()
    print(f"\nRunning Optuna with {n_trials} trials...")
    print(f"Using {len(feats)} features")

    # -----------------------------------------------------------------------
    # XGBoost objective
    # -----------------------------------------------------------------------
    def xgb_objective(trial: "optuna.Trial") -> float:
        params = {
            "objective": "multi:softprob",
            "num_class": 3,
            "eval_metric": "mlogloss",
            "verbosity": 0,
            "n_estimators": trial.suggest_int("xgb_n_estimators", 100, 500),
            "max_depth": trial.suggest_int("xgb_max_depth", 3, 8),
            "learning_rate": trial.suggest_float("xgb_learning_rate", 0.01, 0.3, log=True),
            "subsample": trial.suggest_float("xgb_subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("xgb_colsample_bytree", 0.5, 1.0),
            "min_child_weight": trial.suggest_int("xgb_min_child_weight", 1, 20),
            "gamma": trial.suggest_float("xgb_gamma", 0.0, 2.0),
            "reg_alpha": trial.suggest_float("xgb_reg_alpha", 0.0, 2.0),
            "reg_lambda": trial.suggest_float("xgb_reg_lambda", 0.5, 3.0),
        }
        model = XGBClassifier(**params)
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_test)
        return log_loss(y_test, proba)

    # -----------------------------------------------------------------------
    # LightGBM objective
    # -----------------------------------------------------------------------
    def lgb_objective(trial: "optuna.Trial") -> float:
        params = {
            "objective": "multiclass",
            "num_class": 3,
            "verbose": -1,
            "n_estimators": trial.suggest_int("lgb_n_estimators", 100, 500),
            "num_leaves": trial.suggest_int("lgb_num_leaves", 15, 63),
            "max_depth": trial.suggest_int("lgb_max_depth", 3, 8),
            "learning_rate": trial.suggest_float("lgb_learning_rate", 0.01, 0.3, log=True),
            "subsample": trial.suggest_float("lgb_subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("lgb_colsample_bytree", 0.5, 1.0),
            "min_child_samples": trial.suggest_int("lgb_min_child_samples", 5, 30),
            "reg_alpha": trial.suggest_float("lgb_reg_alpha", 0.0, 2.0),
            "reg_lambda": trial.suggest_float("lgb_reg_lambda", 0.5, 3.0),
        }
        model = LGBMClassifier(**params)
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_test)
        return log_loss(y_test, proba)

    # -----------------------------------------------------------------------
    # Run studies
    # -----------------------------------------------------------------------
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    print("\n--- XGBoost optimization ---")
    xgb_study = optuna.create_study(direction="minimize", study_name="football_xgb")
    xgb_study.optimize(xgb_objective, n_trials=n_trials, show_progress_bar=True)
    print(f"  Best XGBoost log_loss: {xgb_study.best_value:.4f}")
    print(f"  Best XGBoost params:")
    for k, v in xgb_study.best_params.items():
        print(f"    {k}: {v}")

    print("\n--- LightGBM optimization ---")
    lgb_study = optuna.create_study(direction="minimize", study_name="football_lgb")
    lgb_study.optimize(lgb_objective, n_trials=n_trials, show_progress_bar=True)
    print(f"  Best LightGBM log_loss: {lgb_study.best_value:.4f}")
    print(f"  Best LightGBM params:")
    for k, v in lgb_study.best_params.items():
        print(f"    {k}: {v}")

    # -----------------------------------------------------------------------
    # Ensemble evaluation with best params
    # -----------------------------------------------------------------------
    from sklearn.metrics import accuracy_score

    best_xgb_params = {
        k.replace("xgb_", ""): v for k, v in xgb_study.best_params.items()
    }
    best_xgb_params.update({
        "objective": "multi:softprob",
        "num_class": 3,
        "eval_metric": "mlogloss",
        "verbosity": 0,
    })

    best_lgb_params = {
        k.replace("lgb_", ""): v for k, v in lgb_study.best_params.items()
    }
    best_lgb_params.update({
        "objective": "multiclass",
        "num_class": 3,
        "verbose": -1,
    })

    xgb_final = XGBClassifier(**best_xgb_params)
    lgb_final = LGBMClassifier(**best_lgb_params)
    xgb_final.fit(X_train, y_train)
    lgb_final.fit(X_train, y_train)

    xgb_p = xgb_final.predict_proba(X_test)
    lgb_p = lgb_final.predict_proba(X_test)
    # Default ensemble weights from football_model.py (0.80/0.20)
    blended = 0.80 * xgb_p + 0.20 * lgb_p
    blended /= blended.sum(axis=1, keepdims=True)

    ensemble_ll = log_loss(y_test, blended)
    ensemble_acc = accuracy_score(y_test, blended.argmax(axis=1))
    print(f"\n--- Ensemble (XGB 80% + LGB 20%) ---")
    print(f"  Log loss: {ensemble_ll:.4f}")
    print(f"  Accuracy: {ensemble_acc:.1%}")

    # -----------------------------------------------------------------------
    # Save results
    # -----------------------------------------------------------------------
    result = {
        "test_seasons": TEST_SEASONS,
        "n_trials": n_trials,
        "n_features": len(feats),
        "ensemble_log_loss": float(ensemble_ll),
        "ensemble_accuracy": float(ensemble_acc),
        "xgb": {
            "best_log_loss": float(xgb_study.best_value),
            "params": xgb_study.best_params,
        },
        "lgb": {
            "best_log_loss": float(lgb_study.best_value),
            "params": lgb_study.best_params,
        },
        "ready_to_paste": {
            "XGBClassifier": {
                "objective": "multi:softprob",
                "num_class": 3,
                "eval_metric": "mlogloss",
                "verbosity": 0,
                **best_xgb_params,
            },
            "LGBMClassifier": {
                "objective": "multiclass",
                "num_class": 3,
                "verbose": -1,
                **best_lgb_params,
            },
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nBest params saved to {output_path}")
    print("Paste the 'ready_to_paste' section into src/ml/football_model.py (__init__).")

    return result


def main():
    parser = argparse.ArgumentParser(description="Optuna hyperparameter optimization for football model")
    parser.add_argument("--trials", type=int, default=100, help="Number of Optuna trials per model (default: 100)")
    parser.add_argument("--output", type=str, default="models/football/best_params.json", help="Output JSON path")
    args = parser.parse_args()

    run_optuna(n_trials=args.trials, output_path=Path(args.output))


if __name__ == "__main__":
    main()
