"""PMU backtesting engine: chronological walk-forward simulation.

Specificites PMU par rapport aux autres sports:
  - N chevaux par course (8-20), pas 2 equipes
  - Commission PMU: ~15% sur simple gagnant, ~18% sur simple place
  - Classe imbalancee: ~8% gagnant, ~25% place

Train: premier 80% des courses (chronologique)
Test:  dernier 20% des courses

Marches supportes:
  - simple_gagnant : parie sur le gagnant de la course
  - simple_place   : parie sur un cheval dans le top-3
"""

import logging

import numpy as np
import pandas as pd

from src.config import settings
from src.features.pmu_features import PMU_FEATURE_COLUMNS, PMUFeatureBuilder
from src.ml.pmu_model import MODEL_DIR_PLACE, MODEL_DIR_WIN, PMUPlaceModel, PMUWinModel

logger = logging.getLogger(__name__)

# Commission PMU (deductions legales)
PMU_COMMISSION_WIN = 0.15    # ~15% sur simple gagnant
PMU_COMMISSION_PLACE = 0.18  # ~18% sur simple place


class PMUBacktestEngine:
    """Simulate betting on PMU horse races historically."""

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
        markets: list[str] | None = None,      # ["simple_gagnant", "simple_place"]
        race_types: list[str] | None = None,   # ["plat", "trot_attele", "obstacle"]
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
        self.markets = markets or ["simple_gagnant"]
        self.race_types = race_types  # None = tous les types

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, races_df: pd.DataFrame, runners_df: pd.DataFrame) -> dict:
        """Run walk-forward backtest on PMU race data.

        Args:
            races_df: DataFrame avec une ligne par course (colonnes PMURace).
            runners_df: DataFrame avec une ligne par partant (colonnes PMURunner).
        """
        logger.info("Building PMU features...")
        builder = PMUFeatureBuilder()
        features_df = builder.build_dataset(races_df, runners_df, progress=False)

        if features_df.empty:
            return {"bets": [], "initial_bankroll": self.initial_bankroll, "config": self._config()}

        # Filtre par type de course
        if self.race_types:
            features_df = features_df[features_df["race_id"].isin(
                _filter_race_ids_by_type(races_df, self.race_types)
            )]
            if features_df.empty:
                return {"bets": [], "initial_bankroll": self.initial_bankroll, "config": self._config()}

        # Tri chronologique
        features_df = features_df.sort_values("race_date").reset_index(drop=True)

        # Train/test split: 80% / 20% chronologique
        n = len(features_df)
        split_idx = int(n * 0.80)
        train_df = features_df.iloc[:split_idx]
        test_df = features_df.iloc[split_idx:].reset_index(drop=True)

        if train_df.empty or test_df.empty:
            logger.warning("Not enough data for train/test split")
            return {"bets": [], "initial_bankroll": self.initial_bankroll, "config": self._config()}

        X_train = train_df[PMU_FEATURE_COLUMNS].values.astype(float)
        y_train_win = train_df["target_win"].values
        y_train_place = train_df["target_place"].values
        X_test = test_df[PMU_FEATURE_COLUMNS].values.astype(float)

        # Imputation NaN par mediane du train
        col_medians = np.nanmedian(X_train, axis=0)
        for col_idx in range(X_train.shape[1]):
            mask_train = np.isnan(X_train[:, col_idx])
            mask_test = np.isnan(X_test[:, col_idx])
            X_train[mask_train, col_idx] = col_medians[col_idx]
            X_test[mask_test, col_idx] = col_medians[col_idx]

        logger.info(
            "Training PMU models — Train: %d runners, Test: %d runners",
            len(X_train), len(X_test),
        )

        # Charger ou entrainer les modeles
        win_model = self._load_or_train_win(X_train, y_train_win)
        place_model = self._load_or_train_place(X_train, y_train_place)

        # Predictions sur le test set
        proba_win = win_model.predict_proba(X_test)
        proba_place = place_model.predict_proba(X_test)

        bets = self._simulate(test_df, proba_win, proba_place, races_df)

        wins = sum(1 for b in bets if b["won"])
        total_pnl = sum(b["pnl"] for b in bets)
        logger.info("PMU backtest — Bets: %d, Wins: %d, PnL: %+.2f", len(bets), wins, total_pnl)

        return {
            "bets": bets,
            "initial_bankroll": self.initial_bankroll,
            "config": self._config(),
        }

    # ------------------------------------------------------------------
    # Training helpers
    # ------------------------------------------------------------------

    def _load_or_train_win(self, X_train: np.ndarray, y_train: np.ndarray) -> PMUWinModel:
        model = PMUWinModel()
        if MODEL_DIR_WIN.exists() and (MODEL_DIR_WIN / "model.joblib").exists():
            try:
                model.load(MODEL_DIR_WIN)
                logger.info("PMU win model loaded from %s", MODEL_DIR_WIN)
                return model
            except Exception as exc:
                logger.warning("Failed to load PMU win model: %s — retraining", exc)
        model.train(X_train, y_train)
        return model

    def _load_or_train_place(self, X_train: np.ndarray, y_train: np.ndarray) -> PMUPlaceModel:
        model = PMUPlaceModel()
        if MODEL_DIR_PLACE.exists() and (MODEL_DIR_PLACE / "model.joblib").exists():
            try:
                model.load(MODEL_DIR_PLACE)
                logger.info("PMU place model loaded from %s", MODEL_DIR_PLACE)
                return model
            except Exception as exc:
                logger.warning("Failed to load PMU place model: %s — retraining", exc)
        model.train(X_train, y_train)
        return model

    # ------------------------------------------------------------------
    # Simulation
    # ------------------------------------------------------------------

    def _simulate(
        self,
        test_df: pd.DataFrame,
        proba_win: np.ndarray,
        proba_place: np.ndarray,
        races_df: pd.DataFrame,
    ) -> list[dict]:
        """Simulate pari PMU sur chaque course du test set."""
        bets: list[dict] = []
        bankroll = self.initial_bankroll

        # Index des courses pour retrouver les metadonnees
        races_by_id = {}
        for _, r in races_df.iterrows():
            races_by_id[r.get("id")] = r

        current_day: str | None = None
        day_pnl = 0.0
        bankroll_start_of_day = bankroll
        daily_stopped = False

        # Grouper les partants par course pour identifier gagnant/places
        # On itere course par course en preservant l'ordre chronologique
        grouped_races = test_df.groupby("race_id", sort=False)
        race_ids_ordered = list(dict.fromkeys(test_df["race_id"].tolist()))

        for race_id in race_ids_ordered:
            if self._check_stop_loss_total(bankroll):
                break

            race_runners = grouped_races.get_group(race_id)
            race_indices = race_runners.index.tolist()

            if race_runners.empty:
                continue

            first_row = race_runners.iloc[0]
            race_date = str(first_row.get("race_date", ""))[:10]

            # Reset daily tracking
            if race_date != current_day:
                current_day = race_date
                day_pnl = 0.0
                bankroll_start_of_day = bankroll
                daily_stopped = False

            if daily_stopped:
                continue

            # Metadonnees de la course
            race_meta = races_by_id.get(first_row.get("race_pk"))
            hippodrome = str(first_row.get("hippodrome") or (race_meta.get("hippodrome") if race_meta is not None else "?"))
            race_type = str(first_row.get("race_type") or "")
            num_runners_race = int(first_row.get("num_runners") or len(race_runners))

            # Seuil place: top 3 si <=12 partants, sinon top (num/4)
            place_threshold = 3 if num_runners_race <= 12 else max(3, num_runners_race // 4)

            # Construire les candidats par marche
            candidates: list[dict] = []

            for row_i, row in race_runners.iterrows():
                idx = race_indices.index(row_i)
                horse = str(row.get("horse_name") or "")
                odds_raw = row.get("_odds_final")
                try:
                    odds_final = float(odds_raw) if odds_raw is not None else None
                except (TypeError, ValueError):
                    odds_final = None

                finish = row.get("finish_position")
                try:
                    finish_pos = int(float(finish)) if finish is not None else None
                except (TypeError, ValueError):
                    finish_pos = None

                # Simple gagnant
                if "simple_gagnant" in self.markets and odds_final and odds_final > 1.0:
                    model_p = float(proba_win[idx])
                    implied_p = 1.0 / odds_final
                    edge = model_p - implied_p

                    if self._passes_filters(model_p, odds_final, edge):
                        # Cote nette apres commission PMU
                        net_odds = odds_final * (1.0 - PMU_COMMISSION_WIN)
                        actual_won = finish_pos == 1
                        candidates.append({
                            "market": "simple_gagnant",
                            "horse": horse,
                            "model_prob": model_p,
                            "odds": odds_final,
                            "net_odds": net_odds,
                            "edge": edge,
                            "won": actual_won,
                        })

                # Simple place
                if "simple_place" in self.markets and odds_final and odds_final > 1.0:
                    model_p = float(proba_place[idx])
                    # Les cotes place PMU = environ odds_win / 4 (approximation)
                    place_odds = max(1.05, odds_final / 4.0)
                    implied_p = 1.0 / place_odds
                    edge = model_p - implied_p

                    if self._passes_filters(model_p, place_odds, edge):
                        net_odds = place_odds * (1.0 - PMU_COMMISSION_PLACE)
                        actual_won = finish_pos is not None and finish_pos <= place_threshold
                        candidates.append({
                            "market": "simple_place",
                            "horse": horse,
                            "model_prob": model_p,
                            "odds": place_odds,
                            "net_odds": net_odds,
                            "edge": edge,
                            "won": actual_won,
                        })

            if not candidates:
                continue

            # Meilleur edge parmi les candidats
            best = max(candidates, key=lambda x: x["edge"])
            stake = self._compute_stake(bankroll, best["model_prob"], best["net_odds"])
            if stake <= 0:
                continue

            # PnL: gains nets apres commission si gagne, sinon -stake
            if best["won"]:
                pnl = stake * (best["net_odds"] - 1.0)
            else:
                pnl = -stake

            bankroll += pnl
            day_pnl += pnl

            bets.append({
                "date": race_date,
                "match": f"{hippodrome} — Course {first_row.get('race_id', race_id)}",
                "league": hippodrome,
                "outcome_bet": best["horse"],
                "market": best["market"],
                "race_type": race_type,
                "model_prob": round(best["model_prob"], 4),
                "odds": round(best["odds"], 2),
                "stake": round(stake, 2),
                "stake_pct": round(float(stake / (bankroll - pnl)) if (bankroll - pnl) > 0 else 0, 4),
                "won": best["won"],
                "pnl": round(pnl, 2),
                "bankroll_after": round(bankroll, 2),
                "edge": round(best["edge"], 4),
            })

            if self._check_stop_loss_daily(day_pnl, bankroll_start_of_day):
                daily_stopped = True

        return bets

    # ------------------------------------------------------------------
    # Staking
    # ------------------------------------------------------------------

    def _compute_stake(self, bankroll: float, model_prob: float, net_odds: float) -> float:
        if net_odds <= 1.0:
            return 0.0
        if self.staking_strategy == "flat":
            amount = self.flat_stake_amount or 10.0
            return min(amount, bankroll * self.max_stake_pct)
        if self.staking_strategy == "pct_bankroll":
            return bankroll * self.pct_bankroll
        if self.staking_strategy in ("half_kelly", "kelly_dynamic"):
            fraction = self.kelly_fraction
            if self.staking_strategy == "kelly_dynamic":
                fraction = self.kelly_fraction * min(model_prob / 0.20, 1.5)
            b = net_odds - 1.0
            p = model_prob
            q = 1.0 - p
            if b <= 0:
                return 0.0
            full_kelly = (b * p - q) / b
            if full_kelly <= 0:
                return 0.0
            stake_pct = min(full_kelly * fraction, self.max_stake_pct)
            return bankroll * stake_pct
        return bankroll * self.pct_bankroll

    def _passes_filters(self, model_prob: float, odds: float, edge: float) -> bool:
        if edge <= self.min_edge:
            return False
        if self.min_model_prob is not None and model_prob < self.min_model_prob:
            return False
        if self.max_odds is not None and odds > self.max_odds:
            return False
        if self.min_odds is not None and odds < self.min_odds:
            return False
        return True

    # ------------------------------------------------------------------
    # Stop loss helpers
    # ------------------------------------------------------------------

    def _check_stop_loss_total(self, bankroll: float) -> bool:
        if self.stop_loss_total_pct is None:
            return False
        return (self.initial_bankroll - bankroll) / self.initial_bankroll >= self.stop_loss_total_pct

    def _check_stop_loss_daily(self, day_pnl: float, bankroll_start_of_day: float) -> bool:
        if self.stop_loss_daily_pct is None or bankroll_start_of_day <= 0:
            return False
        return (-day_pnl / bankroll_start_of_day) >= self.stop_loss_daily_pct

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------

    def _config(self) -> dict:
        return {
            "staking_strategy": self.staking_strategy,
            "min_edge": self.min_edge,
            "initial_bankroll": self.initial_bankroll,
            "markets": self.markets,
            "race_types": self.race_types,
            "commission_gagnant": PMU_COMMISSION_WIN,
            "commission_place": PMU_COMMISSION_PLACE,
            "train_test_split": "80/20 chronologique",
        }


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _filter_race_ids_by_type(races_df: pd.DataFrame, race_types: list[str]) -> set:
    """Retourne les IDs (int) de courses dont le type est dans race_types."""
    race_types_lower = {rt.lower() for rt in race_types}
    mask = races_df["race_type"].str.lower().isin(race_types_lower)
    return set(races_df.loc[mask, "id"].tolist())
