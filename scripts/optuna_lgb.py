"""Optuna hyperparameter tuning for LightGBM football model."""
import os, sys, warnings, json
os.environ["PYTHONIOENCODING"] = "utf-8"
warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd
import optuna
from lightgbm import LGBMClassifier
from sklearn.metrics import log_loss
optuna.logging.set_verbosity(optuna.logging.WARNING)

from src.ml.football_model import MODEL_FEATURES, LABEL_MAP

df = pd.read_parquet(os.path.join(ROOT, "data/processed/football_features.parquet"))
all_seasons = sorted(df["season"].unique())

tune_seasons = [s for s in all_seasons if s <= "2324"]
print(f"Tune seasons: {tune_seasons}\n")

folds = []
for i in range(2, len(tune_seasons)):
    train_s = tune_seasons[:i]
    val_s = tune_seasons[i]
    train_df = df[df["season"].isin(train_s)]
    val_df = df[df["season"] == val_s]
    X_train = train_df[MODEL_FEATURES].fillna(0).values
    y_train = train_df["ftr"].map(LABEL_MAP).values
    X_val = val_df[MODEL_FEATURES].fillna(0).values
    y_val = val_df["ftr"].map(LABEL_MAP).values
    folds.append((X_train, y_train, X_val, y_val, val_s))
    print(f"  Fold val={val_s}: train={len(X_train)}, val={len(X_val)}")

print(f"\n{len(folds)} folds for tuning\n")

def objective(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 100, 600),
        "max_depth": trial.suggest_int("max_depth", 3, 8),
        "learning_rate": trial.suggest_float("learning_rate", 0.005, 0.08, log=True),
        "subsample": trial.suggest_float("subsample", 0.4, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.4, 1.0),
        "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 3.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 3.0),
        "num_leaves": trial.suggest_int("num_leaves", 15, 127),
    }
    losses = []
    for X_train, y_train, X_val, y_val, _ in folds:
        model = LGBMClassifier(
            objective="multiclass", num_class=3,
            verbose=-1, **params
        )
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_val)
        losses.append(log_loss(y_val, proba))
    return np.mean(losses)

study = optuna.create_study(direction="minimize")
print("Starting LGB Optuna (120 trials)...")
study.optimize(objective, n_trials=120, show_progress_bar=False)

best = study.best_params
best_val = study.best_value
print(f"\nBest LGB log-loss: {best_val:.4f}")
print(f"Best params: {json.dumps(best, indent=2)}")

out = {"best_log_loss": best_val, "best_params": best, "n_trials": len(study.trials)}
with open(os.path.join(ROOT, "data/lgb_best_params.json"), "w") as f:
    json.dump(out, f, indent=2)
print("\nSaved to data/lgb_best_params.json")
