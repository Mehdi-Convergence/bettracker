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

    def apply_season_decay(self, decay: float = 0.33):
        """Regression-to-mean between seasons.

        Each rating is pulled 33% toward 1500 to reflect squad changes,
        transfers, and coaching changes over the summer break.

        Formula: new_rating = rating + decay * (1500 - rating)

        This is applied once per season transition, BEFORE the first match
        of the new season is processed.
        """
        for team in self.ratings:
            self.ratings[team] = self.ratings[team] + decay * (self.initial - self.ratings[team])

    def build_from_matches(self, matches_df: pd.DataFrame, apply_season_decay: bool = True):
        """Process all historical matches chronologically to build ratings.

        Parameters
        ----------
        matches_df:
            DataFrame with at least columns: date, home_team, away_team,
            ftr (H/D/A), fthg, ftag. If the column 'season' is present,
            a regression-to-mean decay is applied at each season transition.
        apply_season_decay:
            When True (default), retract all ratings toward 1500 by 33%
            at the start of each new season. Set to False to reproduce
            the old behavior without decay.
        """
        result_map = {"H": 1.0, "D": 0.5, "A": 0.0}

        matches_sorted = matches_df.sort_values("date").reset_index(drop=True)

        has_season = "season" in matches_sorted.columns
        current_season = None

        for _, match in matches_sorted.iterrows():
            # Season decay: apply when season changes (football only)
            if apply_season_decay and has_season:
                match_season = match.get("season")
                if match_season is not None and match_season != current_season:
                    if current_season is not None:
                        # New season detected — pull all ratings toward 1500
                        self.apply_season_decay()
                    current_season = match_season

            result = result_map.get(match["ftr"], 0.5)
            goal_diff = abs(int(match["fthg"]) - int(match["ftag"]))
            self.update(match["home_team"], match["away_team"], result, goal_diff)

    def get_ratings_at_date(self, matches_df: pd.DataFrame, target_date) -> "EloRatingSystem":
        """Build ratings using only matches before target_date."""
        past = matches_df[matches_df["date"] < target_date]
        elo = EloRatingSystem(self.k, self.home_adv, self.initial)
        elo.build_from_matches(past)
        return elo
