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

        # 16. Service stats (Tennis Abstract — rolling avg over last 5 matches)
        for stat_w, stat_l, feat_name in [
            ("w_ace_rate", "l_ace_rate", "ace_rate"),
            ("w_df_rate", "l_df_rate", "df_rate"),
            ("w_1st_in", "l_1st_in", "1st_serve_in"),
            ("w_1st_won", "l_1st_won", "1st_serve_won"),
            ("w_2nd_won", "l_2nd_won", "2nd_serve_won"),
            ("w_bp_save", "l_bp_save", "bp_save"),
        ]:
            features[f"p1_{feat_name}"] = self._avg_serve_stat(p1, player_history[p1], 5, stat_w, stat_l)
            features[f"p2_{feat_name}"] = self._avg_serve_stat(p2, player_history[p2], 5, stat_w, stat_l)
        for name in ["ace_rate", "df_rate", "1st_serve_in", "1st_serve_won", "2nd_serve_won", "bp_save"]:
            v1 = features.get(f"p1_{name}", np.nan)
            v2 = features.get(f"p2_{name}", np.nan)
            features[f"{name}_diff"] = v1 - v2 if not (np.isnan(v1) or np.isnan(v2)) else np.nan

        return features

    # ------------------------------------------------------------------
    # Cache updater
    # ------------------------------------------------------------------

    def _update_caches(self, match, player_history, player_surface_history):
        winner = match["winner"]
        loser = match["loser"]
        surface = match.get("surface") or "Unknown"

        def _serve_rate(num, denom) -> float | None:
            n = self._to_int(match.get(num))
            d = self._to_int(match.get(denom))
            if n is None or d is None or d == 0:
                return None
            return round(n / d, 4)

        # Serve stats (Tennis Abstract columns: w_ace, w_df, w_svpt, w_1stIn, w_1stWon, w_2ndWon)
        w_svpt = self._to_int(match.get("w_svpt"))
        l_svpt = self._to_int(match.get("l_svpt"))
        w_1stIn = self._to_int(match.get("w_1stIn"))
        l_1stIn = self._to_int(match.get("l_1stIn"))
        w_2nd = (w_svpt - w_1stIn) if (w_svpt and w_1stIn) else None
        l_2nd = (l_svpt - l_1stIn) if (l_svpt and l_1stIn) else None

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
            # Service stats — winner perspective
            "w_ace_rate": _serve_rate("w_ace", "w_svpt"),
            "w_df_rate": _serve_rate("w_df", "w_svpt"),
            "w_1st_in": _serve_rate("w_1stIn", "w_svpt"),
            "w_1st_won": _serve_rate("w_1stWon", "w_1stIn"),
            "w_2nd_won": round(self._to_int(match.get("w_2ndWon")) / w_2nd, 4) if (self._to_int(match.get("w_2ndWon")) is not None and w_2nd and w_2nd > 0) else None,
            "w_bp_save": _serve_rate("w_bpSaved", "w_bpFaced"),
            # Service stats — loser perspective
            "l_ace_rate": _serve_rate("l_ace", "l_svpt"),
            "l_df_rate": _serve_rate("l_df", "l_svpt"),
            "l_1st_in": _serve_rate("l_1stIn", "l_svpt"),
            "l_1st_won": _serve_rate("l_1stWon", "l_1stIn"),
            "l_2nd_won": round(self._to_int(match.get("l_2ndWon")) / l_2nd, 4) if (self._to_int(match.get("l_2ndWon")) is not None and l_2nd and l_2nd > 0) else None,
            "l_bp_save": _serve_rate("l_bpSaved", "l_bpFaced"),
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

    def _avg_serve_stat(self, player: str, history: list[dict], n: int, stat_winner: str, stat_loser: str) -> float:
        """Average a service stat (winner or loser perspective) over last N matches."""
        recent = history[-n:]
        vals = []
        for m in recent:
            if m["winner"] == player:
                v = m.get(stat_winner)
            else:
                v = m.get(stat_loser)
            if v is not None:
                vals.append(v)
        return float(np.mean(vals)) if vals else np.nan

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

    # ------------------------------------------------------------------
    # Production snapshot export + live feature builder
    # ------------------------------------------------------------------

    def get_player_snapshot(
        self,
        player_history: dict,
        player_surface_history: dict,
    ) -> dict:
        """Export current player stats for live prediction.

        Returns a dict with ELO ratings and per-player stats that can be
        serialized to JSON and loaded at prediction time.
        """
        snapshot: dict = {
            "elo_global": dict(self.elo_global.ratings),
            "elo_surface": {s: dict(elo_sys.ratings) for s, elo_sys in self.elo_surface.items()},
            "players": {},
        }

        all_players = set(player_history.keys())
        for player in all_players:
            history = player_history[player]
            if len(history) < _MIN_HISTORY:
                continue

            stats: dict = {}
            for n in [5, 10, 20]:
                stats[f"win_rate_{n}"] = self._win_rate(player, history, n)
            stats["streak"] = self._streak(player, history, 10)
            stats["sets_won_avg"] = self._avg_sets_won(player, history, 10)
            stats["sets_lost_avg"] = self._avg_sets_lost(player, history, 10)
            s_won = stats["sets_won_avg"]
            s_lost = stats["sets_lost_avg"]
            if not (np.isnan(s_won) or np.isnan(s_lost)):
                stats["set_dominance"] = float(s_won / max(0.01, s_won + s_lost))
            else:
                stats["set_dominance"] = float("nan")
            stats["elo_change_5"] = self._elo_change(player, history, 5)

            # Service stats from Tennis Abstract (avg last 5)
            for stat_w, stat_l, key in [
                ("w_ace_rate", "l_ace_rate", "ace_rate"),
                ("w_df_rate", "l_df_rate", "df_rate"),
                ("w_1st_in", "l_1st_in", "1st_serve_in"),
                ("w_1st_won", "l_1st_won", "1st_serve_won"),
                ("w_2nd_won", "l_2nd_won", "2nd_serve_won"),
                ("w_bp_save", "l_bp_save", "bp_save"),
            ]:
                stats[key] = self._avg_serve_stat(player, history, 5, stat_w, stat_l)

            surf_stats: dict = {}
            for surface, surf_hist in player_surface_history[player].items():
                if len(surf_hist) < 3:
                    continue
                surf_stats[surface] = {
                    "win_rate_10": self._win_rate(player, surf_hist, 10),
                    "surface_matches": len(surf_hist),
                }
            stats["surface"] = surf_stats

            # Convert NaN to None for JSON serialization
            serializable = {}
            for k, v in stats.items():
                if k == "surface":
                    serializable[k] = {}
                    for surf, sv in v.items():
                        serializable[k][surf] = {
                            sk: (None if isinstance(sv2, float) and np.isnan(sv2) else sv2)
                            for sk, sv2 in sv.items()
                        }
                else:
                    serializable[k] = None if isinstance(v, float) and np.isnan(v) else v
            snapshot["players"][player] = serializable

        return snapshot

    def build_live_feature_vector(
        self,  # unused — kept for API compatibility
        p1: str,
        p2: str,
        surface: str,
        odds_p1: float,
        odds_p2: float,
        ranking_p1: int | None,
        ranking_p2: int | None,
        rest_days_p1: int | None,
        rest_days_p2: int | None,
        series: str | None,
        player_snapshot: dict,
        h2h: str | None = None,
        h2h_surface: str | None = None,
    ) -> dict:
        """Build a feature vector for a live match using saved player stats.

        Returns a dict with all TENNIS_FEATURE_COLUMNS keys (NaN for missing data).
        The caller must convert to a numpy array in TENNIS_FEATURE_COLUMNS order.
        """
        players = player_snapshot.get("players", {})
        elo_g = player_snapshot.get("elo_global", {})
        elo_s_map = player_snapshot.get("elo_surface", {})
        elo_surf = elo_s_map.get(surface, {})

        _player_keys = list(players.keys())

        def _resolve(name: str) -> str:
            """Return the snapshot key that best matches *name*.

            Lookup order:
            1. Exact match
            2. Normalized form ("Djokovic N." style)
            3. Fuzzy last-name match (unique surname in snapshot)
            """
            if name in players:
                return name
            normalized = _normalize_player_name(name)
            if normalized in players:
                return normalized
            fuzzy = _fuzzy_lookup_by_last_name(name, _player_keys)
            return fuzzy if fuzzy is not None else name

        def _get(name: str) -> dict:
            return players.get(_resolve(name)) or {}

        def _elo(name: str, elo_dict: dict) -> float:
            resolved = _resolve(name)
            v = elo_dict.get(resolved)
            if v is None and resolved != name:
                v = elo_dict.get(name)
            return float(v) if v is not None else _INITIAL_ELO

        p1_stats = _get(p1)
        p2_stats = _get(p2)

        f: dict = {}

        # ELO (global)
        f["p1_elo"] = _elo(p1, elo_g)
        f["p2_elo"] = _elo(p2, elo_g)
        f["elo_diff"] = f["p1_elo"] - f["p2_elo"]

        # ELO surface
        f["p1_elo_surface"] = _elo(p1, elo_surf)
        f["p2_elo_surface"] = _elo(p2, elo_surf)
        f["elo_surface_diff"] = f["p1_elo_surface"] - f["p2_elo_surface"]

        # Rankings
        f["p1_rank"] = float(ranking_p1) if ranking_p1 else np.nan
        f["p2_rank"] = float(ranking_p2) if ranking_p2 else np.nan
        if ranking_p1 and ranking_p2 and ranking_p1 > 0 and ranking_p2 > 0:
            f["rank_diff"] = float(ranking_p1 - ranking_p2)
            f["rank_ratio"] = float(ranking_p1 / ranking_p2)
        else:
            f["rank_diff"] = np.nan
            f["rank_ratio"] = np.nan

        # Win rates from snapshot
        for n in [5, 10, 20]:
            v1 = p1_stats.get(f"win_rate_{n}")
            v2 = p2_stats.get(f"win_rate_{n}")
            f[f"p1_win_rate_{n}"] = float(v1) if v1 is not None else np.nan
            f[f"p2_win_rate_{n}"] = float(v2) if v2 is not None else np.nan

        # Surface win rate from snapshot
        p1_surf = p1_stats.get("surface", {}).get(surface, {})
        p2_surf = p2_stats.get("surface", {}).get(surface, {})
        v1_surf = p1_surf.get("win_rate_10")
        v2_surf = p2_surf.get("win_rate_10")
        f["p1_surface_win_rate"] = float(v1_surf) if v1_surf is not None else np.nan
        f["p2_surface_win_rate"] = float(v2_surf) if v2_surf is not None else np.nan
        if not (np.isnan(f["p1_surface_win_rate"]) or np.isnan(f["p2_surface_win_rate"])):
            f["surface_win_rate_diff"] = f["p1_surface_win_rate"] - f["p2_surface_win_rate"]
        else:
            f["surface_win_rate_diff"] = np.nan

        # H2H — parsed from SofaScore summary strings ("3W 1L", "2W 0L on Hard")
        h2h_parsed = _parse_h2h_summary(h2h)
        if h2h_parsed is not None:
            wins, losses = h2h_parsed
            total = wins + losses
            f["p1_h2h_win_rate"] = wins / total if total > 0 else 0.5
            f["h2h_count"] = float(total)
        else:
            f["p1_h2h_win_rate"] = np.nan
            f["h2h_count"] = np.nan

        h2h_surf_parsed = _parse_h2h_summary(h2h_surface)
        if h2h_surf_parsed is not None:
            wins_s, losses_s = h2h_surf_parsed
            total_s = wins_s + losses_s
            f["p1_h2h_surface_win_rate"] = wins_s / total_s if total_s > 0 else 0.5
            f["h2h_surface_count"] = float(total_s)
        else:
            f["p1_h2h_surface_win_rate"] = np.nan
            f["h2h_surface_count"] = np.nan

        # Rest days
        f["p1_rest_days"] = float(rest_days_p1) if rest_days_p1 is not None else np.nan
        f["p2_rest_days"] = float(rest_days_p2) if rest_days_p2 is not None else np.nan
        r1 = rest_days_p1 or 7
        r2 = rest_days_p2 or 7
        f["rest_diff"] = float(r1 - r2)

        # Streak, sets, dominance, elo_change from snapshot
        v_streak1 = p1_stats.get("streak")
        v_streak2 = p2_stats.get("streak")
        f["p1_streak"] = float(v_streak1) if v_streak1 is not None else np.nan
        f["p2_streak"] = float(v_streak2) if v_streak2 is not None else np.nan

        for key in ["sets_won_avg", "sets_lost_avg", "set_dominance", "elo_change_5"]:
            v1 = p1_stats.get(key)
            v2 = p2_stats.get(key)
            col1 = f"p1_{key}" if key != "elo_change_5" else "p1_elo_change_5"
            col2 = f"p2_{key}" if key != "elo_change_5" else "p2_elo_change_5"
            f[col1] = float(v1) if v1 is not None else np.nan
            f[col2] = float(v2) if v2 is not None else np.nan

        # Surface matches from snapshot
        f["p1_surface_matches"] = float(p1_surf.get("surface_matches", 0) or 0)
        f["p2_surface_matches"] = float(p2_surf.get("surface_matches", 0) or 0)

        # Series level
        f["series_level"] = float(_series_level(series))

        # Implied probabilities from odds
        if odds_p1 > 1.0 and odds_p2 > 1.0:
            total_imp = 1 / odds_p1 + 1 / odds_p2
            f["implied_p1"] = (1 / odds_p1) / total_imp
            f["implied_p2"] = (1 / odds_p2) / total_imp
            f["bookmaker_vig"] = total_imp - 1.0
        else:
            f["implied_p1"] = np.nan
            f["implied_p2"] = np.nan
            f["bookmaker_vig"] = np.nan

        # Service stats from snapshot
        for stat_key in ["ace_rate", "df_rate", "1st_serve_in", "1st_serve_won", "2nd_serve_won", "bp_save"]:
            v1 = p1_stats.get(stat_key)
            v2 = p2_stats.get(stat_key)
            f[f"p1_{stat_key}"] = float(v1) if v1 is not None else np.nan
            f[f"p2_{stat_key}"] = float(v2) if v2 is not None else np.nan
            if v1 is not None and v2 is not None:
                f[f"{stat_key}_diff"] = float(v1) - float(v2)
            else:
                f[f"{stat_key}_diff"] = np.nan

        return f


def build_tennis_live_features(
    p1: str,
    p2: str,
    surface: str,
    odds_p1: float,
    odds_p2: float,
    ranking_p1: int | None,
    ranking_p2: int | None,
    rest_days_p1: int | None,
    rest_days_p2: int | None,
    series: str | None,
    player_snapshot: dict,
    h2h: str | None = None,
    h2h_surface: str | None = None,
) -> dict:
    """Standalone wrapper around TennisFeatureBuilder.build_live_feature_vector."""
    dummy = object.__new__(TennisFeatureBuilder)
    return dummy.build_live_feature_vector(
        p1=p1, p2=p2, surface=surface,
        odds_p1=odds_p1, odds_p2=odds_p2,
        ranking_p1=ranking_p1, ranking_p2=ranking_p2,
        rest_days_p1=rest_days_p1, rest_days_p2=rest_days_p2,
        series=series, player_snapshot=player_snapshot,
        h2h=h2h, h2h_surface=h2h_surface,
    )


def _fuzzy_lookup_by_last_name(name: str, keys: list[str]) -> str | None:
    """Return the snapshot key whose surname matches name's surname.

    Extracts the last name of *name* (first token before a space, since snapshot
    keys are "Surname I." format) and compares it against the surname token of
    every key.  Returns the matched key only when exactly one candidate matches
    (to avoid ambiguity between players like "Murray A." and "Murray J.").
    """
    if not name or not keys:
        return None

    # Derive last name from *name* — try to extract the surname component
    raw = name.strip()
    if "," in raw:
        surname_part = raw.split(",", 1)[0].strip()
    elif " " in raw:
        parts = raw.split()
        # "N. Djokovic" style — surname is last token
        if len(parts[0]) <= 2 and parts[0].endswith("."):
            surname_part = parts[-1]
        # "First Last" or "First Middle Last" — use last token
        else:
            surname_part = parts[-1]
    else:
        surname_part = raw

    surname_lower = surname_part.lower()
    matches = [k for k in keys if k.split()[0].lower() == surname_lower]
    if len(matches) == 1:
        return matches[0]
    return None


def _parse_h2h_summary(summary: str | None) -> tuple[int, int] | None:
    """Parse a SofaScore H2H summary string into (p1_wins, p2_losses).

    Accepted formats:
      "3W 1L"                   -> (3, 1)
      "2W 0L on Hard"           -> (2, 0)
      "3W 1L 1D" (with draws)   -> (3, 1)  draws ignored

    Returns None if the string cannot be parsed or is empty.
    """
    import re

    if not summary or not isinstance(summary, str):
        return None
    m = re.search(r"(\d+)\s*W\s+(\d+)\s*L", summary, re.IGNORECASE)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None


def _normalize_player_name(name: str) -> str:
    """Normalize a player name to the tennis-data.co.uk format "Surname I.".

    Handles the following input formats:
      "Novak Djokovic"           -> "Djokovic N."
      "N. Djokovic"              -> "Djokovic N."
      "Djokovic, Novak"          -> "Djokovic N."
      "Djokovic N."              -> "Djokovic N."  (already correct — passthrough)
      "Carlos Alcaraz Garfia"    -> "Alcaraz C."   (3-part name: use middle as surname)
      "Fritz Taylor Jr."         -> "Fritz T."     (strip Jr./Sr. suffix)
    Accented characters are kept as-is.
    """
    if not name:
        return name

    # Strip known honorific / generation suffixes (case-insensitive)
    _SUFFIXES = {"jr.", "jr", "sr.", "sr", "ii", "iii", "iv"}
    raw = name.strip()

    # Format: "Surname, Firstname" (comma-separated)
    if "," in raw:
        surname_part, given_part = raw.split(",", 1)
        surname = surname_part.strip()
        given = given_part.strip()
        initial = given[0] if given else "?"
        return f"{surname} {initial}."

    parts = raw.split()
    # Strip trailing suffix tokens
    while parts and parts[-1].lower() in _SUFFIXES:
        parts = parts[:-1]

    if not parts:
        return name
    if len(parts) == 1:
        return parts[0]

    # Already in "Surname I." format  e.g. "Djokovic N."
    if len(parts) == 2 and len(parts[1]) <= 2 and parts[1].endswith("."):
        return raw  # passthrough

    # "I. Surname" format — first token is an initial  e.g. "N. Djokovic"
    if len(parts[0]) <= 2 and parts[0].endswith("."):
        initial = parts[0][0]
        surname = parts[-1]
        return f"{surname} {initial}."

    # 3-part name: "First Middle Last" — use middle as surname (e.g. "Carlos Alcaraz Garfia")
    if len(parts) == 3:
        first = parts[0]
        middle = parts[1]
        return f"{middle} {first[0]}."

    # Default: "First Last" (or 4+ parts — use last token as surname)
    first = parts[0]
    last = parts[-1]
    return f"{last} {first[0]}."


_GRAND_SLAM_NAMES = frozenset([
    "australian open", "roland garros", "french open", "wimbledon", "us open",
])

_MASTERS_1000_NAMES = frozenset([
    "indian wells", "miami open", "miami", "monte-carlo", "monte carlo",
    "madrid open", "madrid", "rome", "italian open", "internazionali",
    "canada", "canadian open", "montreal", "toronto", "cincinnati",
    "western & southern", "western and southern", "shanghai", "paris",
    "paris masters", "rolex paris masters",
])

_ATP_500_NAMES = frozenset([
    "rotterdam", "dubai", "barcelona", "open de barcelona",
    "hamburg", "halle", "queens", "queen's club",
    "washington", "citi open", "beijing", "china open",
    "tokyo", "rakuten japan open", "vienna", "erste bank open",
    "basel", "swiss indoors",
])


def _series_level(series: str | None) -> int:
    """Return series level integer from series string or known tournament name.

    Level 4 = Grand Slam, 3 = Masters 1000, 2 = ATP 500, 1 = ATP 250, 0 = unknown.
    Handles both the old CSV format ("Grand Slam", "Masters 1000", "ATP250") and
    the SofaScore format ("Australian Open", "Roland Garros", etc.).
    """
    if not series:
        return 0
    s = series.lower().strip()

    # Old CSV format (direct keyword match)
    if "grand slam" in s:
        return 4
    if "masters 1000" in s or "masters series" in s:
        return 3
    if "500" in s:
        return 2
    if "250" in s:
        return 1
    # Catch "Masters" without "1000" (e.g. "ATP Masters")
    if "masters" in s:
        return 3

    # SofaScore / named tournament format
    for name in _GRAND_SLAM_NAMES:
        if name in s:
            return 4
    for name in _MASTERS_1000_NAMES:
        if name in s:
            return 3
    for name in _ATP_500_NAMES:
        if name in s:
            return 2

    # Everything else defaults to ATP 250 level (lowest ATP tier)
    return 1


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
    # Service stats (Tennis Abstract — available for ~64% of matches)
    "p1_ace_rate", "p2_ace_rate", "ace_rate_diff",
    "p1_df_rate", "p2_df_rate", "df_rate_diff",
    "p1_1st_serve_in", "p2_1st_serve_in", "1st_serve_in_diff",
    "p1_1st_serve_won", "p2_1st_serve_won", "1st_serve_won_diff",
    "p1_2nd_serve_won", "p2_2nd_serve_won", "2nd_serve_won_diff",
    "p1_bp_save", "p2_bp_save", "bp_save_diff",
]
