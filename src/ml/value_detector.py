"""Value bet detection: compare model probabilities to market odds."""

from dataclasses import dataclass

import numpy as np

from src.config import settings


@dataclass
class ValueBet:
    """A detected value bet opportunity."""

    match_id: int | None
    home_team: str
    away_team: str
    league: str
    date: str
    outcome: str  # "H", "D", "A"
    model_prob: float
    implied_prob: float
    edge: float  # model_prob - implied_prob
    best_odds: float
    bookmaker: str  # which bookmaker has best odds
    pinnacle_odds: float | None


@dataclass
class MatchOutcomes:
    """All 3 outcomes for a match with model analysis."""

    match_id: int | None
    home_team: str
    away_team: str
    league: str
    date: str
    outcomes: dict  # "H"/"D"/"A" → {model_prob, implied_prob, edge, best_odds, bookmaker, is_value}
    best_value_outcome: str | None
    best_edge: float


class ValueDetector:
    """Detect value bets by comparing model predictions to live odds."""

    def __init__(
        self,
        min_edge: float = settings.MIN_EDGE_THRESHOLD,
        allowed_outcomes: list[str] | None = None,
        excluded_leagues: list[str] | None = None,
    ):
        self.min_edge = min_edge
        self.allowed_outcomes = allowed_outcomes or settings.ALLOWED_OUTCOMES
        self.excluded_leagues = excluded_leagues or settings.EXCLUDED_LEAGUES

    def detect(
        self,
        match_info: dict,
        model_proba: np.ndarray,
        odds_data: dict,
    ) -> ValueBet | None:
        """Check if a match has a value bet.

        Args:
            match_info: dict with home_team, away_team, league, date, match_id
            model_proba: array [P(H), P(D), P(A)] from the model
            odds_data: dict with structure:
                {
                    "H": {"pinnacle": 1.85, "bet365": 1.90, ...},
                    "D": {"pinnacle": 3.40, "bet365": 3.50, ...},
                    "A": {"pinnacle": 4.20, "bet365": 4.00, ...},
                }

        Returns:
            ValueBet if edge found above threshold, None otherwise.
        """
        if match_info.get("league") in self.excluded_leagues:
            return None

        outcome_map = {"H": 0, "D": 1, "A": 2}
        best_value = None
        best_edge = 0.0

        for outcome in self.allowed_outcomes:
            idx = outcome_map[outcome]
            model_prob = float(model_proba[idx])

            outcome_odds = odds_data.get(outcome, {})
            if not outcome_odds:
                continue

            # Find best available odds across all bookmakers
            best_odds = 0.0
            best_bookmaker = ""
            for bookmaker, odds in outcome_odds.items():
                if odds and odds > best_odds:
                    best_odds = odds
                    best_bookmaker = bookmaker

            if best_odds <= 1.0:
                continue

            # Edge is calculated vs the BEST available odds
            # (we're asking: even at the best price, is there value?)
            implied_prob = 1.0 / best_odds
            edge = model_prob - implied_prob

            if edge > self.min_edge and edge > best_edge:
                best_edge = edge
                pinnacle_odds = outcome_odds.get("pinnacle")
                best_value = ValueBet(
                    match_id=match_info.get("match_id"),
                    home_team=match_info["home_team"],
                    away_team=match_info["away_team"],
                    league=match_info["league"],
                    date=match_info["date"],
                    outcome=outcome,
                    model_prob=round(model_prob, 4),
                    implied_prob=round(implied_prob, 4),
                    edge=round(edge, 4),
                    best_odds=best_odds,
                    bookmaker=best_bookmaker,
                    pinnacle_odds=pinnacle_odds,
                )

        return best_value

    def detect_all(
        self,
        match_info: dict,
        model_proba: np.ndarray,
        odds_data: dict,
    ) -> "MatchOutcomes":
        """Compute model vs market for ALL 3 outcomes of a match."""
        outcome_map = {"H": 0, "D": 1, "A": 2}
        outcomes = {}
        best_value_outcome = None
        best_edge = 0.0

        for outcome in ["H", "D", "A"]:
            idx = outcome_map[outcome]
            model_prob = float(model_proba[idx])
            outcome_odds = odds_data.get(outcome, {})

            bo = 0.0
            bb = ""
            for bookmaker, odds in outcome_odds.items():
                if odds and odds > bo:
                    bo = odds
                    bb = bookmaker

            # Build all_odds dict (bookmaker → odds)
            all_odds = {bk: o for bk, o in outcome_odds.items() if o and o > 1.0}

            if bo <= 1.0:
                outcomes[outcome] = {
                    "model_prob": round(model_prob, 4),
                    "implied_prob": 0.0,
                    "edge": 0.0,
                    "best_odds": 0.0,
                    "best_bookmaker": "",
                    "all_odds": all_odds,
                    "is_value": False,
                }
                continue

            implied_prob = 1.0 / bo
            edge = model_prob - implied_prob
            is_value = edge > self.min_edge

            outcomes[outcome] = {
                "model_prob": round(model_prob, 4),
                "implied_prob": round(implied_prob, 4),
                "edge": round(edge, 4),
                "best_odds": bo,
                "best_bookmaker": bb,
                "all_odds": all_odds,
                "is_value": is_value,
            }

            if is_value and edge > best_edge:
                best_edge = edge
                best_value_outcome = outcome

        return MatchOutcomes(
            match_id=match_info.get("match_id"),
            home_team=match_info["home_team"],
            away_team=match_info["away_team"],
            league=match_info["league"],
            date=match_info.get("date", ""),
            outcomes=outcomes,
            best_value_outcome=best_value_outcome,
            best_edge=round(best_edge, 4),
        )

    def detect_all_batch(
        self,
        matches: list[dict],
        probas: np.ndarray,
        odds_list: list[dict],
    ) -> list["MatchOutcomes"]:
        """Detect all outcomes for multiple matches."""
        results = []
        for match_info, proba, odds_data in zip(matches, probas, odds_list):
            mo = self.detect_all(match_info, proba, odds_data)
            results.append(mo)
        results.sort(key=lambda x: x.best_edge, reverse=True)
        return results

    def detect_batch(
        self,
        matches: list[dict],
        probas: np.ndarray,
        odds_list: list[dict],
    ) -> list[ValueBet]:
        """Detect value bets for multiple matches at once."""
        value_bets = []
        for match_info, proba, odds_data in zip(matches, probas, odds_list):
            vb = self.detect(match_info, proba, odds_data)
            if vb is not None:
                value_bets.append(vb)

        # Sort by edge descending
        value_bets.sort(key=lambda x: x.edge, reverse=True)
        return value_bets
