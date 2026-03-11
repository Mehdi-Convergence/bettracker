"""Tennis backtesting engine: chronological simulation (2 outcomes, no draw).

Train: 2019-2023 (5 years), Test: 2024-2025 (2 years). Periods are fixed.

Bets are placed from p1's perspective:
  - Bet P1: model thinks p1 wins, bet on p1 odds
  - Bet P2: model thinks p2 wins, bet on p2 odds
"""

import numpy as np
import pandas as pd
from rich.console import Console

from src.config import settings
from src.features.tennis_features import TennisFeatureBuilder, TENNIS_FEATURE_COLUMNS
from src.ml.tennis_model import TennisModel

console = Console()

TRAIN_YEARS = list(range(2019, 2024))   # 2019-2023
TEST_YEARS = [2024, 2025]               # fixed test period


class TennisBacktestEngine:
    """Simulate betting on ATP tennis historically."""

    def __init__(
        self,
        staking_strategy: str = "half_kelly",
        flat_stake_amount: float | None = None,
        pct_bankroll: float = 0.02,
        kelly_fraction: float = settings.KELLY_FRACTION,
        max_stake_pct: float = settings.MAX_STAKE_PERCENT,
        min_edge: float = settings.MIN_EDGE_THRESHOLD,
        initial_bankroll: float = settings.INITIAL_BANKROLL,
        max_odds: float | None = None,
        min_odds: float | None = None,
        min_model_prob: float | None = None,
        allowed_surfaces: list[str] | None = None,
        allowed_series: list[str] | None = None,
        stop_loss_daily_pct: float | None = None,
        stop_loss_total_pct: float | None = None,
    ):
        self.staking_strategy = staking_strategy
        self.flat_stake_amount = flat_stake_amount
        self.pct_bankroll = pct_bankroll
        self.kelly_fraction = kelly_fraction
        self.max_stake_pct = max_stake_pct
        self.min_edge = min_edge
        self.initial_bankroll = initial_bankroll
        self.max_odds = max_odds
        self.min_odds = min_odds
        self.min_model_prob = min_model_prob
        self.allowed_surfaces = allowed_surfaces
        self.allowed_series = allowed_series
        self.stop_loss_daily_pct = stop_loss_daily_pct
        self.stop_loss_total_pct = stop_loss_total_pct

    def _compute_stake(self, bankroll: float, model_prob: float, odds: float) -> float:
        if self.staking_strategy == "flat":
            amount = self.flat_stake_amount or 20.0
            return min(amount, bankroll * self.max_stake_pct)
        if self.staking_strategy == "pct_bankroll":
            return bankroll * self.pct_bankroll
        if self.staking_strategy in ("half_kelly", "kelly_dynamic"):
            fraction = self.kelly_fraction
            if self.staking_strategy == "kelly_dynamic":
                fraction = self.kelly_fraction * min(model_prob / 0.55, 1.5)
            b = odds - 1.0
            p = model_prob
            q = 1.0 - p
            full_kelly = (b * p - q) / b
            if full_kelly <= 0:
                return 0.0
            stake_pct = min(full_kelly * fraction, self.max_stake_pct)
            return bankroll * stake_pct
        return bankroll * self.pct_bankroll

    def _check_stop_loss_total(self, bankroll: float) -> bool:
        if self.stop_loss_total_pct is None:
            return False
        return (self.initial_bankroll - bankroll) / self.initial_bankroll >= self.stop_loss_total_pct

    def _check_stop_loss_daily(self, day_pnl: float, bankroll_start_of_day: float) -> bool:
        if self.stop_loss_daily_pct is None or bankroll_start_of_day <= 0:
            return False
        return (-day_pnl / bankroll_start_of_day) >= self.stop_loss_daily_pct

    def run(self, raw_df: pd.DataFrame) -> dict:
        """Run walk-forward backtest on raw tennis match data.

        Args:
            raw_df: DataFrame with columns matching TennisMatch model fields.

        Returns:
            dict with 'bets', 'initial_bankroll', 'config'.
        """
        # Surface / series filters (applied to raw data before feature building)
        if self.allowed_surfaces:
            raw_df = raw_df[raw_df["surface"].isin(self.allowed_surfaces)]
        if self.allowed_series:
            raw_df = raw_df[raw_df["series"].isin(self.allowed_series)]

        # Build features (incremental, no look-ahead)
        console.print("[bold]Building tennis features...[/bold]")
        builder = TennisFeatureBuilder(seed=42)
        features_df = builder.build_dataset(raw_df, progress=True)

        if features_df.empty:
            return {"bets": [], "initial_bankroll": self.initial_bankroll, "config": self._config()}

        # Split train/test by year
        train_df = features_df[features_df["year"].isin(TRAIN_YEARS)]
        test_df = features_df[features_df["year"].isin(TEST_YEARS)].sort_values("date")

        if train_df.empty or test_df.empty:
            console.print("[red]Not enough data for train/test split[/red]")
            return {"bets": [], "initial_bankroll": self.initial_bankroll, "config": self._config()}

        # Prepare features
        X_train = train_df[TENNIS_FEATURE_COLUMNS].values
        y_train = train_df["target"].values
        X_test = test_df[TENNIS_FEATURE_COLUMNS].values

        # NaN fill with train medians
        col_medians = np.nanmedian(X_train, axis=0)
        for col_idx in range(X_train.shape[1]):
            X_train[:, col_idx] = np.where(np.isnan(X_train[:, col_idx]), col_medians[col_idx], X_train[:, col_idx])
            X_test[:, col_idx] = np.where(np.isnan(X_test[:, col_idx]), col_medians[col_idx], X_test[:, col_idx])

        # Train model
        console.print(f"[bold]Training tennis model...[/bold]")
        console.print(f"  Train: {len(X_train)} matches ({TRAIN_YEARS[0]}-{TRAIN_YEARS[-1]})")
        console.print(f"  Test: {len(X_test)} matches ({TEST_YEARS[0]}-{TEST_YEARS[-1]})")
        model = TennisModel()
        model.train(X_train, y_train)

        # Predict on test set
        probas = model.predict_proba(X_test)  # P(p1 wins) — 1D array

        bets = self._simulate(test_df.reset_index(drop=True), probas)

        wins = sum(1 for b in bets if b["won"])
        pnl = sum(b["pnl"] for b in bets)
        console.print(f"\n  Bets placed: {len(bets)}, Wins: {wins}, PnL: {pnl:+.2f}")

        return {
            "bets": bets,
            "initial_bankroll": self.initial_bankroll,
            "config": self._config(),
        }

    def _simulate(self, test_df: pd.DataFrame, probas: np.ndarray) -> list[dict]:
        """Simulate betting for the test period. One bet per match (best edge)."""
        bets = []
        bankroll = self.initial_bankroll

        current_day = None
        day_pnl = 0.0
        bankroll_start_of_day = bankroll
        daily_stopped = False

        for i, row in test_df.iterrows():
            if self._check_stop_loss_total(bankroll):
                break

            match_day = str(row["date"])[:10]
            if match_day != current_day:
                current_day = match_day
                day_pnl = 0.0
                bankroll_start_of_day = bankroll
                daily_stopped = False

            if daily_stopped:
                continue

            prob_p1 = float(probas[i])
            prob_p2 = 1.0 - prob_p1

            # p1 / p2 are stored in features_df (randomly assigned roles)
            p1 = row["p1"]
            p2 = row["p2"]
            winner = row["winner"]

            # Odds from p1's perspective
            odds_p1 = row.get("_odds_p1")
            odds_p2 = row.get("_odds_p2")

            best_bet = None
            best_edge = 0.0

            for (who, model_prob, odds) in [("P1", prob_p1, odds_p1), ("P2", prob_p2, odds_p2)]:
                if odds is None or (isinstance(odds, float) and np.isnan(odds)):
                    continue
                if odds <= 1.0:
                    continue
                if self.max_odds is not None and odds > self.max_odds:
                    continue
                if self.min_odds is not None and odds < self.min_odds:
                    continue
                if self.min_model_prob is not None and model_prob < self.min_model_prob:
                    continue

                implied_prob = 1.0 / odds
                edge = model_prob - implied_prob

                if edge > self.min_edge and edge > best_edge:
                    best_edge = edge
                    best_bet = (who, model_prob, odds, implied_prob, edge)

            if best_bet is None:
                continue

            who, model_prob, odds, implied_prob, edge = best_bet
            stake = self._compute_stake(bankroll, model_prob, odds)
            if stake <= 0:
                continue

            # Determine who won
            if who == "P1":
                won = (p1 == winner)
                player_bet = p1
                opponent = p2
            else:
                won = (p2 == winner)
                player_bet = p2
                opponent = p1

            pnl = (stake * (odds - 1)) if won else (-stake)
            bankroll += pnl
            day_pnl += pnl

            if self._check_stop_loss_daily(day_pnl, bankroll_start_of_day):
                daily_stopped = True

            bets.append({
                "date": row["date"],
                "match": f"{row['winner']} vs {row['loser']}",
                "tournament": row.get("tournament"),
                "surface": row.get("surface"),
                "outcome_bet": who,
                "player_bet": player_bet,
                "opponent": opponent,
                "model_prob": round(float(model_prob), 4),
                "implied_prob": round(float(implied_prob), 4),
                "edge": round(float(edge), 4),
                "odds": float(odds),
                "stake": round(float(stake), 2),
                "stake_pct": round(float(stake / max(bankroll, 1)), 4),
                "won": won,
                "pnl": round(float(pnl), 2),
                "bankroll_after": round(float(bankroll), 2),
                "clv": None,  # no closing odds in tennis-data.co.uk
            })

        return bets

    def _config(self) -> dict:
        return {
            "staking_strategy": self.staking_strategy,
            "kelly_fraction": self.kelly_fraction,
            "max_stake_pct": self.max_stake_pct,
            "min_edge": self.min_edge,
            "max_odds": self.max_odds,
            "min_odds": self.min_odds,
            "min_model_prob": self.min_model_prob,
            "allowed_surfaces": self.allowed_surfaces,
            "allowed_series": self.allowed_series,
            "stop_loss_daily_pct": self.stop_loss_daily_pct,
            "stop_loss_total_pct": self.stop_loss_total_pct,
            "train_years": TRAIN_YEARS,
            "test_years": TEST_YEARS,
        }
