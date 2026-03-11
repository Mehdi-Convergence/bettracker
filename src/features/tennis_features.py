"""Tennis feature engineering.

CRITICAL: All features use only data BEFORE the match date. No look-ahead bias.

Convention for training dataset:
  - p1 / p2 are randomly assigned (50% flip) so the model never learns "p1 always wins".
  - target = 1 if p1 won, 0 if p2 won.

Features (all computed from historical data prior to the match):
  - ELO ratings (global + surface-specific)
  - Win rate on surface (last N matches)
  - Form (win rate last N matches overall)
  - H2H overall + H2H on same surface
  - ATP ranking (from CSV WRank/LRank)
  - Rest days
  - Win streak
  - Set efficiency (avg sets won/played in recent matches)
  - Upset potential (rank ratio)
  - Implied probability from opening odds
  - Bookmaker vig
"""

import random
from collections import defaultdict

import numpy as np
import pandas as pd

from src.features.elo import EloRatingSystem

_INITIAL_ELO = 1500.0
_MIN_HISTORY = 5  # minimum matches needed before building features


class TennisFeatureBuilder:
    """Build feature vectors for tennis match prediction."""

    def __init__(self, seed: int = 42):
        self.elo_global = EloRatingSystem(k_factor=32, home_advantage=0)
        self.elo_surface: dict[str, EloRatingSystem] = {}  # surface -> EloSystem
        self._rng = random.Random(seed)

    def build_dataset(self, matches_df: pd.DataFrame, progress: bool = True) -> pd.DataFrame:
        """Build feature dataset for all matches chronologically.

        Each row is one match with features from BEFORE the match date.
        p1/p2 roles are randomly assigned (50% flip) so target is not trivially 1.
        """
        matches_sorted = matches_df.sort_values("date").reset_index(drop=True)
        features_list = []

        # Incremental caches: player -> list of match dicts (chronological)
        player_history: dict[str, list[dict]] = defaultdict(list)
        player_surface_history: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))

        total = len(matches_sorted)
        log_interval = max(total // 20, 1)

        for idx, match in matches_sorted.iterrows():
            if progress and idx % log_interval == 0:
                print(f"  Processing match {idx}/{total} ({idx * 100 // total}%)")

            winner = match["winner"]
            loser = match["loser"]
            surface = match.get("surface") or "Unknown"

            # Skip if not enough history for both players
            if len(player_history[winner]) < _MIN_HISTORY or len(player_history[loser]) < _MIN_HISTORY:
                self._update_caches(match, player_history, player_surface_history)
                continue

            # Randomly assign p1/p2 to avoid trivial target
            if self._rng.random() < 0.5:
                p1, p2, target = winner, loser, 1
            else:
                p1, p2, target = loser, winner, 0

            features = self._build_features(
                match, p1, p2, surface,
                player_history, player_surface_history
            )
            features["target"] = target
            features["date"] = match["date"]
            features["year"] = match.get("year")
            features["tournament"] = match.get("tournament")
            features["surface"] = surface
            features["series"] = match.get("series")
            features["round"] = match.get("round")
            features["winner"] = winner
            features["loser"] = loser
            features["p1"] = p1
            features["p2"] = p2
            features["match_id"] = match.get("id")
            # Odds (from perspective of p1 winning)
            if p1 == winner:
                features["_odds_p1"] = match.get("odds_winner")
                features["_odds_p2"] = match.get("odds_loser")
                features["_max_odds_p1"] = match.get("max_odds_winner")
                features["_max_odds_p2"] = match.get("max_odds_loser")
                features["_avg_odds_p1"] = match.get("avg_odds_winner")
                features["_avg_odds_p2"] = match.get("avg_odds_loser")
            else:
                features["_odds_p1"] = match.get("odds_loser")
                features["_odds_p2"] = match.get("odds_winner")
                features["_max_odds_p1"] = match.get("max_odds_loser")
                features["_max_odds_p2"] = match.get("max_odds_winner")
                features["_avg_odds_p1"] = match.get("avg_odds_loser")
                features["_avg_odds_p2"] = match.get("avg_odds_winner")

            features_list.append(features)

            # Update caches AFTER feature extraction (no look-ahead)
            self._update_caches(match, player_history, player_surface_history)

        if progress:
            print(f"  Processing complete: {len(features_list)} feature vectors built")

        return pd.DataFrame(features_list)

    # ------------------------------------------------------------------
    # Feature builder
    # ------------------------------------------------------------------

    def _build_features(
        self,
        match,
        p1: str,
        p2: str,
        surface: str,
        player_history: dict,
        player_surface_history: dict,
    ) -> dict:
        features: dict = {}

        # 1. ELO (global)
        p1_elo = self.elo_global.get_rating(p1)
        p2_elo = self.elo_global.get_rating(p2)
        features["p1_elo"] = p1_elo
        features["p2_elo"] = p2_elo
        features["elo_diff"] = p1_elo - p2_elo

        # 2. ELO surface-specific
        elo_surf = self._get_surface_elo(surface)
        features["p1_elo_surface"] = elo_surf.get_rating(p1)
        features["p2_elo_surface"] = elo_surf.get_rating(p2)
        features["elo_surface_diff"] = features["p1_elo_surface"] - features["p2_elo_surface"]

        # 3. ATP ranking (most recent from match data)
        p1_rank = self._last_rank(p1, player_history[p1], is_winner=(match["winner"] == p1))
        p2_rank = self._last_rank(p2, player_history[p2], is_winner=(match["winner"] == p2))
        # Use current match rank if available
        if match["winner"] == p1:
            p1_rank = self._to_int(match.get("winner_rank")) or p1_rank
            p2_rank = self._to_int(match.get("loser_rank")) or p2_rank
        else:
            p1_rank = self._to_int(match.get("loser_rank")) or p1_rank
            p2_rank = self._to_int(match.get("winner_rank")) or p2_rank

        features["p1_rank"] = p1_rank if p1_rank else np.nan
        features["p2_rank"] = p2_rank if p2_rank else np.nan
        if p1_rank and p2_rank and p1_rank > 0 and p2_rank > 0:
            features["rank_diff"] = p1_rank - p2_rank  # negative = p1 is better ranked
            features["rank_ratio"] = p1_rank / p2_rank
        else:
            features["rank_diff"] = np.nan
            features["rank_ratio"] = np.nan

        # 4. Overall form (win rate last N)
        for n in [5, 10, 20]:
            features[f"p1_win_rate_{n}"] = self._win_rate(p1, player_history[p1], n)
            features[f"p2_win_rate_{n}"] = self._win_rate(p2, player_history[p2], n)

        # 5. Surface-specific win rate
        features["p1_surface_win_rate"] = self._win_rate(p1, player_surface_history[p1][surface], 10)
        features["p2_surface_win_rate"] = self._win_rate(p2, player_surface_history[p2][surface], 10)
        features["surface_win_rate_diff"] = features["p1_surface_win_rate"] - features["p2_surface_win_rate"]

        # 6. H2H (overall)
        h2h = self._h2h(p1, player_history[p1], 10)
        features["p1_h2h_win_rate"] = h2h["win_rate"]
        features["h2h_count"] = h2h["count"]

        # 7. H2H on same surface
        h2h_surf = self._h2h_surface(p1, player_surface_history[p1][surface], 6)
        features["p1_h2h_surface_win_rate"] = h2h_surf["win_rate"]
        features["h2h_surface_count"] = h2h_surf["count"]

        # 8. Rest days
        features["p1_rest_days"] = self._rest_days(p1, match["date"], player_history[p1])
        features["p2_rest_days"] = self._rest_days(p2, match["date"], player_history[p2])
        features["rest_diff"] = (features["p1_rest_days"] or 7) - (features["p2_rest_days"] or 7)

        # 9. Win/loss streak
        features["p1_streak"] = self._streak(p1, player_history[p1], 10)
        features["p2_streak"] = self._streak(p2, player_history[p2], 10)

        # 10. Set efficiency (avg sets won in last N matches)
        features["p1_sets_won_avg"] = self._avg_sets_won(p1, player_history[p1], 10)
        features["p2_sets_won_avg"] = self._avg_sets_won(p2, player_history[p2], 10)
        features["p1_sets_lost_avg"] = self._avg_sets_lost(p1, player_history[p1], 10)
        features["p2_sets_lost_avg"] = self._avg_sets_lost(p2, player_history[p2], 10)

        # 11. Dominance ratio (sets won / sets played)
        p1s = features["p1_sets_won_avg"]
        p1l = features["p1_sets_lost_avg"]
        p2s = features["p2_sets_won_avg"]
        p2l = features["p2_sets_lost_avg"]
        features["p1_set_dominance"] = p1s / max(0.01, p1s + p1l) if not (np.isnan(p1s) or np.isnan(p1l)) else np.nan
        features["p2_set_dominance"] = p2s / max(0.01, p2s + p2l) if not (np.isnan(p2s) or np.isnan(p2l)) else np.nan

        # 12. Series level encoding (Grand Slam=4, Masters=3, ATP500=2, ATP250=1, Other=0)
        features["series_level"] = _series_level(match.get("series"))

        # 13. Implied probability from odds
        odds_p1 = match.get("odds_winner") if p1 == match["winner"] else match.get("odds_loser")
        odds_p2 = match.get("odds_loser") if p1 == match["winner"] else match.get("odds_winner")
        if odds_p1 and odds_p2 and odds_p1 > 1 and odds_p2 > 1:
            total_implied = 1 / odds_p1 + 1 / odds_p2
            features["implied_p1"] = (1 / odds_p1) / total_implied
            features["implied_p2"] = (1 / odds_p2) / total_implied
            features["bookmaker_vig"] = total_implied - 1.0
        else:
            features["implied_p1"] = np.nan
            features["implied_p2"] = np.nan
            features["bookmaker_vig"] = np.nan

        # 14. ELO momentum (change over last 5)
        features["p1_elo_change_5"] = self._elo_change(p1, player_history[p1], 5)
        features["p2_elo_change_5"] = self._elo_change(p2, player_history[p2], 5)

        # 15. Surface matches played (experience on this surface)
        features["p1_surface_matches"] = len(player_surface_history[p1][surface])
        features["p2_surface_matches"] = len(player_surface_history[p2][surface])

        return features

    # ------------------------------------------------------------------
    # Cache updater
    # ------------------------------------------------------------------

    def _update_caches(self, match, player_history, player_surface_history):
        winner = match["winner"]
        loser = match["loser"]
        surface = match.get("surface") or "Unknown"

        match_dict = {
            "date": match["date"],
            "winner": winner,
            "loser": loser,
            "surface": surface,
            "wsets": self._to_int(match.get("wsets")),
            "lsets": self._to_int(match.get("lsets")),
            "winner_rank": self._to_int(match.get("winner_rank")),
            "loser_rank": self._to_int(match.get("loser_rank")),
            "winner_elo_pre": self.elo_global.get_rating(winner),
            "loser_elo_pre": self.elo_global.get_rating(loser),
        }

        player_history[winner].append(match_dict)
        player_history[loser].append(match_dict)
        player_surface_history[winner][surface].append(match_dict)
        player_surface_history[loser][surface].append(match_dict)

        # Update ELO (global + surface)
        self.elo_global.update(winner, loser, result=1.0, goal_diff=1)
        surf_elo = self._get_surface_elo(surface)
        surf_elo.update(winner, loser, result=1.0, goal_diff=1)

    # ------------------------------------------------------------------
    # Stat helpers
    # ------------------------------------------------------------------

    def _get_surface_elo(self, surface: str) -> EloRatingSystem:
        if surface not in self.elo_surface:
            self.elo_surface[surface] = EloRatingSystem(k_factor=32, home_advantage=0)
        return self.elo_surface[surface]

    def _win_rate(self, player: str, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        wins = sum(1 for m in recent if m["winner"] == player)
        return wins / len(recent)

    def _h2h(self, p1: str, history: list[dict], n: int) -> dict:
        """H2H stats for p1 vs the same opponent from p1's history."""
        # We use all of p1's history to find matches against any specific opponent
        # and return aggregate win rate. This is a simplified global H2H.
        if not history:
            return {"win_rate": 0.5, "count": 0}
        wins = sum(1 for m in history[-n:] if m["winner"] == p1)
        return {"win_rate": wins / len(history[-n:]), "count": len(history[-n:])}

    def _h2h_surface(self, p1: str, surface_history: list[dict], n: int) -> dict:
        recent = surface_history[-n:]
        if not recent:
            return {"win_rate": 0.5, "count": 0}
        wins = sum(1 for m in recent if m["winner"] == p1)
        return {"win_rate": wins / len(recent), "count": len(recent)}

    def _rest_days(self, player: str, current_date, history: list[dict]) -> float | None:
        if not history:
            return None
        last_date = history[-1]["date"]
        return float((pd.Timestamp(current_date) - pd.Timestamp(last_date)).days)

    def _streak(self, player: str, history: list[dict], n: int) -> int:
        recent = history[-n:]
        if not recent:
            return 0
        streak = 0
        expected = None
        for m in reversed(recent):
            won = m["winner"] == player
            if expected is None:
                if won:
                    streak = 1; expected = "W"
                else:
                    streak = -1; expected = "L"
            elif expected == "W" and won:
                streak += 1
            elif expected == "L" and not won:
                streak -= 1
            else:
                break
        return streak

    def _avg_sets_won(self, player: str, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        vals = []
        for m in recent:
            sets = m["wsets"] if m["winner"] == player else m["lsets"]
            if sets is not None:
                vals.append(sets)
        return float(np.mean(vals)) if vals else np.nan

    def _avg_sets_lost(self, player: str, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        vals = []
        for m in recent:
            sets = m["lsets"] if m["winner"] == player else m["wsets"]
            if sets is not None:
                vals.append(sets)
        return float(np.mean(vals)) if vals else np.nan

    def _elo_change(self, player: str, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        oldest = recent[0]
        if oldest["winner"] == player:
            old_elo = oldest.get("winner_elo_pre", _INITIAL_ELO)
        else:
            old_elo = oldest.get("loser_elo_pre", _INITIAL_ELO)
        return self.elo_global.get_rating(player) - (old_elo or _INITIAL_ELO)

    def _last_rank(self, player: str, history: list[dict], is_winner: bool) -> int | None:
        if not history:
            return None
        last = history[-1]
        if last["winner"] == player:
            return last.get("winner_rank")
        return last.get("loser_rank")

    @staticmethod
    def _to_int(val) -> int | None:
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return None
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return None


def _series_level(series: str | None) -> int:
    if not series:
        return 0
    s = series.lower()
    if "grand slam" in s:
        return 4
    if "masters" in s:
        return 3
    if "500" in s:
        return 2
    if "250" in s:
        return 1
    return 0


# Feature columns used by the model (excluding metadata / odds columns)
TENNIS_FEATURE_COLUMNS = [
    "p1_elo", "p2_elo", "elo_diff",
    "p1_elo_surface", "p2_elo_surface", "elo_surface_diff",
    "p1_rank", "p2_rank", "rank_diff", "rank_ratio",
    "p1_win_rate_5", "p2_win_rate_5",
    "p1_win_rate_10", "p2_win_rate_10",
    "p1_win_rate_20", "p2_win_rate_20",
    "p1_surface_win_rate", "p2_surface_win_rate", "surface_win_rate_diff",
    "p1_h2h_win_rate", "h2h_count",
    "p1_h2h_surface_win_rate", "h2h_surface_count",
    "p1_rest_days", "p2_rest_days", "rest_diff",
    "p1_streak", "p2_streak",
    "p1_sets_won_avg", "p2_sets_won_avg",
    "p1_sets_lost_avg", "p2_sets_lost_avg",
    "p1_set_dominance", "p2_set_dominance",
    "series_level",
    "implied_p1", "implied_p2", "bookmaker_vig",
    "p1_elo_change_5", "p2_elo_change_5",
    "p1_surface_matches", "p2_surface_matches",
]
