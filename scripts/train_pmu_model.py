"""Train PMU win and place models (production) and save to models/pmu/.

Steps:
  1. Load all races + runners from DB (pmu_races + pmu_runners)
  2. Filter scratched runners and races without results
  3. Build features via PMUFeatureBuilder (chronological, no look-ahead)
  4. Train/test split: first 80% chronological -> train, last 20% -> test
  5. Train PMUWinModel and PMUPlaceModel with isotonic calibration
  6. Display evaluation metrics (log_loss, AUC, accuracy, calibration)
  7. Save models to models/pmu/win_model/ and models/pmu/place_model/
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.database import SessionLocal
from src.features.pmu_features import PMU_FEATURE_COLUMNS, PMUFeatureBuilder
from src.ml.pmu_model import MODEL_DIR_PLACE, MODEL_DIR_WIN, PMUPlaceModel, PMUWinModel
from src.models.pmu_race import PMURace, PMURunner


# ------------------------------------------------------------------
# Data loading
# ------------------------------------------------------------------

def load_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load races and runners from DB, return as DataFrames."""
    db = SessionLocal()
    try:
        races_rows = db.query(PMURace).order_by(PMURace.race_date).all()
        races_data = []
        for r in races_rows:
            races_data.append({
                "id": r.id,
                "race_id": r.race_id,
                "race_date": r.race_date,
                "hippodrome": r.hippodrome,
                "race_number": r.race_number,
                "race_type": r.race_type,
                "distance": r.distance,
                "terrain": r.terrain,
                "prize_pool": r.prize_pool,
                "num_runners": r.num_runners,
                "is_quinteplus": r.is_quinteplus,
            })

        runners_rows = db.query(PMURunner).all()
        runners_data = []
        for rn in runners_rows:
            # Parse last_5_positions JSON
            last5 = None
            if rn.last_5_positions:
                try:
                    import json as _json
                    last5 = _json.loads(rn.last_5_positions)
                except Exception:
                    pass
            runners_data.append({
                "race_id": rn.race_id,
                "number": rn.number,
                "horse_name": rn.horse_name,
                "jockey_name": rn.jockey_name,
                "trainer_name": rn.trainer_name,
                "age": rn.age,
                "weight": rn.weight,
                "odds_final": rn.odds_final,
                "odds_morning": rn.odds_morning,
                "finish_position": rn.finish_position,
                "is_scratched": rn.is_scratched,
                "last_5_positions": last5,
            })
    finally:
        db.close()

    return pd.DataFrame(races_data), pd.DataFrame(runners_data)


# ------------------------------------------------------------------
# NaN imputation
# ------------------------------------------------------------------

def _fill_nan(X: np.ndarray, medians: np.ndarray) -> np.ndarray:
    out = X.copy().astype(float)
    for col_idx in range(X.shape[1]):
        mask = np.isnan(out[:, col_idx])
        out[mask, col_idx] = medians[col_idx]
    return out


# ------------------------------------------------------------------
# Evaluation helper
# ------------------------------------------------------------------

def _evaluate(y_true: np.ndarray, proba: np.ndarray, label: str) -> None:
    from sklearn.metrics import (
        accuracy_score,
        brier_score_loss,
        log_loss,
        roc_auc_score,
    )

    pred = (proba >= 0.5).astype(int)
    proba_2d = np.column_stack([1 - proba, proba])
    acc = accuracy_score(y_true, pred)
    ll = log_loss(y_true, proba_2d)
    auc = roc_auc_score(y_true, proba)
    brier = brier_score_loss(y_true, proba)
    pos_rate = float(y_true.mean())

    print(f"\n  [{label}]")
    print(f"    Samples: {len(y_true)}  (positive rate: {pos_rate:.1%})")
    print(f"    Accuracy : {acc:.1%}")
    print(f"    Log loss : {ll:.4f}")
    print(f"    ROC AUC  : {auc:.4f}")
    print(f"    Brier    : {brier:.4f}")
    print(f"    Mean P   : {proba.mean():.4f}  (min {proba.min():.4f} / max {proba.max():.4f})")


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main() -> None:
    print("Loading PMU races and runners from DB...")
    races_df, runners_df = load_data()
    print(f"  Races  : {len(races_df)}")
    print(f"  Runners: {len(runners_df)}")

    if races_df.empty or runners_df.empty:
        print("No data found. Make sure pmu_races and pmu_runners tables are populated.")
        return

    # Filter runners with a known result (finish_position not null) and not scratched
    runners_with_result = runners_df[
        runners_df["finish_position"].notna() & ~runners_df["is_scratched"]
    ].copy()
    print(f"  Runners with result (not scratched): {len(runners_with_result)}")

    print("\nBuilding PMU features (incremental, no look-ahead)...")
    builder = PMUFeatureBuilder()
    features_df = builder.build_dataset(races_df, runners_with_result, progress=True)
    print(f"  Feature vectors built: {len(features_df)}")

    if len(features_df) < 200:
        print("Not enough feature vectors to train. Aborting.")
        return

    # Chronological train / test split (80% / 20%)
    features_df = features_df.sort_values("race_date").reset_index(drop=True)
    split_idx = int(len(features_df) * 0.80)
    train_df = features_df.iloc[:split_idx]
    test_df = features_df.iloc[split_idx:]

    train_dates = (str(train_df["race_date"].min()), str(train_df["race_date"].max()))
    test_dates = (str(test_df["race_date"].min()), str(test_df["race_date"].max()))
    print(f"\n  Train : {len(train_df)} rows  ({train_dates[0]} -> {train_dates[1]})")
    print(f"  Test  : {len(test_df)} rows  ({test_dates[0]} -> {test_dates[1]})")

    X_train_raw = train_df[PMU_FEATURE_COLUMNS].values.astype(float)
    X_test_raw = test_df[PMU_FEATURE_COLUMNS].values.astype(float)

    col_medians_train = np.nanmedian(X_train_raw, axis=0)
    X_train = _fill_nan(X_train_raw, col_medians_train)
    X_test = _fill_nan(X_test_raw, col_medians_train)

    y_win_train = train_df["target_win"].values
    y_win_test = test_df["target_win"].values
    y_place_train = train_df["target_place"].values
    y_place_test = test_df["target_place"].values

    # ------------------------------------------------------------------
    # Win model
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("Training PMUWinModel (P(horse wins))...")
    print("=" * 60)

    # Calibration split: last 20% of train set (chronological)
    cal_idx = int(len(X_train) * 0.80)
    X_tr, X_cal = X_train[:cal_idx], X_train[cal_idx:]
    y_win_tr, y_win_cal = y_win_train[:cal_idx], y_win_train[cal_idx:]

    # Compute scale_pos_weight from actual data
    win_ratio = float(y_win_train.mean())
    win_spw = (1.0 - win_ratio) / win_ratio if win_ratio > 0 else _WIN_SCALE_POS_WEIGHT
    print(f"  Positive rate (win) : {win_ratio:.1%}  ->  scale_pos_weight = {win_spw:.1f}")

    win_model = PMUWinModel(scale_pos_weight=win_spw)
    win_model.train_with_calibration(X_tr, y_win_tr, X_cal, y_win_cal)

    p_win_test = win_model.predict_proba(X_test)
    _evaluate(y_win_test, p_win_test, "Win model — TEST")

    # ------------------------------------------------------------------
    # Place model
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("Training PMUPlaceModel (P(horse in top-3))...")
    print("=" * 60)

    place_ratio = float(y_place_train.mean())
    place_spw = (1.0 - place_ratio) / place_ratio if place_ratio > 0 else _PLACE_SCALE_POS_WEIGHT
    print(f"  Positive rate (place): {place_ratio:.1%}  ->  scale_pos_weight = {place_spw:.1f}")

    y_place_tr, y_place_cal = y_place_train[:cal_idx], y_place_train[cal_idx:]

    place_model = PMUPlaceModel(scale_pos_weight=place_spw)
    place_model.train_with_calibration(X_tr, y_place_tr, X_cal, y_place_cal)

    p_place_test = place_model.predict_proba(X_test)
    _evaluate(y_place_test, p_place_test, "Place model — TEST")

    # ------------------------------------------------------------------
    # ROI Backtest on test set
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("ROI Backtest (test set)...")
    print("=" * 60)

    # Normalize probas per race in test set
    test_race_ids = test_df["race_id"].values
    p_win_norm = p_win_test.copy()
    for rid in np.unique(test_race_ids):
        mask = test_race_ids == rid
        total = p_win_norm[mask].sum()
        if total > 0:
            p_win_norm[mask] = p_win_norm[mask] / total

    test_odds = test_df["_odds_final"].values
    PMU_COMMISSION = 0.15  # PMU takes ~15% on simple bets

    # Strategy: bet on horses where model_prob > implied_prob (positive edge)
    for min_edge in [0.0, 0.02, 0.05, 0.10]:
        pnl = 0.0
        n_bets = 0
        n_wins = 0
        stakes = 0.0
        for i in range(len(p_win_norm)):
            odds = test_odds[i]
            if odds is None or np.isnan(odds) or odds <= 1.0:
                continue
            implied = 1.0 / odds
            edge = p_win_norm[i] - implied
            if edge >= min_edge:
                n_bets += 1
                stakes += 1.0  # flat 1 unit
                if y_win_test[i] == 1:
                    n_wins += 1
                    pnl += (odds * (1 - PMU_COMMISSION)) - 1.0
                else:
                    pnl -= 1.0

        roi = (pnl / stakes * 100) if stakes > 0 else 0
        win_rate = (n_wins / n_bets * 100) if n_bets > 0 else 0
        print(f"  Edge >= {min_edge*100:.0f}%: {n_bets} bets, {n_wins} wins ({win_rate:.1f}%), PnL={pnl:+.1f}u, ROI={roi:+.1f}%")

    # ------------------------------------------------------------------
    # Production models: train on ALL data
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("Training production models on ALL data...")
    print("=" * 60)

    X_all_raw = features_df[PMU_FEATURE_COLUMNS].values.astype(float)
    col_medians_all = np.nanmedian(X_all_raw, axis=0)
    X_all = _fill_nan(X_all_raw, col_medians_all)
    y_win_all = features_df["target_win"].values
    y_place_all = features_df["target_place"].values

    # Calibration: last 20% of full dataset (chronological)
    cal_all_idx = int(len(X_all) * 0.80)
    X_all_tr, X_all_cal = X_all[:cal_all_idx], X_all[cal_all_idx:]
    y_win_all_tr, y_win_all_cal = y_win_all[:cal_all_idx], y_win_all[cal_all_idx:]
    y_place_all_tr, y_place_all_cal = y_place_all[:cal_all_idx], y_place_all[cal_all_idx:]

    win_ratio_all = float(y_win_all.mean())
    win_spw_all = (1.0 - win_ratio_all) / win_ratio_all if win_ratio_all > 0 else 11.0
    place_ratio_all = float(y_place_all.mean())
    place_spw_all = (1.0 - place_ratio_all) / place_ratio_all if place_ratio_all > 0 else 3.0

    prod_win = PMUWinModel(scale_pos_weight=win_spw_all)
    prod_win.train_with_calibration(X_all_tr, y_win_all_tr, X_all_cal, y_win_all_cal)

    prod_place = PMUPlaceModel(scale_pos_weight=place_spw_all)
    prod_place.train_with_calibration(X_all_tr, y_place_all_tr, X_all_cal, y_place_all_cal)

    # Build metadata
    from sklearn.metrics import log_loss, roc_auc_score

    p_win_test_2d = np.column_stack([1 - p_win_test, p_win_test])
    p_place_test_2d = np.column_stack([1 - p_place_test, p_place_test])

    # Compute ROI for metadata (edge >= 0.02 strategy)
    _roi_pnl = 0.0
    _roi_bets = 0
    _roi_wins = 0
    for i in range(len(p_win_norm)):
        odds = test_odds[i]
        if odds is None or np.isnan(odds) or odds <= 1.0:
            continue
        implied = 1.0 / odds
        if (p_win_norm[i] - implied) >= 0.02:
            _roi_bets += 1
            if y_win_test[i] == 1:
                _roi_wins += 1
                _roi_pnl += (odds * 0.85) - 1.0
            else:
                _roi_pnl -= 1.0

    win_metadata = {
        "model": "PMUWinModel",
        "n_total": len(features_df),
        "n_train_eval": len(X_train),
        "n_test_eval": len(X_test),
        "win_positive_rate": float(win_ratio),
        "scale_pos_weight": float(win_spw_all),
        "log_loss": float(log_loss(y_win_test, p_win_test_2d)),
        "roc_auc": float(roc_auc_score(y_win_test, p_win_test)),
        "backtest_roi_pct": round(_roi_pnl / max(_roi_bets, 1) * 100, 2),
        "backtest_n_bets": _roi_bets,
        "backtest_win_rate_pct": round(_roi_wins / max(_roi_bets, 1) * 100, 2),
        "backtest_pnl_units": round(_roi_pnl, 2),
        "col_medians": col_medians_all.tolist(),
        "feature_columns": PMU_FEATURE_COLUMNS,
        "train_date_min": train_dates[0],
        "train_date_max": train_dates[1],
        "test_date_min": test_dates[0],
        "test_date_max": test_dates[1],
    }
    place_metadata = {
        "model": "PMUPlaceModel",
        "n_total": len(features_df),
        "n_train_eval": len(X_train),
        "n_test_eval": len(X_test),
        "place_positive_rate": float(place_ratio),
        "scale_pos_weight": float(place_spw_all),
        "log_loss": float(log_loss(y_place_test, p_place_test_2d)),
        "roc_auc": float(roc_auc_score(y_place_test, p_place_test)),
        "col_medians": col_medians_all.tolist(),
        "feature_columns": PMU_FEATURE_COLUMNS,
        "train_date_min": train_dates[0],
        "train_date_max": train_dates[1],
        "test_date_min": test_dates[0],
        "test_date_max": test_dates[1],
    }

    # Save
    MODEL_DIR_WIN.mkdir(parents=True, exist_ok=True)
    MODEL_DIR_PLACE.mkdir(parents=True, exist_ok=True)

    prod_win.save(MODEL_DIR_WIN, win_metadata)
    prod_place.save(MODEL_DIR_PLACE, place_metadata)

    print(f"\n  Win model   -> {MODEL_DIR_WIN}/")
    print(f"  Place model -> {MODEL_DIR_PLACE}/")

    print("\n" + "=" * 60)
    print("PMU models trained and saved.")
    print(f"  Win   : log_loss={win_metadata['log_loss']:.4f}  AUC={win_metadata['roc_auc']:.4f}")
    print(f"  Place : log_loss={place_metadata['log_loss']:.4f}  AUC={place_metadata['roc_auc']:.4f}")
    print("=" * 60)


# Constant used locally — avoid importing from model at module level
_WIN_SCALE_POS_WEIGHT = 11.0
_PLACE_SCALE_POS_WEIGHT = 3.0


if __name__ == "__main__":
    main()
