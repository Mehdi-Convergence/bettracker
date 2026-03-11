"""Optuna hyperparameter tuning for XGBoost football model."""
import os, sys, warnings, json
os.environ["PYTHONIOENCODING"] = "utf-8"
warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd
import optuna
from xgboost import XGBClassifier
from sklearn.metrics import log_loss
optuna.logging.set_verbosity(optuna.logging.WARNING)

from src.ml.football_model import MODEL_FEATURES, LABEL_MAP

df = pd.read_parquet(os.path.join(ROOT, "data/processed/football_features.parquet"))
all_seasons = sorted(df["season"].unique())
print(f"Seasons: {all_seasons}")

# Walk-forward CV: train on s1..sN-2, validate on sN-1, test on sN
# We use seasons up to 2324 for tuning (keep 2425 as holdout)
tune_seasons = [s for s in all_seasons if s <= "2324"]
print(f"Tune seasons: {tune_seasons}\n")

# Build walk-forward folds for tuning
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
        "max_depth": trial.suggest_int("max_depth", 2, 6),
        "learning_rate": trial.suggest_float("learning_rate", 0.005, 0.08, log=True),
        "subsample": trial.suggest_float("subsample", 0.4, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.4, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 5, 60),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 3.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 3.0),
        "gamma": trial.suggest_float("gamma", 0.0, 4.0),
    }
    losses = []
    for X_train, y_train, X_val, y_val, _ in folds:
        model = XGBClassifier(
            objective="multi:softprob", num_class=3,
            eval_metric="mlogloss", verbosity=0, **params
        )
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_val)
        losses.append(log_loss(y_val, proba))
    return np.mean(losses)

study = optuna.create_study(direction="minimize")
print("Starting Optuna (150 trials)...")
study.optimize(objective, n_trials=150, show_progress_bar=False)

best = study.best_params
best_val = study.best_value
print(f"\nBest log-loss: {best_val:.4f}")
print(f"Best params: {json.dumps(best, indent=2)}")

# Save to file
out = {
    "best_log_loss": best_val,
    "best_params": best,
    "n_trials": len(study.trials),
}
with open(os.path.join(ROOT, "data/xgb_best_params.json"), "w") as f:
    json.dump(out, f, indent=2)
print("\nSaved to data/xgb_best_params.json")

# Compare vs current params
current_params = {
    "n_estimators": 250, "max_depth": 3, "learning_rate": 0.018348,
    "subsample": 0.6448, "colsample_bytree": 0.8828, "min_child_weight": 30,
    "reg_alpha": 0.749750, "reg_lambda": 0.165750, "gamma": 1.818039,
}
losses_current = []
for X_train, y_train, X_val, y_val, _ in folds:
    model = XGBClassifier(objective="multi:softprob", num_class=3,
                          eval_metric="mlogloss", verbosity=0, **current_params)
    model.fit(X_train, y_train)
    proba = model.predict_proba(X_val)
    losses_current.append(log_loss(y_val, proba))

print(f"\nCurrent params log-loss: {np.mean(losses_current):.4f}")
print(f"Optuna params log-loss:  {best_val:.4f}")
print(f"Improvement: {(np.mean(losses_current) - best_val)*100:.2f}% reduction in log-loss")
