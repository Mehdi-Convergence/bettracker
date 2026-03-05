"""Poisson-based goals model for deriving probabilities across all markets.

Uses team attack/defense strengths to estimate expected goals (lambdas),
then derives probabilities for Over/Under, BTTS, Correct Score, etc.
"""

import math
from functools import lru_cache


def _poisson_pmf(k: int, lam: float) -> float:
    """Poisson probability mass function: P(X=k) given lambda."""
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return (lam ** k) * math.exp(-lam) / math.factorial(k)


@lru_cache(maxsize=256)
def _poisson_pmf_cached(k: int, lam_x100: int) -> float:
    """Cached Poisson PMF (lambda stored as int*100 for hashability)."""
    return _poisson_pmf(k, lam_x100 / 100.0)


class PoissonGoalsModel:
    """Estimate goal probabilities using Poisson distribution.

    Given lambda_home and lambda_away (expected goals),
    derives probabilities for all common betting markets.
    """

    MAX_GOALS = 8  # Consider scores up to 8-8

    def predict_goals(
        self,
        home_attack: float,
        home_defense: float,
        away_attack: float,
        away_defense: float,
        league_avg_home: float = 1.45,
        league_avg_away: float = 1.15,
    ) -> tuple[float, float]:
        """Estimate expected goals for each team.

        Args:
            home_attack: Home team's avg goals scored (last 5 matches)
            home_defense: Home team's avg goals conceded (last 5 matches)
            away_attack: Away team's avg goals scored (last 5 matches)
            away_defense: Away team's avg goals conceded (last 5 matches)
            league_avg_home: League average home goals per match
            league_avg_away: League average away goals per match

        Returns:
            (lambda_home, lambda_away) - expected goals for each team.
        """
        # Attack strength = team's scoring rate / league avg
        # Defense strength = team's conceding rate / league avg
        home_att_str = home_attack / league_avg_home if league_avg_home > 0 else 1.0
        away_def_str = away_defense / league_avg_home if league_avg_home > 0 else 1.0
        away_att_str = away_attack / league_avg_away if league_avg_away > 0 else 1.0
        home_def_str = home_defense / league_avg_away if league_avg_away > 0 else 1.0

        # Expected goals = attack_strength * opponent_defense_strength * league_avg
        lambda_home = home_att_str * away_def_str * league_avg_home
        lambda_away = away_att_str * home_def_str * league_avg_away

        # Clamp to reasonable range
        lambda_home = max(0.2, min(4.5, lambda_home))
        lambda_away = max(0.2, min(4.5, lambda_away))

        return round(lambda_home, 3), round(lambda_away, 3)

    def predict_from_features(
        self,
        home_goals_scored_avg: float,
        home_goals_conceded_avg: float,
        away_goals_scored_avg: float,
        away_goals_conceded_avg: float,
    ) -> tuple[float, float]:
        """Simplified interface using just goal averages."""
        return self.predict_goals(
            home_attack=home_goals_scored_avg,
            home_defense=home_goals_conceded_avg,
            away_attack=away_goals_scored_avg,
            away_defense=away_goals_conceded_avg,
        )

    def get_score_matrix(
        self, lambda_h: float, lambda_a: float
    ) -> list[list[float]]:
        """Compute probability matrix P(home=i, away=j).

        Returns a (MAX_GOALS+1) x (MAX_GOALS+1) matrix.
        """
        lh = int(round(lambda_h * 100))
        la = int(round(lambda_a * 100))
        matrix = []
        for i in range(self.MAX_GOALS + 1):
            row = []
            for j in range(self.MAX_GOALS + 1):
                p = _poisson_pmf_cached(i, lh) * _poisson_pmf_cached(j, la)
                row.append(p)
            matrix.append(row)
        return matrix

    def get_all_market_probs(
        self, lambda_h: float, lambda_a: float
    ) -> dict[str, dict[str, float]]:
        """Compute probabilities for all markets from expected goals.

        Returns dict: market_type -> {selection_name: probability}
        """
        matrix = self.get_score_matrix(lambda_h, lambda_a)
        n = self.MAX_GOALS + 1

        # --- 1X2 ---
        p_home = sum(matrix[i][j] for i in range(n) for j in range(n) if i > j)
        p_draw = sum(matrix[i][i] for i in range(n))
        p_away = sum(matrix[i][j] for i in range(n) for j in range(n) if i < j)
        total_1x2 = p_home + p_draw + p_away
        if total_1x2 > 0:
            p_home /= total_1x2
            p_draw /= total_1x2
            p_away /= total_1x2

        result: dict[str, dict[str, float]] = {
            "1x2": {
                "H": round(p_home, 4),
                "D": round(p_draw, 4),
                "A": round(p_away, 4),
            },
        }

        # --- Double Chance ---
        result["double_chance"] = {
            "1X": round(p_home + p_draw, 4),
            "12": round(p_home + p_away, 4),
            "X2": round(p_draw + p_away, 4),
        }

        # --- Over/Under ---
        for line in [0.5, 1.5, 2.5, 3.5, 4.5]:
            p_under = sum(
                matrix[i][j]
                for i in range(n)
                for j in range(n)
                if (i + j) < line
            )
            p_over = 1.0 - p_under
            key = f"over_under_{line}"
            result[key] = {
                f"O{line}": round(p_over, 4),
                f"U{line}": round(p_under, 4),
            }

        # --- BTTS ---
        p_no_home = sum(matrix[0][j] for j in range(n))
        p_no_away = sum(matrix[i][0] for i in range(n))
        p_btts_yes = 1.0 - p_no_home - p_no_away + matrix[0][0]
        result["btts"] = {
            "Oui": round(p_btts_yes, 4),
            "Non": round(1.0 - p_btts_yes, 4),
        }

        # --- Correct Score (top 12 most likely) ---
        scores = []
        for i in range(min(5, n)):
            for j in range(min(5, n)):
                scores.append((f"{i} - {j}", matrix[i][j]))
        scores.sort(key=lambda x: x[1], reverse=True)
        result["correct_score"] = {
            s[0]: round(s[1], 4) for s in scores[:12]
        }

        # --- Half-Time result (approximate: use lambda/2) ---
        ht_h = lambda_h / 2
        ht_a = lambda_a / 2
        ht_matrix = []
        lhh = int(round(ht_h * 100))
        lha = int(round(ht_a * 100))
        for i in range(4):
            row = []
            for j in range(4):
                p = _poisson_pmf_cached(i, lhh) * _poisson_pmf_cached(j, lha)
                row.append(p)
            ht_matrix.append(row)
        p_ht_home = sum(ht_matrix[i][j] for i in range(4) for j in range(4) if i > j)
        p_ht_draw = sum(ht_matrix[i][i] for i in range(4))
        p_ht_away = sum(ht_matrix[i][j] for i in range(4) for j in range(4) if i < j)
        ht_total = p_ht_home + p_ht_draw + p_ht_away
        if ht_total > 0:
            p_ht_home /= ht_total
            p_ht_draw /= ht_total
            p_ht_away /= ht_total
        result["half_time_result"] = {
            "H": round(p_ht_home, 4),
            "D": round(p_ht_draw, 4),
            "A": round(p_ht_away, 4),
        }

        # --- Team totals ---
        for team_label, lam in [("home", lambda_h), ("away", lambda_a)]:
            lam_int = int(round(lam * 100))
            for line in [0.5, 1.5, 2.5]:
                p_under = sum(
                    _poisson_pmf_cached(k, lam_int)
                    for k in range(int(line))
                )
                key = f"team_total_{team_label}_{line}"
                result[key] = {
                    f"O{line}": round(1.0 - p_under, 4),
                    f"U{line}": round(p_under, 4),
                }

        # --- Goal margin ---
        margins = {}
        for i in range(n):
            for j in range(n):
                diff = i - j
                key = f"home_+{diff}" if diff >= 0 else f"away_+{abs(diff)}"
                if diff == 0:
                    key = "draw"
                margins[key] = margins.get(key, 0.0) + matrix[i][j]
        result["goal_margin"] = {k: round(v, 4) for k, v in sorted(
            margins.items(), key=lambda x: x[1], reverse=True
        )[:8]}

        return result
