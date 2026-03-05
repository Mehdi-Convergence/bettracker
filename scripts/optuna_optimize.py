"""Optuna hyperparameter optimization for the XGBoost model.

Uses walk-forward validation (same as backtest) to avoid overfitting.
Optimizes log_loss on test folds.
"""

import sys
from pathlib import Path

import numpy as np
import optuna
import pandas as pd
from rich.console import Console
from rich.table import Table
from sklearn.metrics import log_loss
from xgboost import XGBClassifier

from src.ml.football_model import MODEL_FEATURES, LABEL_MAP

console = Console()

# Silence Optuna info logs
optuna.logging.set_verbosity(optuna.logging.WARNING)


def create_objective(df: pd.DataFrame):
    """Create Optuna objective function with walk-forward validation."""

    all_seasons = sorted(df["season"].unique())
    # Walk-forward: train on earlier seasons, test on later ones
    # Use folds: [2021,2122]->2223, [2021,2122,2223]->2324, [2021,2122,2223,2324]->2425
    folds = []
    for i in range(2, len(all_seasons)):
        train_seasons = all_seasons[:i]
        test_season = all_seasons[i]
        train_mask = df["season"].isin(train_seasons)
        test_mask = df["season"] == test_season
        folds.append((train_mask, test_mask, train_seasons, test_season))

    X_all = df[MODEL_FEATURES].values
    y_all = df["ftr"].map(LABEL_MAP).values

    def objective(trial):
        params = {
            "objective": "multi:softprob",
            "num_class": 3,
            "eval_metric": "mlogloss",
            "verbosity": 0,
            "n_estimators": trial.suggest_int("n_estimators", 100, 500, step=50),
            "max_depth": trial.suggest_int("max_depth", 3, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.15, log=True),
            "subsample": trial.suggest_float("subsample", 0.5, 0.9),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.4, 0.9),
            "min_child_weight": trial.suggest_int("min_child_weight", 5, 50),
            "reg_alpha": trial.suggest_float("reg_alpha", 0.01, 10.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.1, 20.0, log=True),
            "gamma": trial.suggest_float("gamma", 0.0, 2.0),
        }

        fold_losses = []
        for train_mask, test_mask, _, _ in folds:
            X_train = X_all[train_mask]
            y_train = y_all[train_mask]
            X_test = X_all[test_mask]
            y_test = y_all[test_mask]

            model = XGBClassifier(**params)
            model.fit(X_train, y_train)
            proba = model.predict_proba(X_test)
            ll = log_loss(y_test, proba)
            fold_losses.append(ll)

        return np.mean(fold_losses)

    return objective


def main():
    features_path = Path("data/processed/football_features.parquet")
    if not features_path.exists():
        console.print("[red]Features not found.[/red]")
        sys.exit(1)

    df = pd.read_parquet(features_path)
    console.print(f"Loaded {len(df)} matches, {len(MODEL_FEATURES)} features")

    n_trials = 200
    console.print(f"\n[bold]Starting Optuna optimization ({n_trials} trials)...[/bold]")
    console.print("Objective: minimize walk-forward log_loss across 3 folds")
    console.print("This will take a few minutes.\n")

    objective = create_objective(df)

    study = optuna.create_study(
        direction="minimize",
        sampler=optuna.samplers.TPESampler(seed=42),
    )

    # Add current params as first trial so we have a baseline
    study.enqueue_trial({
        "n_estimators": 200,
        "max_depth": 4,
        "learning_rate": 0.03,
        "subsample": 0.7,
        "colsample_bytree": 0.7,
        "min_child_weight": 10,
        "reg_alpha": 1.0,
        "reg_lambda": 5.0,
        "gamma": 0.5,
    })

    # Progress callback
    best_so_far = [float("inf")]
    def callback(study, trial):
        if trial.value < best_so_far[0]:
            best_so_far[0] = trial.value
            console.print(
                f"  Trial {trial.number}: log_loss={trial.value:.6f} [green](new best!)[/green]"
            )
        elif trial.number % 25 == 0:
            console.print(f"  Trial {trial.number}: log_loss={trial.value:.6f}")

    study.optimize(objective, n_trials=n_trials, callbacks=[callback])

    # Results
    console.print("\n" + "=" * 70)
    console.print("[bold]OPTIMIZATION RESULTS[/bold]")
    console.print("=" * 70)

    best = study.best_trial
    console.print(f"\nBest log_loss: {best.value:.6f}")
    console.print(f"Current model log_loss: {study.trials[0].value:.6f}")
    improvement = study.trials[0].value - best.value
    console.print(f"Improvement: {improvement:+.6f}")

    console.print("\n[bold]Best parameters:[/bold]")
    table = Table(title="Optimized Hyperparameters")
    table.add_column("Parameter", style="bold")
    table.add_column("Current", justify="right")
    table.add_column("Optimized", justify="right", style="cyan")

    current_params = {
        "n_estimators": 200, "max_depth": 4, "learning_rate": 0.03,
        "subsample": 0.7, "colsample_bytree": 0.7, "min_child_weight": 10,
        "reg_alpha": 1.0, "reg_lambda": 5.0, "gamma": 0.5,
    }

    for param, current_val in current_params.items():
        opt_val = best.params[param]
        if isinstance(opt_val, float):
            table.add_row(param, f"{current_val}", f"{opt_val:.4f}")
        else:
            table.add_row(param, f"{current_val}", f"{opt_val}")

    console.print(table)

    # Show top 5 trials
    console.print("\n[bold]Top 5 trials:[/bold]")
    sorted_trials = sorted(study.trials, key=lambda t: t.value)
    for i, trial in enumerate(sorted_trials[:5], 1):
        console.print(f"  {i}. log_loss={trial.value:.6f} (trial #{trial.number})")

    # Generate code to update football_model.py
    console.print("\n" + "=" * 70)
    console.print("[bold]CODE TO UPDATE football_model.py:[/bold]")
    console.print("=" * 70)
    bp = best.params
    console.print(f"""
self.base_model = XGBClassifier(
    objective="multi:softprob",
    num_class=3,
    n_estimators={bp['n_estimators']},
    max_depth={bp['max_depth']},
    learning_rate={bp['learning_rate']:.6f},
    subsample={bp['subsample']:.4f},
    colsample_bytree={bp['colsample_bytree']:.4f},
    min_child_weight={bp['min_child_weight']},
    reg_alpha={bp['reg_alpha']:.6f},
    reg_lambda={bp['reg_lambda']:.6f},
    gamma={bp['gamma']:.6f},
    eval_metric="mlogloss",
    verbosity=0,
)""")


if __name__ == "__main__":
    main()
