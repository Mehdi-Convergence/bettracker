"""Feature importance analysis: identify useful vs harmful features."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from rich.console import Console
from rich.table import Table
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, log_loss

from src.ml.football_model import FootballModel, MODEL_FEATURES, LABEL_MAP

console = Console()


def main():
    features_path = Path("data/processed/football_features.parquet")
    if not features_path.exists():
        console.print("[red]Features not found. Run build_features.py first.[/red]")
        sys.exit(1)

    df = pd.read_parquet(features_path)
    console.print(f"Loaded {len(df)} matches, {len(MODEL_FEATURES)} features")

    # Train on first 3 seasons, analyze on last 2 (same as backtest)
    all_seasons = sorted(df["season"].unique())
    train_seasons = all_seasons[:3]
    test_seasons = all_seasons[3:]

    train_df = df[df["season"].isin(train_seasons)]
    test_df = df[df["season"].isin(test_seasons)]

    X_train = train_df[MODEL_FEATURES].values
    y_train = train_df["ftr"].map(LABEL_MAP).values
    X_test = test_df[MODEL_FEATURES].values
    y_test = test_df["ftr"].map(LABEL_MAP).values

    console.print(f"Train: {len(X_train)} ({train_seasons})")
    console.print(f"Test: {len(X_test)} ({test_seasons})")

    # Train model
    model = FootballModel()
    model.train(X_train, y_train)

    # Baseline metrics
    proba_full = model.predict_proba(X_test)
    acc_full = accuracy_score(y_test, proba_full.argmax(axis=1))
    ll_full = log_loss(y_test, proba_full)
    console.print(f"\nBaseline: accuracy={acc_full:.4f}, log_loss={ll_full:.4f}")

    # --- 1. XGBoost built-in feature importance (gain) ---
    console.print("\n" + "=" * 70)
    console.print("[bold]1. XGBOOST FEATURE IMPORTANCE (gain-based)[/bold]")
    console.print("=" * 70)

    importances = model.base_model.feature_importances_
    order = np.argsort(-importances)

    table = Table(title="XGBoost Gain Importance")
    table.add_column("Rank", justify="right", style="dim")
    table.add_column("Feature", style="bold")
    table.add_column("Importance", justify="right", style="cyan")
    table.add_column("% of Total", justify="right")

    total_imp = importances.sum()
    for rank, idx in enumerate(order, 1):
        pct = importances[idx] / total_imp * 100
        table.add_row(
            str(rank),
            MODEL_FEATURES[idx],
            f"{importances[idx]:.4f}",
            f"{pct:.1f}%",
        )

    console.print(table)

    # --- 2. Permutation importance (gold standard) ---
    console.print("\n" + "=" * 70)
    console.print("[bold]2. PERMUTATION IMPORTANCE (accuracy-based, 10 repeats)[/bold]")
    console.print("=" * 70)

    perm_result = permutation_importance(
        model.base_model, X_test, y_test,
        n_repeats=10, scoring="accuracy", random_state=42, n_jobs=-1,
    )

    perm_order = np.argsort(-perm_result.importances_mean)

    table = Table(title="Permutation Importance (test set)")
    table.add_column("Rank", justify="right", style="dim")
    table.add_column("Feature", style="bold")
    table.add_column("Acc Drop", justify="right", style="cyan")
    table.add_column("+/- Std", justify="right", style="dim")
    table.add_column("Verdict", justify="center")

    harmful_features = []
    useless_features = []
    for rank, idx in enumerate(perm_order, 1):
        mean_drop = perm_result.importances_mean[idx]
        std = perm_result.importances_std[idx]

        if mean_drop < -0.001:
            verdict = "[red]HARMFUL[/red]"
            harmful_features.append(MODEL_FEATURES[idx])
        elif mean_drop < 0.001:
            verdict = "[yellow]NOISE[/yellow]"
            useless_features.append(MODEL_FEATURES[idx])
        else:
            verdict = "[green]USEFUL[/green]"

        table.add_row(
            str(rank),
            MODEL_FEATURES[idx],
            f"{mean_drop:+.4f}",
            f"{std:.4f}",
            verdict,
        )

    console.print(table)

    # --- 3. Summary ---
    console.print("\n" + "=" * 70)
    console.print("[bold]3. SUMMARY[/bold]")
    console.print("=" * 70)

    if harmful_features:
        console.print(f"\n[red bold]HARMFUL features ({len(harmful_features)}):[/red bold]")
        console.print("Shuffling these IMPROVES accuracy = they confuse the model")
        for f in harmful_features:
            console.print(f"  - {f}")

    if useless_features:
        console.print(f"\n[yellow bold]NOISE features ({len(useless_features)}):[/yellow bold]")
        console.print("Shuffling these has no effect = model ignores them anyway")
        for f in useless_features:
            console.print(f"  - {f}")

    remove_candidates = harmful_features + useless_features

    # --- 4. Ablation test ---
    if remove_candidates:
        console.print("\n" + "=" * 70)
        console.print("[bold]4. ABLATION TEST: remove harmful + noise features[/bold]")
        console.print("=" * 70)

        keep_idx = [i for i, f in enumerate(MODEL_FEATURES) if f not in remove_candidates]
        keep_names = [MODEL_FEATURES[i] for i in keep_idx]

        X_train_clean = X_train[:, keep_idx]
        X_test_clean = X_test[:, keep_idx]

        model_clean = FootballModel()
        model_clean.train(X_train_clean, y_train)
        proba_clean = model_clean.predict_proba(X_test_clean)
        acc_clean = accuracy_score(y_test, proba_clean.argmax(axis=1))
        ll_clean = log_loss(y_test, proba_clean)

        diff_acc = acc_clean - acc_full
        diff_ll = ll_clean - ll_full

        console.print(f"Full model  ({len(MODEL_FEATURES)} feat): acc={acc_full:.4f}, log_loss={ll_full:.4f}")
        console.print(f"Clean model ({len(keep_names)} feat): acc={acc_clean:.4f}, log_loss={ll_clean:.4f}")

        color_acc = "green" if diff_acc > 0 else "red"
        color_ll = "green" if diff_ll < 0 else "red"
        console.print(f"  Accuracy: [{color_acc}]{diff_acc:+.4f}[/{color_acc}]")
        console.print(f"  Log loss: [{color_ll}]{diff_ll:+.4f}[/{color_ll}]")

        if diff_ll < -0.001:
            console.print("\n[bold green]REMOVING features IMPROVES the model![/bold green]")
            console.print(f"Remove: {remove_candidates}")
            console.print(f"Keep: {keep_names}")
        elif diff_ll > 0.001:
            console.print("\n[yellow]Removing hurts slightly. Try removing only HARMFUL ones.[/yellow]")

            if harmful_features:
                keep_idx2 = [i for i, f in enumerate(MODEL_FEATURES) if f not in harmful_features]
                keep_names2 = [MODEL_FEATURES[i] for i in keep_idx2]
                X_train_h = X_train[:, keep_idx2]
                X_test_h = X_test[:, keep_idx2]

                model_h = FootballModel()
                model_h.train(X_train_h, y_train)
                proba_h = model_h.predict_proba(X_test_h)
                acc_h = accuracy_score(y_test, proba_h.argmax(axis=1))
                ll_h = log_loss(y_test, proba_h)

                console.print(f"Harmful-only removal ({len(keep_names2)} feat): acc={acc_h:.4f}, log_loss={ll_h:.4f}")
                console.print(f"  Accuracy: {acc_h - acc_full:+.4f}")
                console.print(f"  Log loss: {ll_h - ll_full:+.4f}")
        else:
            console.print("\n[bold]Negligible difference. Noise features are harmless.[/bold]")

    console.print("\n[bold]Done![/bold]")


if __name__ == "__main__":
    main()
