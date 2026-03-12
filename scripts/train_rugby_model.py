"""Train the rugby prediction model and save it to models/rugby/.

Usage:
    uv run python scripts/train_rugby_model.py

Prerequisites:
    - Rugby data must be collected first: uv run python -m src.data.rugby_collector
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score

from src.database import SessionLocal
from src.features.rugby_features import RUGBY_FEATURE_COLUMNS, RugbyFeatureBuilder
from src.ml.rugby_model import RugbyModel
from src.models.rugby_match import RugbyMatch

TRAIN_SEASONS = ["2019", "2020", "2021", "2022", "2023"]
TEST_SEASONS = ["2024", "2025"]
MODEL_DIR = Path("models/rugby")


def main():
    print("Loading rugby matches from DB...")
    db = SessionLocal()
    rows = db.query(RugbyMatch).filter(RugbyMatch.home_score.isnot(None)).all()
    db.close()

    if not rows:
        print("No rugby data found. Run the collector first:")
        print("  uv run python -m src.data.rugby_collector")
        sys.exit(1)

    print(f"Loaded {len(rows)} completed matches")

    df = pd.DataFrame([{
        "id": r.id,
        "match_date": r.match_date,
        "season": r.season,
        "league": r.league,
        "home_team": r.home_team,
        "away_team": r.away_team,
        "home_score": r.home_score,
        "away_score": r.away_score,
        "home_tries": r.home_tries,
        "away_tries": r.away_tries,
        "home_conversions": r.home_conversions,
        "away_conversions": r.away_conversions,
        "home_penalties": r.home_penalties,
        "away_penalties": r.away_penalties,
        "home_drop_goals": r.home_drop_goals,
        "away_drop_goals": r.away_drop_goals,
        "odds_home": r.odds_home,
        "odds_draw": r.odds_draw,
        "odds_away": r.odds_away,
        "total_line": r.total_line,
    } for r in rows])

    print(f"\nSeasons found: {sorted(df['season'].unique())}")
    print(f"Leagues: {sorted(df['league'].unique())}")

    print("\nBuilding features (walk-forward, no look-ahead bias)...")
    builder = RugbyFeatureBuilder()
    features_df = builder.build_dataset(df, progress=True)

    if features_df.empty:
        print("No features built. Not enough historical data.")
        sys.exit(1)

    train_df = features_df[features_df["season"].isin(TRAIN_SEASONS)]
    test_df = features_df[features_df["season"].isin(TEST_SEASONS)].sort_values("match_date")

    print(f"\nTrain: {len(train_df)} matches ({TRAIN_SEASONS[0]}-{TRAIN_SEASONS[-1]})")
    print(f"Test:  {len(test_df)} matches ({TEST_SEASONS[0]}-{TEST_SEASONS[-1]})")

    if train_df.empty or len(train_df) < 100:
        print("Not enough training data.")
        sys.exit(1)

    X_train = train_df[RUGBY_FEATURE_COLUMNS].values
    y_train = train_df["target"].values

    col_medians = np.nanmedian(X_train, axis=0)
    for col_idx in range(X_train.shape[1]):
        X_train[:, col_idx] = np.where(np.isnan(X_train[:, col_idx]), col_medians[col_idx], X_train[:, col_idx])

    print(f"\nTraining RugbyModel (XGBoost 70% + LightGBM 30%)...")
    model = RugbyModel()
    model.train(X_train, y_train)
    print("Training complete.")

    if not test_df.empty:
        X_test = test_df[RUGBY_FEATURE_COLUMNS].values
        y_test = test_df["target"].values
        for col_idx in range(X_test.shape[1]):
            X_test[:, col_idx] = np.where(np.isnan(X_test[:, col_idx]), col_medians[col_idx], X_test[:, col_idx])

        probas = model.predict_proba(X_test)
        preds = (probas >= 0.5).astype(int)

        acc = accuracy_score(y_test, preds)
        auc = roc_auc_score(y_test, probas)
        ll = log_loss(y_test, np.column_stack([1 - probas, probas]))

        print(f"\n=== Test Results ({TEST_SEASONS[0]}-{TEST_SEASONS[-1]}) ===")
        print(f"  Accuracy : {acc:.4f} ({acc*100:.1f}%)")
        print(f"  AUC-ROC  : {auc:.4f}")
        print(f"  Log Loss : {ll:.4f}")
    else:
        acc, auc, ll = 0.0, 0.0, 0.0
        print("No test data available for evaluation.")

    metadata = {
        "sport": "rugby",
        "train_seasons": TRAIN_SEASONS,
        "test_seasons": TEST_SEASONS,
        "feature_columns": RUGBY_FEATURE_COLUMNS,
        "accuracy": round(acc, 4),
        "auc": round(auc, 4),
        "log_loss": round(ll, 4),
        "col_medians": col_medians.tolist(),
        "n_train": len(train_df),
        "n_test": len(test_df),
    }

    # Build team stats snapshot: rebuild history from scratch using a fresh builder
    # (separate from training builder to avoid state contamination from walk-forward)
    print("\nBuilding team stats snapshot for live prediction...")
    from collections import defaultdict
    snapshot_builder = RugbyFeatureBuilder()
    team_history_snap: dict = defaultdict(list)
    games_sorted = df.sort_values("match_date").reset_index(drop=True)
    for _, game in games_sorted.iterrows():
        snapshot_builder._update_cache(game, team_history_snap)

    team_snapshot = snapshot_builder.get_team_snapshot(dict(team_history_snap))

    model.save(MODEL_DIR, metadata)
    with open(MODEL_DIR / "team_stats.json", "w") as f:
        json.dump({
            **team_snapshot,
            "col_medians": col_medians.tolist(),
        }, f, indent=2)

    print(f"\nModel saved to {MODEL_DIR}/")
    print(f"  model.joblib, metadata.json, team_stats.json")
    print(f"\nAccuracy: {acc*100:.1f}%, AUC: {auc:.3f}, Log Loss: {ll:.4f}")


if __name__ == "__main__":
    main()
