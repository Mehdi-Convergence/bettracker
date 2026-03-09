import math

import pandas as pd

from src.config import settings


class EloRatingSystem:
    """ELO rating system adapted for football.

    - Home advantage: home team gets a rating boost
    - Margin of victory: bigger wins cause bigger rating changes
    - Ratings built chronologically from historical data
    """

    def __init__(
        self,
        k_factor: float = settings.ELO_K_FACTOR,
        home_advantage: float = settings.ELO_HOME_ADVANTAGE,
        initial_rating: float = settings.ELO_INITIAL,
    ):
        self.k = k_factor
        self.home_adv = home_advantage
        self.initial = initial_rating
        self.ratings: dict[str, float] = {}

    def get_rating(self, team: str) -> float:
        return self.ratings.get(team, self.initial)

    def expected_score(self, rating_a: float, rating_b: float, is_home: bool = False) -> float:
        """Expected score for team A vs team B."""
        diff = rating_b - rating_a
        if is_home:
            diff -= self.home_adv
        return 1.0 / (1.0 + 10 ** (diff / 400.0))

    def update(
        self,
        home_team: str,
        away_team: str,
        result: float,
        goal_diff: int = 0,
    ):
        """Update ratings after a match.

        result: 1.0 = home win, 0.5 = draw, 0.0 = away win
        goal_diff: absolute goal difference
        """
        home_r = self.get_rating(home_team)
        away_r = self.get_rating(away_team)

        expected_home = self.expected_score(home_r, away_r, is_home=True)

        # Margin of victory multiplier
        margin_mult = max(1.0, math.sqrt(1 + abs(goal_diff)))

        self.ratings[home_team] = home_r + self.k * margin_mult * (result - expected_home)
        self.ratings[away_team] = away_r + self.k * margin_mult * ((1 - result) - (1 - expected_home))

    def build_from_matches(self, matches_df: pd.DataFrame):
        """Process all historical matches chronologically to build ratings."""
        result_map = {"H": 1.0, "D": 0.5, "A": 0.0}

        matches_sorted = matches_df.sort_values("date").reset_index(drop=True)

        for _, match in matches_sorted.iterrows():
            result = result_map.get(match["ftr"], 0.5)
            goal_diff = abs(int(match["fthg"]) - int(match["ftag"]))
            self.update(match["home_team"], match["away_team"], result, goal_diff)

    def get_ratings_at_date(self, matches_df: pd.DataFrame, target_date) -> "EloRatingSystem":
        """Build ratings using only matches before target_date."""
        past = matches_df[matches_df["date"] < target_date]
        elo = EloRatingSystem(self.k, self.home_adv, self.initial)
        elo.build_from_matches(past)
        return elo
