"""Grid search v2 — avec nouvelles features lambda + filtre CLV optionnel."""
import os, sys, math, warnings
os.environ["PYTHONIOENCODING"] = "utf-8"
warnings.filterwarnings("ignore")
sys.path.insert(0, "C:/Users/MehdiBouziane/bettracker")

import pandas as pd
from src.backtest.engine import BacktestEngine
from src.backtest.metrics import BacktestMetrics

df = pd.read_parquet("C:/Users/MehdiBouziane/bettracker/data/processed/football_features.parquet")
all_seasons = sorted(df["season"].unique())
test_seasons = [s for i, s in enumerate(all_seasons) if i >= 2]
print(f"Test seasons: {test_seasons}")
print(f"Features: {len(df.columns)} cols\n")

INITIAL_BR = 200.0

# Configs simples — edge=3% (meilleur d'après grid v1), avec/sans CLV
SIMPLE_CONFIGS = []
for stake in [0.01, 0.02, 0.03, 0.05]:
    for prob in [0.50, 0.55, 0.60, 0.65]:
        for max_odds in [2.0, 3.0, None]:
            for clv in [False, True]:
                SIMPLE_CONFIGS.append({
                    "label": f"S s={stake} p={prob} mo={max_odds} clv={clv}",
                    "combo_mode": False,
                    "flat_stake": stake, "min_edge": 0.03,
                    "min_model_prob": prob, "min_odds": 1.0, "max_odds": max_odds,
                    "require_positive_clv": clv,
                })

print(f"Total: {len(SIMPLE_CONFIGS)} configs\n")

results = []
metrics_calc = BacktestMetrics()

for i, cfg in enumerate(SIMPLE_CONFIGS):
    try:
        engine = BacktestEngine(
            initial_bankroll=INITIAL_BR,
            flat_stake=cfg["flat_stake"], min_edge=cfg["min_edge"],
            min_model_prob=cfg.get("min_model_prob"), max_odds=cfg.get("max_odds"),
            min_odds=cfg.get("min_odds", 1.0), combo_mode=False,
        )
        engine.require_positive_clv = cfg.get("require_positive_clv", False)
        result = engine.run(df, test_seasons)
        bets = result["bets"]
        if len(bets) < 30:
            continue
        m = metrics_calc.compute_all(bets, INITIAL_BR)
        growth = m["bankroll_growth_pct"]
        drawdown = m["max_drawdown_pct"]
        final_bk = m["final_bankroll"]
        if final_bk < 10:
            score = -9999; score2 = -9999
        else:
            sf = min(m["total_bets"], 300) / 300
            score = (growth / max(1, drawdown)) * sf
            score2 = m["roi_pct"] * (1 - drawdown / 100) * math.log(m["total_bets"] + 1)
        results.append({
            "label": cfg["label"], "stake": cfg["flat_stake"],
            "prob": cfg.get("min_model_prob", 0), "max_odds": cfg.get("max_odds"),
            "clv": cfg.get("require_positive_clv", False),
            "bets": m["total_bets"], "wr": round(m["win_rate"]*100,1),
            "roi": round(m["roi_pct"],2), "final_bk": round(final_bk,1),
            "drawdown": round(drawdown,1), "score": round(score,3), "score2": round(score2,3),
        })
    except Exception as e:
        print(f"  Error cfg {i}: {e}")
    if (i + 1) % 30 == 0:
        print(f"  {i+1}/{len(SIMPLE_CONFIGS)}...")

print(f"\nDone. Valid: {len(results)}\n")
dr = pd.DataFrame(results)
dr.to_csv("C:/Users/MehdiBouziane/bettracker/data/backtest_grid_v2.csv", index=False)

def ptable(title, rows):
    print(f"\n{'='*90}\n  {title}\n{'='*90}")
    h = f"{'Stake':>6}{'Prob':>6}{'MaxO':>6}{'CLV':>5} | {'Bets':>5}{'WR%':>6}{'ROI%':>7}{'BKfin':>8}{'DD%':>6}"
    print(h); print("-"*90)
    for _, r in rows.iterrows():
        mo = f"{r['max_odds']:.1f}" if r["max_odds"] else " ---"
        print(f"{r['stake']:>6.2f}{r['prob']:>6.2f}{mo:>6}{'Y' if r['clv'] else 'N':>5} | "
              f"{r['bets']:>5}{r['wr']:>6.1f}{r['roi']:>+7.2f}{r['final_bk']:>8.0f}{r['drawdown']:>6.1f}")

ptable("TOP 15 SCORE", dr[dr["score"]>0].nlargest(15, "score"))
ptable("STABLES DD<20% ROI>3%", dr[(dr["drawdown"]<20)&(dr["roi"]>3)].nlargest(10, "score2"))

print("\n=== CLV vs NO CLV (edge=3%) ===")
for clv_val in [False, True]:
    sub = dr[dr["clv"]==clv_val]
    if not sub.empty:
        print(f"CLV={clv_val}: ROI moy={sub['roi'].mean():.2f}%, DD moy={sub['drawdown'].mean():.1f}%, "
              f"BK moy={sub['final_bk'].mean():.0f}€, N={len(sub)}")

print("\n=== MEILLEURE CONFIG STABLE ===")
stable = dr[(dr["drawdown"]<20)&(dr["roi"]>0)&(dr["bets"]>300)]
if not stable.empty:
    best = stable.nlargest(1,"score2").iloc[0]
    print(f"Stake: {best['stake']*100:.0f}% | Prob: {best['prob']*100:.0f}% | MaxOdds: {best['max_odds']} | CLV: {best['clv']}")
    print(f"Bets: {best['bets']} | WR: {best['wr']}% | ROI: {best['roi']:+.2f}% | BK: {best['final_bk']:.0f}€ | DD: {best['drawdown']:.1f}%")
