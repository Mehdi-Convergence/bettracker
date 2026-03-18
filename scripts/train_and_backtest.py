"""Train the model with walk-forward validation and run backtesting."""
import os
import sys
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import pandas as pd
from rich.console import Console

from src.backtest.engine import BacktestEngine
from src.backtest.metrics import BacktestMetrics
from src.backtest.report import print_report
from src.ml.football_model import FootballModel, MODEL_FEATURES, LABEL_MAP

console = Console()

# ---------------------------------------------------------------------------
# Feature selection flag
# ---------------------------------------------------------------------------
# Set to True to exclude features that are always NaN in football-data.co.uk
# CSVs (home_possession, away_possession). This produces a cleaner model and
# avoids wasting a tree split budget on constant-NaN columns.
#
# IMPORTANT: switching this flag changes the feature set → the resulting model
# is NOT compatible with the existing production model weights. Only enable
# when doing a full re-training cycle and plan to deploy the new model.
USE_CLEAN_FEATURES = False

if USE_CLEAN_FEATURES:
    from src.ml.football_model import MODEL_FEATURES_CLEAN as _FEATURES_OVERRIDE  # noqa: F401
else:
    _FEATURES_OVERRIDE = None  # Use FootballModel.select_features() as usual


def main():
    features_path = Path("data/processed/football_features.parquet")
    if not features_path.exists():
        console.print("[red]Features not found. Run scripts/build_features.py first.[/red]")
        sys.exit(1)

    console.print("[bold]Loading feature dataset...[/bold]")
    df = pd.read_parquet(features_path)
    n_feats = len(_FEATURES_OVERRIDE) if USE_CLEAN_FEATURES else len(MODEL_FEATURES)
    feat_label = "clean features" if USE_CLEAN_FEATURES else "features"
    console.print(f"Loaded {len(df)} matches, {n_feats} {feat_label}")
    if USE_CLEAN_FEATURES:
        console.print("[yellow]USE_CLEAN_FEATURES=True: home_possession + away_possession excluded[/yellow]")
    console.print(f"Seasons: {sorted(df['season'].unique())}")
    console.print(f"Target: H={sum(df['ftr']=='H')}, D={sum(df['ftr']=='D')}, A={sum(df['ftr']=='A')}")

    # --- PHASE 1: Walk-forward model training metrics ---
    console.print("\n" + "=" * 60)
    console.print("[bold]PHASE 1: Walk-Forward Model Training[/bold]")
    console.print("=" * 60)

    model = FootballModel()
    # When USE_CLEAN_FEATURES is active, pre-set active_features so that
    # walk_forward_train uses the clean list instead of auto-detecting via
    # select_features(). The select_features() call inside walk_forward_train
    # reads self.active_features only when it is already set.
    if USE_CLEAN_FEATURES and _FEATURES_OVERRIDE is not None:
        clean_feats = [f for f in _FEATURES_OVERRIDE if f in df.columns]
        model.active_features = clean_feats
        console.print(f"[yellow]Override: using {len(clean_feats)} clean features for walk-forward[/yellow]")
    results = model.walk_forward_train(df)

    console.print("\n[bold]Aggregated Walk-Forward Results:[/bold]")
    avg = results["average"]
    console.print(f"  Accuracy:          {avg['accuracy']:.1%} (+/- {avg['accuracy_std']:.1%})")
    console.print(f"  Log Loss (cal):    {avg['log_loss_cal']:.4f}")
    console.print(f"  Log Loss (uncal):  {avg['log_loss_uncal']:.4f}")
    console.print(f"  Calibration gain:  {avg['log_loss_uncal'] - avg['log_loss_cal']:.4f}")
    console.print(f"  Train accuracy:    {avg['train_accuracy']:.1%}")
    console.print(f"  Overfit gap:       {avg['overfit_gap']:.1%}")

    if avg['overfit_gap'] > 0.10:
        console.print("[red bold]  WARNING: Train-test gap > 10% - overfitting detected![/red bold]")

    # --- PHASE 2: Backtesting Strategies ---
    console.print("\n" + "=" * 60)
    console.print("[bold]PHASE 2: Backtesting Simulation[/bold]")
    console.print("=" * 60)

    test_seasons = ["2324", "2425"]
    metrics = BacktestMetrics()

    strategies = [
        # --- Paris simples : confiance modele ---
        ("SIMPLE, prob>=60%, flat 5%", {"min_edge": 0.0, "min_model_prob": 0.60, "staking_strategy": "flat", "flat_stake_amount": 10.0, "initial_bankroll": 200.0}),
        ("SIMPLE, prob>=55%, edge>3%", {"min_edge": 0.03, "min_model_prob": 0.55, "staking_strategy": "flat", "flat_stake_amount": 10.0, "initial_bankroll": 200.0}),
        # --- Reference nuls ---
        ("NULS, edge>5% (reference)", {"allowed_outcomes": ["D"], "min_edge": 0.05, "staking_strategy": "flat", "flat_stake_amount": 10.0, "initial_bankroll": 200.0}),
        # --- COMBIS 2 legs ---
        ("COMBO 2 legs, odds 1.8-3.0, prob>=55%", {
            "combo_mode": True, "combo_max_legs": 2, "combo_min_odds": 1.8, "combo_max_odds": 3.0,
            "min_edge": 0.02, "min_model_prob": 0.55, "staking_strategy": "flat", "flat_stake_amount": 10.0, "initial_bankroll": 200.0, "combo_top_n": 2,
        }),
        ("COMBO 2 legs, odds 1.8-3.0, prob>=60%", {
            "combo_mode": True, "combo_max_legs": 2, "combo_min_odds": 1.8, "combo_max_odds": 3.0,
            "min_edge": 0.02, "min_model_prob": 0.60, "staking_strategy": "flat", "flat_stake_amount": 10.0, "initial_bankroll": 200.0, "combo_top_n": 2,
        }),
        # --- COMBIS 2-3 legs ---
        ("COMBO 2-3 legs, odds 1.8-3.0, prob>=55%", {
            "combo_mode": True, "combo_max_legs": 3, "combo_min_odds": 1.8, "combo_max_odds": 3.0,
            "min_edge": 0.02, "min_model_prob": 0.55, "staking_strategy": "flat", "flat_stake_amount": 10.0, "initial_bankroll": 200.0, "combo_top_n": 3,
        }),
        # --- COMBIS 2-4 legs ---
        ("COMBO 2-4 legs, odds 1.8-3.0, prob>=55%", {
            "combo_mode": True, "combo_max_legs": 4, "combo_min_odds": 1.8, "combo_max_odds": 3.0,
            "min_edge": 0.02, "min_model_prob": 0.55, "staking_strategy": "flat", "flat_stake_amount": 10.0, "initial_bankroll": 200.0, "combo_top_n": 3,
        }),
    ]

    for strategy_name, kwargs in strategies:
        console.print(f"\n{'-' * 60}")
        console.print(f"[bold cyan]STRATEGY: {strategy_name}[/bold cyan]")
        console.print(f"{'-' * 60}")

        engine = BacktestEngine(**kwargs)
        backtest_result = engine.run(df, test_seasons)

        if not backtest_result["bets"]:
            console.print("[yellow]No bets placed.[/yellow]")
            continue

        report = metrics.compute_all(backtest_result["bets"], engine.initial_bankroll)
        print_report(report)

        # League breakdown
        console.print("\n[bold]BY LEAGUE[/bold]")
        bets_by_league = {}
        for b in backtest_result["bets"]:
            league = b.get("league", "unknown")
            if league not in bets_by_league:
                bets_by_league[league] = []
            bets_by_league[league].append(b)

        for league, league_bets in sorted(bets_by_league.items()):
            wins = sum(1 for b in league_bets if b["won"])
            total = len(league_bets)
            pnl = sum(b["pnl"] for b in league_bets)
            staked = sum(b["stake"] for b in league_bets)
            roi = (pnl / staked * 100) if staked > 0 else 0
            color = "green" if roi > 0 else "red"
            console.print(f"  {league}: {total} bets, {wins}/{total} W, ROI [{color}]{roi:+.1f}%[/{color}]")

    # --- Final production model: retrain on ALL data ---
    console.print("\n" + "=" * 60)
    console.print("[bold]PHASE 3: Production Model (train on ALL seasons)[/bold]")
    console.print("=" * 60)

    # Re-use the feature set determined during walk-forward (respects USE_CLEAN_FEATURES)
    active_feats = model.active_features
    X_all = df[active_feats].values
    y_all = df["ftr"].map(LABEL_MAP).values
    console.print(f"  Training on {len(X_all)} matches ({sorted(df['season'].unique())})")

    # Reserve 20% for isotonic calibration (no shuffle: keep chronological order)
    cal_start = int(len(X_all) * 0.80)
    X_train_full = X_all[:cal_start]
    y_train_full = y_all[:cal_start]
    X_cal = X_all[cal_start:]
    y_cal = y_all[cal_start:]
    console.print(f"  Train: {len(X_train_full)}, Calibration: {len(X_cal)}")

    model.train_with_calibration(X_train_full, y_train_full, X_cal, y_cal)
    console.print("  [green]Done (calibrated).[/green]")

    # Compute training medians for NaN imputation at inference time
    import numpy as np
    col_medians = np.nanmedian(X_train_full, axis=0).tolist()

    # --- Save model ---
    model_path = Path("models/football")
    model_path.mkdir(parents=True, exist_ok=True)
    model.save(model_path, {
        "features": active_feats,
        "col_medians": col_medians,
        "results": results["average"],
        "trained_on": "all_seasons",
        "n_samples": len(X_all),
    })
    console.print(f"\n[bold green]Production model saved to {model_path}[/bold green]")


if __name__ == "__main__":
    main()
