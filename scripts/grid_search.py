"""Focused grid search: ~220 runs, ~8 minutes."""
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
print(f"Test seasons: {test_seasons}\n")

INITIAL_BR = 200.0

SIMPLE_CONFIGS = []
for stake in [0.01, 0.02, 0.03, 0.05]:
    for edge in [0.02, 0.03, 0.05, 0.08]:
        for prob in [0.50, 0.55, 0.60, 0.65]:
            for max_odds in [2.0, 3.0, None]:
                SIMPLE_CONFIGS.append({
                    "label": f"S s={stake} e={edge} p={prob} mo={max_odds}",
                    "combo_mode": False,
                    "flat_stake": stake, "min_edge": edge,
                    "min_model_prob": prob, "min_odds": 1.0, "max_odds": max_odds,
                })

COMBO_CONFIGS = []
for stake in [0.01, 0.02, 0.03]:
    for legs in [2, 3]:
        for top_n in [1, 2]:
            for c_max_odds in [3.0, 5.0]:
                COMBO_CONFIGS.append({
                    "label": f"C s={stake} l={legs} tn={top_n} cmo={c_max_odds}",
                    "combo_mode": True,
                    "flat_stake": stake, "min_edge": 0.02, "min_model_prob": 0.55,
                    "min_odds": 1.0, "max_odds": 1.8,
                    "combo_max_legs": legs, "combo_min_odds": 1.5,
                    "combo_max_odds": c_max_odds, "combo_top_n": top_n,
                })

ALL_CONFIGS = SIMPLE_CONFIGS + COMBO_CONFIGS
print(f"Total: {len(ALL_CONFIGS)} ({len(SIMPLE_CONFIGS)} simple + {len(COMBO_CONFIGS)} combo)\n")

results = []
metrics_calc = BacktestMetrics()

for i, cfg in enumerate(ALL_CONFIGS):
    try:
        engine = BacktestEngine(
            initial_bankroll=INITIAL_BR,
            flat_stake=cfg["flat_stake"], min_edge=cfg["min_edge"],
            min_model_prob=cfg.get("min_model_prob"), max_odds=cfg.get("max_odds"),
            min_odds=cfg.get("min_odds", 1.0), combo_mode=cfg["combo_mode"],
            combo_max_legs=cfg.get("combo_max_legs", 4),
            combo_min_odds=cfg.get("combo_min_odds", 1.8),
            combo_max_odds=cfg.get("combo_max_odds", 4.0),
            combo_top_n=cfg.get("combo_top_n", 3),
        )
        result = engine.run(df, test_seasons)
        bets = result["bets"]
        if len(bets) < 30:
            continue
        m = metrics_calc.compute_all(bets, INITIAL_BR)
        growth = m["bankroll_growth_pct"]
        drawdown = m["max_drawdown_pct"]
        final_bk = m["final_bankroll"]
        if final_bk < 10:
            score = -9999
            score2 = -9999
        else:
            sf = min(m["total_bets"], 300) / 300
            score = (growth / max(1, drawdown)) * sf
            score2 = m["roi_pct"] * (1 - drawdown / 100) * math.log(m["total_bets"] + 1)
        results.append({
            "label": cfg["label"], "mode": "COMBO" if cfg["combo_mode"] else "SIMPLE",
            "stake": cfg["flat_stake"], "edge": cfg["min_edge"],
            "prob": cfg.get("min_model_prob", 0), "max_odds": cfg.get("max_odds"),
            "bets": m["total_bets"], "wr": round(m["win_rate"]*100,1),
            "roi": round(m["roi_pct"],2), "final_bk": round(final_bk,1),
            "growth": round(growth,1), "drawdown": round(drawdown,1),
            "lose_str": m["longest_losing_streak"], "avg_odds": round(m["avg_odds"],2),
            "score": round(score,3), "score2": round(score2,3),
        })
    except Exception as e:
        pass
    if (i + 1) % 20 == 0:
        print(f"  {i+1}/{len(ALL_CONFIGS)}...")

print(f"\nDone. Valid: {len(results)}\n")
pd.DataFrame(results).to_csv("C:/Users/MehdiBouziane/bettracker/data/backtest_grid.csv", index=False)

def ptable(title, rows):
    print(f"\n{'='*90}")
    print(f"  {title}")
    print(f"{'='*90}")
    h = f"{'Mode':<7}{'Stake':>6}{'Edge':>6}{'Prob':>6}{'MaxO':>6} | {'Bets':>5}{'WR%':>6}{'ROI%':>7}{'BKfin':>8}{'DD%':>6}{'LStr':>5}{'AvgO':>6}"
    print(h); print("-"*90)
    for _, r in rows.iterrows():
        mo = f"{r['max_odds']:.1f}" if r["max_odds"] else " ---"
        print(f"{r['mode'][:6]:<7}{r['stake']:>6.2f}{r['edge']:>6.2f}{r['prob']:>6.2f}{mo:>6} | "
              f"{r['bets']:>5}{r['wr']:>6.1f}{r['roi']:>+7.2f}{r['final_bk']:>8.0f}"
              f"{r['drawdown']:>6.1f}{r['lose_str']:>5}{r['avg_odds']:>6.2f}")

dr = pd.DataFrame(results)

ptable("TOP 15 SCORE (Croissance/Drawdown x Volume)", dr[dr["score"]>0].nlargest(15,"score"))
ptable("TOP 10 SCORE2 (ROI x Survie x Log(n))", dr[dr["score2"]>0].nlargest(10,"score2"))
ptable("STABLES: DD<40% et BK>100e", dr[(dr["drawdown"]<40)&(dr["final_bk"]>100)].nlargest(10,"roi"))

print("\n=== PAR EDGE MIN ===")
print(f"{'Edge':>6} | {'N':>4} {'ROI moy':>8} {'BK moy':>8} {'DD moy':>7}")
print("-"*42)
for ev in sorted(dr["edge"].unique()):
    s = dr[(dr["edge"]==ev)&(dr["final_bk"]>10)]
    if not s.empty:
        print(f"{ev:>6.2f} | {len(s):>4} {s['roi'].mean():>+8.2f} {s['final_bk'].mean():>8.1f} {s['drawdown'].mean():>7.1f}")

print("\n=== PAR MISE ===")
print(f"{'Stake':>6} | {'N':>4} {'ROI moy':>8} {'BK moy':>8} {'DD moy':>7}")
print("-"*42)
for sv in sorted(dr["stake"].unique()):
    s = dr[(dr["stake"]==sv)&(dr["final_bk"]>10)]
    if not s.empty:
        print(f"{sv:>6.2f} | {len(s):>4} {s['roi'].mean():>+8.2f} {s['final_bk'].mean():>8.1f} {s['drawdown'].mean():>7.1f}")

print("\n=== MEILLEURE CONFIG ===")
best = dr[dr["score"]>0].nlargest(1,"score").iloc[0]
print(f"Mode: {best['mode']} | Stake: {best['stake']*100:.0f}% | Edge: {best['edge']*100:.0f}% | Prob: {best['prob']*100:.0f}% | MaxOdds: {best['max_odds']}")
print(f"Bets: {best['bets']} | WR: {best['wr']}% | ROI: {best['roi']:+.2f}% | BK finale: {best['final_bk']:.0f}e | DD: {best['drawdown']:.1f}%")
