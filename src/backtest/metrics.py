"""Backtesting metrics: ROI, CLV, Brier, drawdown, Sharpe."""

import numpy as np


class BacktestMetrics:
    """Calculate comprehensive backtesting metrics."""

    def compute_all(self, bets: list[dict], initial_bankroll: float) -> dict:
        if not bets:
            return {"error": "No bets placed"}

        total_staked = sum(b["stake"] for b in bets)
        total_pnl = sum(b["pnl"] for b in bets)
        wins = sum(1 for b in bets if b["won"])
        losses = len(bets) - wins

        # Build bankroll curve
        bankroll_curve = [initial_bankroll]
        for b in bets:
            bankroll_curve.append(bankroll_curve[-1] + b["pnl"])

        # CLV stats
        clv_values = [b["clv"] for b in bets if b.get("clv") is not None]

        return {
            # Core
            "total_bets": len(bets),
            "wins": wins,
            "losses": losses,
            "win_rate": wins / len(bets),
            "total_staked": round(total_staked, 2),
            "total_pnl": round(total_pnl, 2),
            "roi_pct": round((total_pnl / total_staked) * 100, 2) if total_staked > 0 else 0,
            "final_bankroll": round(bankroll_curve[-1], 2),
            "bankroll_growth_pct": round(
                ((bankroll_curve[-1] - initial_bankroll) / initial_bankroll) * 100, 2
            ),

            # Risk
            "max_drawdown_pct": round(self._max_drawdown(bankroll_curve), 2),
            "longest_losing_streak": self._longest_streak(bets, won=False),
            "longest_winning_streak": self._longest_streak(bets, won=True),

            # Calibration / Gold standard
            "avg_clv": round(float(np.mean(clv_values)), 6) if clv_values else None,
            "clv_positive_pct": round(
                sum(1 for c in clv_values if c > 0) / len(clv_values) * 100, 1
            ) if clv_values else None,

            # Edge
            "avg_edge": round(float(np.mean([b["edge"] for b in bets])) * 100, 2),
            "median_edge": round(float(np.median([b["edge"] for b in bets])) * 100, 2),
            "avg_odds": round(float(np.mean([b["odds"] for b in bets])), 2),

            # Staking
            "avg_stake_pct": round(float(np.mean([b["stake_pct"] for b in bets])) * 100, 2),
            "max_stake_pct": round(float(max(b["stake_pct"] for b in bets)) * 100, 2),
        }

    def _max_drawdown(self, bankroll_curve: list[float]) -> float:
        peak = bankroll_curve[0]
        max_dd = 0.0
        for val in bankroll_curve:
            if val > peak:
                peak = val
            dd = (peak - val) / peak
            if dd > max_dd:
                max_dd = dd
        return max_dd * 100

    def _longest_streak(self, bets: list[dict], won: bool) -> int:
        max_streak = 0
        current = 0
        for b in bets:
            if b["won"] == won:
                current += 1
                max_streak = max(max_streak, current)
            else:
                current = 0
        return max_streak
