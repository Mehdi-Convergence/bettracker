"""
Backtest analysis script: baseline + robustness variations.
Runs multiple parameter sets and prints a comparison table.
"""
import os
import sys

# Ensure UTF-8 output on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"

import pandas as pd
import numpy as np

# Add project root to path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src.backtest.engine import BacktestEngine

DATA_PATH = os.path.join(ROOT, "data/processed/football_features.parquet")

# Available seasons: 2021, 2122, 2223, 2324, 2425
# Walk-forward: need at least 2 seasons to train. Test on 2324 and 2425.
TEST_SEASONS = ["2324", "2425"]


def compute_metrics(result: dict) -> dict:
    """Compute summary metrics from engine result."""
    bets = result["bets"]
    if not bets:
        return {
            "total_bets": 0,
            "win_rate": 0.0,
            "roi_pct": 0.0,
            "final_bankroll": result["initial_bankroll"],
            "max_drawdown_pct": 0.0,
            "longest_losing_streak": 0,
            "avg_odds": 0.0,
            "total_staked": 0.0,
            "total_pnl": 0.0,
        }

    initial = result["initial_bankroll"]

    total_bets = len(bets)
    wins = sum(1 for b in bets if b["won"])
    win_rate = wins / total_bets if total_bets > 0 else 0.0

    total_staked = sum(b["stake"] for b in bets)
    total_pnl = sum(b["pnl"] for b in bets)

    # ROI = total_pnl / total_staked
    roi_pct = (total_pnl / total_staked * 100) if total_staked > 0 else 0.0

    final_bankroll = bets[-1]["bankroll_after"] if bets else initial

    # Max drawdown from peak
    bankroll_series = [initial] + [b["bankroll_after"] for b in bets]
    peak = bankroll_series[0]
    max_dd = 0.0
    for br in bankroll_series:
        if br > peak:
            peak = br
        dd = (peak - br) / peak if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd

    # Longest losing streak
    longest = 0
    current = 0
    for b in bets:
        if not b["won"]:
            current += 1
            longest = max(longest, current)
        else:
            current = 0

    avg_odds = np.mean([b["odds"] for b in bets]) if bets else 0.0

    return {
        "total_bets": total_bets,
        "win_rate": round(win_rate * 100, 1),
        "roi_pct": round(roi_pct, 2),
        "final_bankroll": round(final_bankroll, 0),
        "max_drawdown_pct": round(max_dd * 100, 1),
        "longest_losing_streak": longest,
        "avg_odds": round(avg_odds, 3),
        "total_staked": round(total_staked, 0),
        "total_pnl": round(total_pnl, 0),
    }


def run_scenario(name: str, df: pd.DataFrame, engine_kwargs: dict) -> dict:
    print(f"\n>>> Running: {name}")
    engine = BacktestEngine(**engine_kwargs)
    result = engine.run(df, test_seasons=TEST_SEASONS)
    metrics = compute_metrics(result)
    metrics["name"] = name
    print(f"    Bets={metrics['total_bets']}, WR={metrics['win_rate']}%, ROI={metrics['roi_pct']}%, Bankroll={metrics['final_bankroll']}")
    return metrics


def print_table(rows: list[dict]):
    """Print a fixed-width comparison table without unicode box chars."""
    columns = [
        ("Scenario", 38),
        ("Bets", 6),
        ("WR%", 6),
        ("ROI%", 7),
        ("Final BK", 10),
        ("Max DD%", 8),
        ("LosStr", 7),
        ("AvgOdds", 8),
        ("TotalPnL", 10),
    ]

    def sep():
        print("-" * sum(w for _, w in columns))

    # Header
    sep()
    header = "".join(name.ljust(w) for name, w in columns)
    print(header)
    sep()

    for r in rows:
        line = (
            r["name"][:37].ljust(38)
            + str(r["total_bets"]).ljust(6)
            + str(r["win_rate"]).ljust(6)
            + str(r["roi_pct"]).ljust(7)
            + str(r["final_bankroll"]).ljust(10)
            + str(r["max_drawdown_pct"]).ljust(8)
            + str(r["longest_losing_streak"]).ljust(7)
            + str(r["avg_odds"]).ljust(8)
            + str(r["total_pnl"]).ljust(10)
        )
        print(line)

    sep()


def main():
    print("Loading features data...")
    df = pd.read_parquet(DATA_PATH)
    print(f"Loaded {len(df)} rows. Seasons: {sorted(df['season'].unique())}")
    print(f"Test seasons: {TEST_SEASONS}")

    # -------------------------------------------------------------------
    # BASE PARAMS matching the UI screenshot (exactly as specified)
    # -------------------------------------------------------------------
    base_params = dict(
        initial_bankroll=200,
        flat_stake=0.20,         # 20% of bankroll
        min_edge=0.02,
        min_model_prob=0.55,
        min_odds=1.2,
        max_odds=1.8,
        combo_mode=True,
        combo_max_legs=4,
        combo_min_odds=1.8,
        combo_max_odds=4.0,
        combo_top_n=4,
    )

    scenarios = []

    # Scenario 0: Exact UI parameters
    s0 = run_scenario("Exact UI (20% stake, combo)", df, base_params)
    scenarios.append(s0)

    # Scenario 1: Safer flat stake 5%
    s1 = run_scenario("5% stake, combo", df, {**base_params, "flat_stake": 0.05})
    scenarios.append(s1)

    # Scenario 2: Very conservative 2% stake
    s2 = run_scenario("2% stake, combo", df, {**base_params, "flat_stake": 0.02})
    scenarios.append(s2)

    # Scenario 3: No combo mode (simple bets only), 5% stake
    s3 = run_scenario("No combo (simple bets), 5%", df, {
        **base_params,
        "flat_stake": 0.05,
        "combo_mode": False,
    })
    scenarios.append(s3)

    # Scenario 4: Higher edge min 0.05, combo, 5% stake
    s4 = run_scenario("Edge>=5%, combo, 5% stake", df, {
        **base_params,
        "flat_stake": 0.05,
        "min_edge": 0.05,
    })
    scenarios.append(s4)

    # Scenario 5: Higher edge min 0.10, combo, 5% stake
    s5 = run_scenario("Edge>=10%, combo, 5% stake", df, {
        **base_params,
        "flat_stake": 0.05,
        "min_edge": 0.10,
    })
    scenarios.append(s5)

    # Scenario 6: min_model_prob 0.60, combo, 5% stake
    s6 = run_scenario("Prob>=60%, combo, 5% stake", df, {
        **base_params,
        "flat_stake": 0.05,
        "min_model_prob": 0.60,
    })
    scenarios.append(s6)

    # -------------------------------------------------------------------
    # Print table
    # -------------------------------------------------------------------
    print("\n\n=== BACKTEST COMPARISON TABLE ===")
    print(f"Test seasons: {TEST_SEASONS} | Initial bankroll: 200 EUR")
    print()
    print_table(scenarios)

    # -------------------------------------------------------------------
    # Detailed analysis of Scenario 0 (exact UI params)
    # -------------------------------------------------------------------
    print("\n\n=== DETAILED ANALYSIS: Exact UI Parameters ===")
    engine0 = BacktestEngine(**base_params)
    result0 = engine0.run(df, test_seasons=TEST_SEASONS)
    bets0 = result0["bets"]

    if bets0:
        # Bankroll trajectory
        bankroll_series = [200.0] + [b["bankroll_after"] for b in bets0]
        peak_br = max(bankroll_series)
        min_br = min(bankroll_series)
        print(f"  Peak bankroll:  {peak_br:.0f} EUR")
        print(f"  Min bankroll:   {min_br:.0f} EUR (worst point)")
        print(f"  Final bankroll: {bankroll_series[-1]:.0f} EUR")
        print(f"  Total staked:   {sum(b['stake'] for b in bets0):.0f} EUR")
        print(f"  Total PnL:      {sum(b['pnl'] for b in bets0):.0f} EUR")

        # Stake compounding effect explanation
        print()
        print("  --- Stake compounding effect ---")
        avg_stake_early = sum(b["stake"] for b in bets0[:20]) / min(20, len(bets0))
        avg_stake_late = sum(b["stake"] for b in bets0[-20:]) / min(20, len(bets0))
        print(f"  Average stake (first 20 bets):  {avg_stake_early:.2f} EUR")
        print(f"  Average stake (last 20 bets):   {avg_stake_late:.2f} EUR")
        print(f"  Stake growth ratio:              {avg_stake_late/avg_stake_early:.1f}x")

        # How many combos vs legs
        n_combos = len(bets0)
        avg_legs = sum(b.get("num_legs", 1) for b in bets0) / n_combos if n_combos > 0 else 0
        print()
        print(f"  Total combo bets placed: {n_combos}")
        print(f"  Average legs per combo:  {avg_legs:.1f}")
        won_combos = sum(1 for b in bets0 if b["won"])
        print(f"  Combos won:              {won_combos} ({100*won_combos/n_combos:.1f}%)")

        # Largest single win / loss
        max_win_bet = max(bets0, key=lambda b: b["pnl"])
        max_loss_bet = min(bets0, key=lambda b: b["pnl"])
        print(f"  Largest single win:  +{max_win_bet['pnl']:.0f} EUR (odds {max_win_bet['odds']:.2f}, stake {max_win_bet['stake']:.0f} EUR)")
        print(f"  Largest single loss: {max_loss_bet['pnl']:.0f} EUR (stake {max_loss_bet['stake']:.0f} EUR)")

    # -------------------------------------------------------------------
    # Key findings summary
    # -------------------------------------------------------------------
    print("\n\n=== KEY FINDINGS ===")
    m0 = s0
    m1 = s1
    m2 = s2
    m3 = s3

    print(f"""
1. COMPOUNDING EFFECT (the real driver of '40k'):
   With 20% flat stake, every win dramatically increases the bankroll,
   which in turn increases the next bet's stake. This creates explosive
   growth but also catastrophic drawdowns.
   Max drawdown at 20% stake: {m0['max_drawdown_pct']}%
   Max drawdown at  5% stake: {m1['max_drawdown_pct']}%
   Max drawdown at  2% stake: {m2['max_drawdown_pct']}%

2. ROI COMPARISON (should be similar regardless of stake size):
   ROI at 20% stake: {m0['roi_pct']}%
   ROI at  5% stake: {m1['roi_pct']}%
   ROI at  2% stake: {m2['roi_pct']}%
   Note: ROI should be approximately equal since it's pnl/staked.
   If they differ, it is due to bankroll going negative or stake order effects.

3. SIMPLE vs COMBO:
   Combo ROI (5%):  {m1['roi_pct']}%
   Simple ROI (5%): {m3['roi_pct']}%
   Combo bets: {m1['total_bets']}, Win rate: {m1['win_rate']}%
   Simple bets: {m3['total_bets']}, Win rate: {m3['win_rate']}%

4. MAX DRAWDOWN INTERPRETATION:
   A {m0['max_drawdown_pct']}% drawdown means the bankroll dropped from its peak
   by {m0['max_drawdown_pct']}%. With 20% compounding stakes, if the bankroll grows
   to e.g. 500 EUR and then loses 5 consecutive bets at 20%/bet,
   the drawdown is catastrophic but the final result can still be high
   if wins at high bankroll were large enough.

5. REAL vs ARTIFACT:
   If ROI is positive across multiple stake sizes and in simple mode,
   it is likely a real (though modest) edge. The '40k' figure is
   MOSTLY an artifact of 20% compounding on top of a modest positive ROI.
   A 5% stake with the same model gives a much more realistic picture.
""")


if __name__ == "__main__":
    main()
