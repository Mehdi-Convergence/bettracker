"""Calibration diagnostic: reliability curve + key metrics for the XGBoost model."""
import os, sys, warnings
os.environ["PYTHONIOENCODING"] = "utf-8"
warnings.filterwarnings("ignore")
sys.path.insert(0, "C:/Users/MehdiBouziane/bettracker")

import numpy as np
import pandas as pd
from src.ml.football_model import FootballModel, MODEL_FEATURES, LABEL_MAP

df = pd.read_parquet("C:/Users/MehdiBouziane/bettracker/data/processed/football_features.parquet")
all_seasons = sorted(df["season"].unique())
test_seasons = [s for i, s in enumerate(all_seasons) if i >= 2]
print(f"Seasons: {all_seasons}")
print(f"Test seasons: {test_seasons}\n")

model = FootballModel()
all_probs = []   # [model_prob_home, model_prob_draw, model_prob_away]
all_results = [] # actual outcome index (0=H, 1=D, 2=A)

for test_season in test_seasons:
    train_seasons = [s for s in all_seasons if s < test_season]
    train_df = df[df["season"].isin(train_seasons)]
    test_df = df[df["season"] == test_season].sort_values("date")

    X_train = train_df[MODEL_FEATURES].values
    y_train = train_df["ftr"].map(LABEL_MAP).values
    X_test = test_df[MODEL_FEATURES].values
    y_test = test_df["ftr"].map(LABEL_MAP).values

    model.train(X_train, y_train)
    probas = model.predict_proba(X_test)

    all_probs.append(probas)
    all_results.append(y_test)

probs = np.vstack(all_probs)
results = np.concatenate(all_results)

print(f"Total predictions: {len(probs)}")
print(f"Distribution: H={((results==0).sum())} ({(results==0).mean():.1%}), "
      f"D={((results==1).sum())} ({(results==1).mean():.1%}), "
      f"A={((results==2).sum())} ({(results==2).mean():.1%})")

# --- Reliability curve per class ---
def reliability_curve(probs_cls, actual_cls, n_bins=10):
    bins = np.linspace(0, 1, n_bins + 1)
    rows = []
    for i in range(n_bins):
        lo, hi = bins[i], bins[i+1]
        mask = (probs_cls >= lo) & (probs_cls < hi)
        if mask.sum() < 10:
            continue
        avg_pred = probs_cls[mask].mean()
        actual_freq = actual_cls[mask].mean()
        rows.append({
            "bin": f"{lo:.1f}-{hi:.1f}",
            "n": mask.sum(),
            "pred_prob": round(avg_pred, 3),
            "actual_freq": round(actual_freq, 3),
            "bias": round(actual_freq - avg_pred, 3),
        })
    return rows

labels = ["Home (H)", "Draw (D)", "Away (A)"]
for cls_idx, label in enumerate(labels):
    cls_probs = probs[:, cls_idx]
    cls_actual = (results == cls_idx).astype(float)
    rows = reliability_curve(cls_probs, cls_actual)
    print(f"\n=== Calibration {label} ===")
    print(f"{'Bin':<12} {'N':>5} {'Pred%':>7} {'Actual%':>8} {'Bias':>7}")
    print("-" * 45)
    for r in rows:
        bias_str = f"{r['bias']:+.3f}"
        flag = " <-- SURSTIME" if r['bias'] < -0.05 else (" <-- SOUSESTIME" if r['bias'] > 0.05 else "")
        print(f"{r['bin']:<12} {r['n']:>5} {r['pred_prob']:>7.3f} {r['actual_freq']:>8.3f} {bias_str:>7}{flag}")

# --- Key summary stats ---
print("\n=== BRIER SCORE (lower=better, random=0.25) ===")
from sklearn.metrics import brier_score_loss, log_loss
for cls_idx, label in enumerate(["H", "D", "A"]):
    bs = brier_score_loss((results == cls_idx).astype(int), probs[:, cls_idx])
    print(f"  {label}: {bs:.4f}")

ll = log_loss(results, probs)
print(f"\nLog-loss: {ll:.4f} (baseline no-skill ~1.10)")

# --- Distribution des probas vs cotes implicites ---
print("\n=== COMPARAISON PROBA MODELE vs COTES IMPLICITES ===")
test_df_all = df[df["season"].isin(test_seasons)].copy()
total_probs = np.vstack(all_probs)
test_df_all = test_df_all.sort_values(["season", "date"]).reset_index(drop=True)

# Focus on high-confidence predictions (model prob > 60%)
high_conf = total_probs.max(axis=1) > 0.60
best_outcome = total_probs.argmax(axis=1)
print(f"Matchs avec proba modele >60%: {high_conf.sum()} ({high_conf.mean():.1%})")
correct_hc = (best_outcome[high_conf] == results[high_conf])
print(f"  -> Taux de reussite reel: {correct_hc.mean():.1%} (vs 60% predit)")

# CLV analysis
clv_cols = [("_odds_home", "_odds_home_close"), ("_odds_draw", "_odds_draw_close"), ("_odds_away", "_odds_away_close")]
print("\n=== ANALYSE CLV (Closing Line Value) ===")
print("Si notre pari a une cote d'ouverture > cote de cloture = bookmaker confirme")

for open_col, close_col in clv_cols:
    if open_col in test_df_all.columns and close_col in test_df_all.columns:
        mask = (test_df_all[open_col] > 1) & (test_df_all[close_col] > 1)
        sub = test_df_all[mask]
        if len(sub) > 100:
            pos_clv = sub[open_col] > sub[close_col]
            neg_clv = sub[open_col] < sub[close_col]
            print(f"  {open_col}: pos CLV (open>close): {pos_clv.sum()} ({pos_clv.mean():.1%}) | "
                  f"neg CLV: {neg_clv.sum()} ({neg_clv.mean():.1%})")
