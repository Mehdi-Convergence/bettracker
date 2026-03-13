"""Rugby backtesting engine: chronological walk-forward simulation.

Train: 2019 to 2023 (5 seasons)
Test:  2024 to 2025 (2 seasons, fixed)

Markets:
  - Winner (home/draw/away) — 1X2 like football
  - Over/Under total points

Rugby has draws (~5-8%) so we support the full 1X2 market.
"""

import numpy as np
import pandas as pd
from rich.console import Console

from src.config import settings
from src.features.rugby_features import RUGBY_FEATURE_COLUMNS, RugbyFeatureBuilder
from src.ml.rugby_model import RugbyModel

console = Console()

TRAIN_SEASONS = ["2019", "2020", "2021", "2022", "2023"]
TEST_SEASONS = ["2024", "2025"]

# Draw probability estimation: rugby draws are rare (~6% across major competitions)
_DRAW_BASE_PROB = 0.06


class RugbyBacktestEngine:
    """Simulate betting on rugby matches historically."""

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
        stop_loss_daily_pct: float | None = None,
        stop_loss_total_pct: float | None = None,
        markets: list[str] | None = None,  # ["winner", "over_under"]
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
        self.stop_loss_daily_pct = stop_loss_daily_pct
        self.stop_loss_total_pct = stop_loss_total_pct
        self.markets = markets or ["winner"]

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
        """Run walk-forward backtest on raw rugby match data."""
        console.print("[bold]Building rugby features...[/bold]")
        builder = RugbyFeatureBuilder()
        features_df = builder.build_dataset(raw_df, progress=True)

        if features_df.empty:
            return {"bets": [], "initial_bankroll": self.initial_bankroll, "config": self._config()}

        train_df = features_df[features_df["season"].isin(TRAIN_SEASONS)]
        test_df = features_df[features_df["season"].isin(TEST_SEASONS)].sort_values("match_date")

        if train_df.empty or test_df.empty:
            console.print("[red]Not enough data for train/test split[/red]")
            return {"bets": [], "initial_bankroll": self.initial_bankroll, "config": self._config()}

        X_train = train_df[RUGBY_FEATURE_COLUMNS].values.copy()
        y_train = train_df["target"].values
        X_test = test_df[RUGBY_FEATURE_COLUMNS].values.copy()

        col_medians = np.nanmedian(X_train, axis=0)
        for col_idx in range(X_train.shape[1]):
            X_train[:, col_idx] = np.where(np.isnan(X_train[:, col_idx]), col_medians[col_idx], X_train[:, col_idx])
            X_test[:, col_idx] = np.where(np.isnan(X_test[:, col_idx]), col_medians[col_idx], X_test[:, col_idx])

        console.print("[bold]Training rugby model...[/bold]")
        console.print(f"  Train: {len(X_train)} matches ({TRAIN_SEASONS[0]}-{TRAIN_SEASONS[-1]})")
        console.print(f"  Test: {len(X_test)} matches ({TEST_SEASONS[0]}-{TEST_SEASONS[-1]})")
        model = RugbyModel()
        model.train(X_train, y_train)

        probas = model.predict_proba(X_test)
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
        bets = []
        bankroll = self.initial_bankroll

        current_day = None
        day_pnl = 0.0
        bankroll_start_of_day = bankroll
        daily_stopped = False

        _max_bankroll = self.initial_bankroll * 50

        for i, row in test_df.iterrows():
            if self._check_stop_loss_total(bankroll):
                break
            if bankroll > _max_bankroll:
                bankroll = _max_bankroll

            game_day = str(row["match_date"])[:10]
            if game_day != current_day:
                current_day = game_day
                day_pnl = 0.0
                bankroll_start_of_day = bankroll
                daily_stopped = False

            if daily_stopped:
                continue

            home = row["home_team"]
            away = row["away_team"]
            result = row.get("result", "H" if bool(row["target"]) else "A")
            home_won = result == "H"
            draw = result == "D"
            away_won = result == "A"

            prob_home = float(probas[i])
            # Redistribute residual to draw/away proportionally
            residual = 1.0 - prob_home
            prob_draw = _DRAW_BASE_PROB * residual
            prob_away = residual - prob_draw

            _oh = row.get("_odds_home")
            _od = row.get("_odds_draw")
            _oa = row.get("_odds_away")
            odds_home = float(_oh) if (_oh is not None and _oh == _oh and float(_oh) > 1.0) else None
            odds_draw = float(_od) if (_od is not None and _od == _od and float(_od) > 1.0) else None
            odds_away = float(_oa) if (_oa is not None and _oa == _oa and float(_oa) > 1.0) else None

            # Synthesize odds from ELO when unavailable (same approach as NBA engine)
            if not odds_home or not odds_away:
                elo_h = row.get("home_elo")
                elo_a = row.get("away_elo")
                if elo_h and elo_a and not np.isnan(float(elo_h)) and not np.isnan(float(elo_a)):
                    p_h = 1.0 / (1.0 + 10.0 ** ((float(elo_a) - float(elo_h)) / 400.0))
                    p_h = max(0.30, min(0.75, p_h))
                    _vig = 1.06  # 6% margin for rugby
                    odds_home = round(_vig / p_h, 3)
                    odds_draw = round(_vig / _DRAW_BASE_PROB, 3)
                    p_a = max(0.05, 1.0 - p_h - _DRAW_BASE_PROB)
                    odds_away = round(_vig / p_a, 3)

            candidates = []

            if "winner" in self.markets:
                for label, model_prob, odds, actual_won in [
                    ("Home", prob_home, odds_home, home_won),
                    ("Draw", prob_draw, odds_draw, draw),
                    ("Away", prob_away, odds_away, away_won),
                ]:
                    if not odds or odds <= 1.0:
                        continue
                    if self.max_odds and odds > self.max_odds:
                        continue
                    if self.min_odds and odds < self.min_odds:
                        continue
                    if self.min_model_prob and model_prob < self.min_model_prob:
                        continue
                    edge = model_prob - 1.0 / odds
                    if edge > self.min_edge:
                        candidates.append({
                            "market": "winner",
                            "selection": label,
                            "model_prob": model_prob,
                            "odds": odds,
                            "edge": edge,
                            "actual_won": actual_won,
                        })

            if not candidates:
                continue

            best = max(candidates, key=lambda x: x["edge"])
            stake = self._compute_stake(bankroll, best["model_prob"], best["odds"])
            if stake <= 0:
                continue

            pnl = (best["odds"] - 1.0) * stake if best["actual_won"] else -stake
            bankroll += pnl
            day_pnl += pnl

            bets.append({
                "date": str(row["match_date"])[:10],
                "match": f"{home} vs {away}",
                "outcome_bet": f"{best['selection']} ({best['market']})",
                "home_team": home,
                "away_team": away,
                "league": row.get("league"),
                "market": best["market"],
                "selection": best["selection"],
                "odds": round(best["odds"], 2),
                "model_prob": round(best["model_prob"], 4),
                "edge": round(best["edge"], 4),
                "stake": round(stake, 2),
                "stake_pct": round(float(stake / (bankroll - pnl)) if (bankroll - pnl) > 0 else 0, 4),
                "pnl": round(pnl, 2),
                "won": best["actual_won"],
                "bankroll_after": round(bankroll, 2),
                "season": row.get("season"),
            })

            if self._check_stop_loss_daily(day_pnl, bankroll_start_of_day):
                daily_stopped = True

        return bets

    def _config(self) -> dict:
        return {
            "staking_strategy": self.staking_strategy,
            "min_edge": self.min_edge,
            "initial_bankroll": self.initial_bankroll,
            "train_seasons": TRAIN_SEASONS,
            "test_seasons": TEST_SEASONS,
            "markets": self.markets,
        }
