"""Backtesting engine: chronological simulation with Kelly sizing."""

import numpy as np
import pandas as pd
from rich.console import Console

from src.config import settings
from src.ml.combo_engine import ComboEngine, ComboLeg
from src.ml.football_model import FootballModel, MODEL_FEATURES, LABEL_MAP

console = Console()


class BacktestEngine:
    """Simulate betting on historical data chronologically."""

    def __init__(
        self,
        kelly_fraction: float = settings.KELLY_FRACTION,
        max_stake_pct: float = settings.MAX_STAKE_PERCENT,
        min_edge: float = settings.MIN_EDGE_THRESHOLD,
        initial_bankroll: float = settings.INITIAL_BANKROLL,
        allowed_outcomes: list[str] | None = None,
        excluded_leagues: list[str] | None = None,
        flat_stake: float | None = None,
        max_odds: float | None = None,
        min_odds: float | None = None,
        min_model_prob: float | None = None,
        # Combo mode
        combo_mode: bool = False,
        combo_max_legs: int = 4,
        combo_min_odds: float = 1.8,
        combo_max_odds: float = 3.0,
        combo_top_n: int = 3,
    ):
        self.kelly_fraction = kelly_fraction
        self.max_stake_pct = max_stake_pct
        self.min_edge = min_edge
        self.initial_bankroll = initial_bankroll
        self.allowed_outcomes = allowed_outcomes  # e.g. ["D"] for draw-only
        self.excluded_leagues = excluded_leagues  # e.g. ["F1"] to exclude Ligue 1
        self.flat_stake = flat_stake  # e.g. 0.01 for 1% flat stake
        self.max_odds = max_odds  # e.g. 2.0 to cap odds
        self.min_odds = min_odds  # e.g. 2.0 for minimum odds
        self.min_model_prob = min_model_prob  # e.g. 0.50 for 50% min confidence
        # Combo
        self.combo_mode = combo_mode
        self.combo_max_legs = combo_max_legs
        self.combo_min_odds = combo_min_odds
        self.combo_max_odds = combo_max_odds
        self.combo_top_n = combo_top_n
        # CLV filter: only bet when opening odds >= closing odds (bookmaker confirms our view)
        self.require_positive_clv = False

    def run(self, features_df: pd.DataFrame, test_seasons: list[str]) -> dict:
        """Run walk-forward backtest: train on past, predict and bet on test seasons."""
        # Filter out excluded leagues from both training and test data
        if self.excluded_leagues:
            features_df = features_df[~features_df["league"].isin(self.excluded_leagues)]
        all_seasons = sorted(features_df["season"].unique())
        bets = []
        model = FootballModel()

        for test_season in test_seasons:
            # Train seasons = all seasons before test season
            train_seasons = [s for s in all_seasons if s < test_season]
            if len(train_seasons) < 2:
                console.print(f"[yellow]Skipping {test_season}: not enough training seasons[/yellow]")
                continue

            train_df = features_df[features_df["season"].isin(train_seasons)]
            test_df = features_df[features_df["season"] == test_season].sort_values("date")

            # Prepare training data
            X_train_full = train_df[MODEL_FEATURES].values
            y_train_full = train_df["ftr"].map(LABEL_MAP).values

            console.print(f"\n[bold]Backtest season: {test_season}[/bold]")
            console.print(f"  Train: {len(X_train_full)} -> Test: {len(test_df)}")

            # Train without calibration (raw XGBoost softprob)
            model.train(X_train_full, y_train_full)

            # Predict on test set
            X_test = test_df[MODEL_FEATURES].values
            probas = model.predict_proba(X_test)

            # Simulate betting
            if self.combo_mode:
                season_bets = self._simulate_season_combos(test_df, probas)
            else:
                season_bets = self._simulate_season(test_df, probas)
            bets.extend(season_bets)

            wins = sum(1 for b in season_bets if b["won"])
            pnl = sum(b["pnl"] for b in season_bets)
            console.print(f"  Bets placed: {len(season_bets)}, Wins: {wins}, PnL: {pnl:+.2f}")

        return {
            "bets": bets,
            "initial_bankroll": self.initial_bankroll,
            "combo_mode": self.combo_mode,
            "config": {
                "kelly_fraction": self.kelly_fraction,
                "max_stake_pct": self.max_stake_pct,
                "min_edge": self.min_edge,
                "allowed_outcomes": self.allowed_outcomes,
                "excluded_leagues": self.excluded_leagues,
                "flat_stake": self.flat_stake,
                "max_odds": self.max_odds,
                "min_model_prob": self.min_model_prob,
                "combo_mode": self.combo_mode,
                "combo_max_legs": self.combo_max_legs,
                "combo_min_odds": self.combo_min_odds,
                "combo_max_odds": self.combo_max_odds,
            },
        }

    def _simulate_season(self, test_df: pd.DataFrame, probas: np.ndarray) -> list[dict]:
        """Simulate betting for one season. Max 1 bet per match (best edge)."""
        bets = []
        bankroll = self.initial_bankroll

        outcomes_map = [
            ("H", 0, "_odds_home", "_odds_home_close"),
            ("D", 1, "_odds_draw", "_odds_draw_close"),
            ("A", 2, "_odds_away", "_odds_away_close"),
        ]

        for i, (_, row) in enumerate(test_df.iterrows()):
            proba = probas[i]

            # Find best edge across all outcomes for this match
            best_bet = None
            best_edge = 0.0

            for outcome, idx, odds_col, close_col in outcomes_map:
                # Filter by allowed outcomes
                if self.allowed_outcomes and outcome not in self.allowed_outcomes:
                    continue

                market_odds = row.get(odds_col)
                if market_odds is None or (isinstance(market_odds, float) and np.isnan(market_odds)):
                    continue
                if market_odds <= 1.0:
                    continue

                # Filter by max odds
                if self.max_odds is not None and market_odds > self.max_odds:
                    continue

                implied_prob = 1.0 / market_odds
                model_prob = proba[idx]

                # Filter by min model probability
                if self.min_model_prob is not None and model_prob < self.min_model_prob:
                    continue

                edge = model_prob - implied_prob

                # CLV filter: skip if bookmaker moved odds against us (open < close)
                if self.require_positive_clv:
                    close_odds = row.get(close_col)
                    if close_odds is not None and not (isinstance(close_odds, float) and np.isnan(close_odds)) and close_odds > 1:
                        if market_odds < close_odds:
                            continue

                if edge > self.min_edge and edge > best_edge:
                    best_edge = edge
                    best_bet = (outcome, idx, odds_col, close_col, market_odds, model_prob, implied_prob, edge)

            # Place only the best bet for this match (if any)
            if best_bet is not None:
                outcome, idx, odds_col, close_col, market_odds, model_prob, implied_prob, edge = best_bet

                if self.flat_stake is not None:
                    stake_pct = self.flat_stake
                else:
                    stake_pct = self._kelly_stake(model_prob, market_odds)
                    if stake_pct <= 0:
                        continue

                stake = bankroll * stake_pct
                actual_result = row["ftr"]
                won = actual_result == outcome
                pnl = (stake * (market_odds - 1)) if won else (-stake)
                bankroll += pnl

                # CLV
                close_odds = row.get(close_col)
                clv = None
                if close_odds and not (isinstance(close_odds, float) and np.isnan(close_odds)) and close_odds > 1:
                    clv = (market_odds - close_odds) / close_odds

                bets.append({
                    "date": row["date"],
                    "match": f"{row['home_team']} vs {row['away_team']}",
                    "league": row["league"],
                    "outcome_bet": outcome,
                    "model_prob": round(float(model_prob), 4),
                    "implied_prob": round(float(implied_prob), 4),
                    "edge": round(float(edge), 4),
                    "odds": float(market_odds),
                    "stake": round(float(stake), 2),
                    "stake_pct": round(float(stake_pct), 4),
                    "won": won,
                    "pnl": round(float(pnl), 2),
                    "clv": round(float(clv), 6) if clv is not None else None,
                    "bankroll_after": round(float(bankroll), 2),
                })

        return bets

    def _simulate_season_combos(self, test_df: pd.DataFrame, probas: np.ndarray) -> list[dict]:
        """Simulate combo betting for one season. Group matches by date, generate combos."""
        bets = []
        bankroll = self.initial_bankroll

        outcomes_map = [
            ("H", 0, "_odds_home", "_odds_home_close"),
            ("D", 1, "_odds_draw", "_odds_draw_close"),
            ("A", 2, "_odds_away", "_odds_away_close"),
        ]

        # Build all candidate legs with their row index
        all_legs = []
        for i, (_, row) in enumerate(test_df.iterrows()):
            proba = probas[i]
            best_leg = None
            best_edge = 0.0

            for outcome, idx, odds_col, close_col in outcomes_map:
                if self.allowed_outcomes and outcome not in self.allowed_outcomes:
                    continue

                market_odds = row.get(odds_col)
                if market_odds is None or (isinstance(market_odds, float) and np.isnan(market_odds)):
                    continue
                if market_odds <= 1.0:
                    continue
                if self.max_odds is not None and market_odds > self.max_odds:
                    continue
                if self.min_odds is not None and market_odds < self.min_odds:
                    continue

                model_prob = proba[idx]
                if self.min_model_prob is not None and model_prob < self.min_model_prob:
                    continue

                implied_prob = 1.0 / market_odds
                edge = model_prob - implied_prob

                if edge > self.min_edge and edge > best_edge:
                    best_edge = edge
                    actual_result = row["ftr"]
                    best_leg = ComboLeg(
                        match=f"{row['home_team']} vs {row['away_team']}",
                        league=row["league"],
                        date=str(row["date"]),
                        outcome=outcome,
                        odds=float(market_odds),
                        model_prob=round(float(model_prob), 4),
                        implied_prob=round(float(implied_prob), 4),
                        edge=round(float(edge), 4),
                        won=(actual_result == outcome),
                    )

            if best_leg is not None:
                all_legs.append((row["date"], best_leg))

        if not all_legs:
            return bets

        # Group legs by date
        from collections import defaultdict
        legs_by_date = defaultdict(list)
        for date, leg in all_legs:
            # Normalize date to date-only string for grouping
            date_key = str(date)[:10]
            legs_by_date[date_key].append(leg)

        combo_engine = ComboEngine(
            max_legs=self.combo_max_legs,
            min_combo_odds=self.combo_min_odds,
            max_combo_odds=self.combo_max_odds,
            min_leg_prob=self.min_model_prob or 0.50,
        )

        # Process each date chronologically
        for date_key in sorted(legs_by_date.keys()):
            day_legs = legs_by_date[date_key]

            if len(day_legs) < 2:
                continue

            combos = combo_engine.generate_combos(day_legs)
            if not combos:
                continue

            # Take top N combos by EV
            top_combos = combo_engine.rank_combos(combos, top_n=self.combo_top_n)

            for combo in top_combos:
                stake_pct = self.flat_stake if self.flat_stake is not None else 0.05
                stake = bankroll * stake_pct
                combo.stake = round(stake, 2)
                combo = combo_engine.resolve_combo(combo)
                bankroll += combo.pnl

                legs_detail = [
                    {
                        "match": l.match,
                        "league": l.league,
                        "outcome": l.outcome,
                        "odds": l.odds,
                        "prob": l.model_prob,
                        "won": l.won,
                    }
                    for l in combo.legs
                ]

                bets.append({
                    "date": date_key,
                    "match": " + ".join(l.match for l in combo.legs),
                    "league": "/".join(set(l.league for l in combo.legs)),
                    "outcome_bet": "COMBO",
                    "model_prob": combo.combined_prob,
                    "implied_prob": round(1.0 / combo.combined_odds, 4) if combo.combined_odds > 0 else 0,
                    "edge": combo.ev,
                    "odds": combo.combined_odds,
                    "stake": combo.stake,
                    "stake_pct": round(stake_pct, 4),
                    "won": combo.won,
                    "pnl": combo.pnl,
                    "clv": None,
                    "bankroll_after": round(bankroll, 2),
                    "num_legs": combo.num_legs,
                    "legs": legs_detail,
                })

        return bets

    def _kelly_stake(self, prob: float, odds: float) -> float:
        """Fractional Kelly criterion, capped."""
        b = odds - 1.0
        p = prob
        q = 1.0 - p

        full_kelly = (b * p - q) / b
        if full_kelly <= 0:
            return 0.0

        fractional = full_kelly * self.kelly_fraction
        return min(fractional, self.max_stake_pct)
