"""Combo (accumulator) bet engine: generate and evaluate combined bets."""

from dataclasses import dataclass, field
from itertools import combinations


@dataclass
class ComboLeg:
    """A single leg in a combo bet."""

    match: str  # "Home vs Away"
    league: str
    date: str
    outcome: str  # "H", "D", "A"
    odds: float
    model_prob: float
    implied_prob: float
    edge: float
    won: bool = False


@dataclass
class Combo:
    """A combined (accumulator) bet."""

    legs: list[ComboLeg] = field(default_factory=list)
    combined_odds: float = 0.0
    combined_prob: float = 0.0
    ev: float = 0.0  # expected value = combined_prob * combined_odds - 1
    stake: float = 0.0
    pnl: float = 0.0
    won: bool = False

    @property
    def num_legs(self) -> int:
        return len(self.legs)

    @property
    def potential_gain(self) -> float:
        return self.stake * (self.combined_odds - 1) if self.stake > 0 else 0.0


class ComboEngine:
    """Generate and evaluate combo (accumulator) bets."""

    def __init__(
        self,
        max_legs: int = 4,
        min_combo_odds: float = 1.8,
        max_combo_odds: float = 3.0,
        min_leg_prob: float = 0.50,
    ):
        self.max_legs = max_legs
        self.min_combo_odds = min_combo_odds
        self.max_combo_odds = max_combo_odds
        self.min_leg_prob = min_leg_prob

    def generate_combos(self, legs: list[ComboLeg]) -> list[Combo]:
        """Generate all valid combos from a list of candidate legs.

        Rules:
        - Max 1 leg per match (enforced by caller or dedup here)
        - Combined odds must be in [min_combo_odds, max_combo_odds]
        - Each leg must have model_prob >= min_leg_prob
        - Combo sizes from 2 to max_legs
        """
        # Filter legs by minimum probability
        valid_legs = [l for l in legs if l.model_prob >= self.min_leg_prob]

        if len(valid_legs) < 2:
            return []

        # Deduplicate: max 1 leg per match
        seen_matches = {}
        unique_legs = []
        for leg in valid_legs:
            if leg.match not in seen_matches:
                seen_matches[leg.match] = leg
                unique_legs.append(leg)

        combos = []
        max_k = min(self.max_legs, len(unique_legs))

        for k in range(2, max_k + 1):
            for combo_legs in combinations(unique_legs, k):
                combined_odds = 1.0
                combined_prob = 1.0

                for leg in combo_legs:
                    combined_odds *= leg.odds
                    combined_prob *= leg.model_prob

                # Filter by combo odds range
                if combined_odds < self.min_combo_odds:
                    continue
                if combined_odds > self.max_combo_odds:
                    continue

                ev = combined_prob * combined_odds - 1.0

                combo = Combo(
                    legs=list(combo_legs),
                    combined_odds=round(combined_odds, 3),
                    combined_prob=round(combined_prob, 4),
                    ev=round(ev, 4),
                )
                combos.append(combo)

        return combos

    def rank_combos(self, combos: list[Combo], top_n: int = 10) -> list[Combo]:
        """Rank combos by EV descending, return top N."""
        combos.sort(key=lambda c: c.ev, reverse=True)
        return combos[:top_n]

    def resolve_combo(self, combo: Combo) -> Combo:
        """Resolve a combo: won only if ALL legs won."""
        combo.won = all(leg.won for leg in combo.legs)
        if combo.won:
            combo.pnl = round(combo.stake * (combo.combined_odds - 1), 2)
        else:
            combo.pnl = round(-combo.stake, 2)
        return combo
