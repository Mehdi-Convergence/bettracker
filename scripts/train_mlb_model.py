"""Train MLB ML model (production) and save to models/mlb/.

Steps:
  1. Load all MLB games from DB
  2. Build features with MLBFeatureBuilder (chronological, no look-ahead)
  3. Walk-forward evaluation (2019-2022 train / 2023-2025 test)
  4. Train production model on ALL data
  5. Export team stats snapshot to models/mlb/team_stats.json
  6. Save model to models/mlb/model.joblib + metadata.json
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.database import SessionLocal
from src.features.mlb_features import MLB_FEATURE_COLUMNS, MLBFeatureBuilder
from src.ml.mlb_model import MLBModel
from src.models.mlb_game import MLBGame

MODEL_DIR = Path("models/mlb")

TRAIN_SEASONS = ["2019", "2020", "2021", "2022"]
TEST_SEASONS = ["2023", "2024", "2025"]


def load_games() -> pd.DataFrame:
    db = SessionLocal()
    try:
        rows = db.query(MLBGame).order_by(MLBGame.game_date).all()
        data = []
        for g in rows:
            data.append({
                "id": g.id,
                "game_id": g.game_id,
                "game_date": g.game_date,
                "season": g.season,
                "home_team": g.home_team,
                "away_team": g.away_team,
                "home_score": g.home_score,
                "away_score": g.away_score,
                "home_hits": g.home_hits,
                "away_hits": g.away_hits,
                "home_errors": g.home_errors,
                "away_errors": g.away_errors,
                "innings": g.innings,
                "odds_home": g.odds_home,
                "odds_away": g.odds_away,
                "odds_over": g.odds_over,
                "odds_under": g.odds_under,
                "total_line": g.total_line,
            })
        return pd.DataFrame(data)
    finally:
        db.close()


def _nan_fill(X: np.ndarray, medians: np.ndarray) -> np.ndarray:
    out = X.copy()
    for col_idx in range(X.shape[1]):
        out[:, col_idx] = np.where(np.isnan(out[:, col_idx]), medians[col_idx], out[:, col_idx])
    return out


def main():
    print("Loading MLB games from DB...")
    raw_df = load_games()
    print(f"  Loaded {len(raw_df)} games")

    # Filter: only games with both scores (exclude future/incomplete games)
    raw_df = raw_df[raw_df["home_score"].notna() & raw_df["away_score"].notna()].copy()
    print(f"  Complete games: {len(raw_df)}")

    if raw_df.empty:
        print("ERROR: no games found. Run mlb_collector first.")
        sys.exit(1)

    print("Building MLB features (incremental, no look-ahead)...")
    builder = MLBFeatureBuilder()
    features_df = builder.build_dataset(raw_df, progress=True)
    print(f"  Built {len(features_df)} feature vectors")

    if features_df.empty:
        print("ERROR: no features built. Run mlb_collector first.")
        sys.exit(1)

    # Walk-forward evaluation
    print(f"\nWalk-forward evaluation ({TRAIN_SEASONS[0]}-{TRAIN_SEASONS[-1]} train / {TEST_SEASONS[0]}-{TEST_SEASONS[-1]} test)...")
    train_df = features_df[features_df["season"].isin(TRAIN_SEASONS)]
    test_df = features_df[features_df["season"].isin(TEST_SEASONS)].sort_values("game_date")

    if train_df.empty or test_df.empty:
        print("ERROR: not enough data for train/test split.")
        sys.exit(1)

    X_train = train_df[MLB_FEATURE_COLUMNS].values
    y_train = train_df["target"].values
    X_test = test_df[MLB_FEATURE_COLUMNS].values
    y_test = test_df["target"].values

    col_medians_train = np.nanmedian(X_train, axis=0)
    X_train_f = _nan_fill(X_train, col_medians_train)
    X_test_f = _nan_fill(X_test, col_medians_train)

    eval_model = MLBModel()
    eval_model.train(X_train_f, y_train)
    proba_test = eval_model.predict_proba(X_test_f)

    from sklearn.metrics import accuracy_score, log_loss, roc_auc_score

    proba_2d = np.column_stack([1 - proba_test, proba_test])
    preds = (proba_test >= 0.5).astype(int)
    acc = accuracy_score(y_test, preds)
    ll = log_loss(y_test, proba_2d)
    auc = roc_auc_score(y_test, proba_test)

    print(f"  Train: {len(X_train_f)} games ({TRAIN_SEASONS[0]}-{TRAIN_SEASONS[-1]})")
    print(f"  Test:  {len(X_test_f)} games ({TEST_SEASONS[0]}-{TEST_SEASONS[-1]})")
    print(f"  Accuracy: {acc:.1%}")
    print(f"  Log loss: {ll:.4f}")
    print(f"  ROC AUC:  {auc:.4f}")

    # Production model: train on ALL data
    print("\nTraining production model on ALL data...")
    X_all = features_df[MLB_FEATURE_COLUMNS].values
    y_all = features_df["target"].values
    col_medians_all = np.nanmedian(X_all, axis=0)
    X_all_f = _nan_fill(X_all, col_medians_all)

    prod_model = MLBModel()
    prod_model.train(X_all_f, y_all)

    metadata = {
        "sport": "mlb",
        "train_seasons": TRAIN_SEASONS,
        "test_seasons": TEST_SEASONS,
        "n_games": len(features_df),
        "n_train_eval": len(X_train_f),
        "n_test_eval": len(X_test_f),
        "accuracy": float(acc),
        "log_loss": float(ll),
        "roc_auc": float(auc),
        "col_medians": col_medians_all.tolist(),
        "feature_columns": MLB_FEATURE_COLUMNS,
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    prod_model.save(MODEL_DIR, metadata)
    print(f"  Model saved to {MODEL_DIR}/")

    # Export team stats snapshot
    print("Exporting team stats snapshot...")
    # Rebuild caches to get current state
    builder2 = MLBFeatureBuilder()
    team_history: dict = defaultdict(list)
    games_sorted = raw_df.sort_values("game_date").reset_index(drop=True)
    for _, game in games_sorted.iterrows():
        builder2._update_cache(game, team_history)

    snapshot = builder2.get_team_snapshot(team_history)
    snapshot["col_medians"] = col_medians_all.tolist()
    snapshot["feature_columns"] = MLB_FEATURE_COLUMNS

    snapshot_path = MODEL_DIR / "team_stats.json"
    with open(snapshot_path, "w") as f:
        json.dump(
            snapshot,
            f,
            default=lambda x: None if (isinstance(x, float) and np.isnan(x)) else x,
        )

    n_teams = len(snapshot.get("teams", {}))
    print(f"  Snapshot saved: {n_teams} teams -> {snapshot_path}")

    print("\nDone. MLB production model ready.")
    print(f"  Accuracy: {acc:.1%} | AUC: {auc:.4f} | Log loss: {ll:.4f}")


if __name__ == "__main__":
    main()
