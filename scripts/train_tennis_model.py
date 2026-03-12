"""Train tennis ML model (production) and save to models/tennis/.

Steps:
  1. Load all tennis matches from DB
  2. Build features with TennisFeatureBuilder (chronological, no look-ahead)
  3. Walk-forward evaluation (2019-2023 train / 2024-2025 test) — for reporting
  4. Train production model on ALL available data
  5. Export player stats snapshot to models/tennis/player_stats.json
  6. Save model to models/tennis/model.joblib + metadata.json
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.backtest.tennis_engine import TRAIN_YEARS, TEST_YEARS
from src.database import SessionLocal
from src.features.tennis_features import TENNIS_FEATURE_COLUMNS, TennisFeatureBuilder
from src.ml.tennis_model import TennisModel
from src.models.tennis_match import TennisMatch

MODEL_DIR = Path("models/tennis")


def load_matches() -> pd.DataFrame:
    db = SessionLocal()
    try:
        rows = db.query(TennisMatch).order_by(TennisMatch.date).all()
        data = []
        for m in rows:
            data.append({
                "id": m.id,
                "date": m.date,
                "year": m.date.year if m.date else None,
                "tournament": m.tournament,
                "surface": m.surface,
                "series": m.series,
                "round": m.round,
                "best_of": m.best_of,
                "winner": m.winner,
                "loser": m.loser,
                "winner_rank": m.winner_rank,
                "loser_rank": m.loser_rank,
                "wsets": m.wsets,
                "lsets": m.lsets,
                "odds_winner": m.odds_winner,
                "odds_loser": m.odds_loser,
                "max_odds_winner": m.max_odds_winner,
                "max_odds_loser": m.max_odds_loser,
                "avg_odds_winner": m.avg_odds_winner,
                "avg_odds_loser": m.avg_odds_loser,
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
    print("Loading tennis matches from DB...")
    raw_df = load_matches()
    print(f"  Loaded {len(raw_df)} matches")

    print("Building tennis features (incremental, no look-ahead)...")
    builder = TennisFeatureBuilder(seed=42)

    # Build full dataset — also builds the player history caches we need for snapshot
    player_history: dict = defaultdict(list)
    player_surface_history: dict = defaultdict(lambda: defaultdict(list))

    # Rebuild caches manually so we have access to them after build_dataset
    matches_sorted = raw_df.sort_values("date").reset_index(drop=True)
    features_list = []

    _MIN_HISTORY = 5
    import random
    rng = random.Random(42)

    for idx, match in matches_sorted.iterrows():
        winner = match["winner"]
        loser = match["loser"]
        surface = match.get("surface") or "Unknown"

        if len(player_history[winner]) < _MIN_HISTORY or len(player_history[loser]) < _MIN_HISTORY:
            builder._update_caches(match, player_history, player_surface_history)
            continue

        if rng.random() < 0.5:
            p1, p2, target = winner, loser, 1
        else:
            p1, p2, target = loser, winner, 0

        features = builder._build_features(match, p1, p2, surface, player_history, player_surface_history)
        features["target"] = target
        features["date"] = match["date"]
        features["year"] = match.get("year")
        features["surface"] = surface
        features["series"] = match.get("series")
        if p1 == winner:
            features["_odds_p1"] = match.get("odds_winner")
            features["_odds_p2"] = match.get("odds_loser")
        else:
            features["_odds_p1"] = match.get("odds_loser")
            features["_odds_p2"] = match.get("odds_winner")

        features_list.append(features)
        builder._update_caches(match, player_history, player_surface_history)

    features_df = pd.DataFrame(features_list)
    print(f"  Built {len(features_df)} feature vectors")

    # Walk-forward evaluation
    print("\nWalk-forward evaluation (2019-2023 train / 2024-2025 test)...")
    train_df = features_df[features_df["year"].isin(TRAIN_YEARS)]
    test_df = features_df[features_df["year"].isin(TEST_YEARS)].sort_values("date")

    X_train = train_df[TENNIS_FEATURE_COLUMNS].values
    y_train = train_df["target"].values
    X_test = test_df[TENNIS_FEATURE_COLUMNS].values
    y_test = test_df["target"].values

    col_medians_train = np.nanmedian(X_train, axis=0)
    X_train_f = _nan_fill(X_train, col_medians_train)
    X_test_f = _nan_fill(X_test, col_medians_train)

    eval_model = TennisModel()
    eval_model.train(X_train_f, y_train)
    proba_test = eval_model.predict_proba(X_test_f)

    from sklearn.metrics import accuracy_score, log_loss, roc_auc_score
    proba_2d = np.column_stack([1 - proba_test, proba_test])
    preds = (proba_test >= 0.5).astype(int)
    acc = accuracy_score(y_test, preds)
    ll = log_loss(y_test, proba_2d)
    auc = roc_auc_score(y_test, proba_test)

    print(f"  Train: {len(X_train_f)} matches ({TRAIN_YEARS[0]}-{TRAIN_YEARS[-1]})")
    print(f"  Test: {len(X_test_f)} matches ({TEST_YEARS[0]}-{TEST_YEARS[-1]})")
    print(f"  Accuracy: {acc:.1%}")
    print(f"  Log loss: {ll:.4f}")
    print(f"  ROC AUC: {auc:.4f}")

    # Production model: train on ALL data
    print("\nTraining production model on ALL data...")
    X_all = features_df[TENNIS_FEATURE_COLUMNS].values
    y_all = features_df["target"].values
    col_medians_all = np.nanmedian(X_all, axis=0)
    X_all_f = _nan_fill(X_all, col_medians_all)

    prod_model = TennisModel()
    prod_model.train(X_all_f, y_all)

    metadata = {
        "n_matches": len(features_df),
        "n_train_eval": len(X_train_f),
        "n_test_eval": len(X_test_f),
        "accuracy": float(acc),
        "log_loss": float(ll),
        "roc_auc": float(auc),
        "col_medians": col_medians_all.tolist(),
        "feature_columns": TENNIS_FEATURE_COLUMNS,
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    prod_model.save(MODEL_DIR, metadata)
    print(f"  Model saved to {MODEL_DIR}/")

    # Export player stats snapshot
    print("Exporting player stats snapshot...")
    snapshot = builder.get_player_snapshot(player_history, player_surface_history)
    snapshot["col_medians"] = col_medians_all.tolist()
    snapshot["feature_columns"] = TENNIS_FEATURE_COLUMNS

    # Save NaN as null for JSON
    snapshot_path = MODEL_DIR / "player_stats.json"
    with open(snapshot_path, "w") as f:
        json.dump(snapshot, f, default=lambda x: None if (isinstance(x, float) and np.isnan(x)) else x)
    n_players = len(snapshot.get("players", {}))
    print(f"  Snapshot saved: {n_players} players -> {snapshot_path}")

    print("\nDone. Tennis production model ready.")
    print(f"  Accuracy: {acc:.1%} | AUC: {auc:.4f} | Log loss: {ll:.4f}")


if __name__ == "__main__":
    main()
