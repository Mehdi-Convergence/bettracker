"""Football feature engineering.

CRITICAL: All features use only data BEFORE the match date. No look-ahead bias.
Optimized with incremental caches for O(n) performance instead of O(n^2).
"""

from collections import defaultdict

import numpy as np
import pandas as pd

from src.features.elo import EloRatingSystem


class FootballFeatureBuilder:
    """Build feature vectors for football match prediction.

    Uses incremental caches for standings, form, and stats to avoid
    recalculating everything for each match.
    """

    def __init__(self):
        self.elo = EloRatingSystem()

    def build_dataset(self, matches_df: pd.DataFrame, progress: bool = True) -> pd.DataFrame:
        """Build feature dataset for all matches chronologically."""
        matches_sorted = matches_df.sort_values("date").reset_index(drop=True)
        features_list = []
        result_map = {"H": 1.0, "D": 0.5, "A": 0.0}

        # Incremental caches
        team_history = defaultdict(list)  # team -> list of match dicts (chronological)
        team_home_history = defaultdict(list)
        team_away_history = defaultdict(list)
        standings = defaultdict(lambda: defaultdict(lambda: {"points": 0, "gd": 0, "gf": 0}))
        # standings[league_season][team] = {"points": ..., "gd": ..., "gf": ...}

        total = len(matches_sorted)
        log_interval = total // 20 if total > 20 else 1

        for idx, match in matches_sorted.iterrows():
            if progress and idx % log_interval == 0:
                print(f"  Processing match {idx}/{total} ({idx*100//total}%)")

            home = match["home_team"]
            away = match["away_team"]
            league_season = f"{match['league']}_{match['season']}"

            # Skip first matches (not enough history)
            if len(team_history[home]) < 3 or len(team_history[away]) < 3:
                self._update_caches(match, team_history, team_home_history, team_away_history, standings, result_map)
                continue

            features = self._build_features_from_cache(
                match, home, away, league_season,
                team_history, team_home_history, team_away_history, standings
            )

            features["ftr"] = match["ftr"]
            features["date"] = match["date"]
            features["season"] = match["season"]
            features["league"] = match["league"]
            features["match_id"] = match.get("id")
            features["home_team"] = home
            features["away_team"] = away
            features["_odds_home"] = match.get("odds_home")
            features["_odds_draw"] = match.get("odds_draw")
            features["_odds_away"] = match.get("odds_away")
            features["_odds_home_close"] = match.get("odds_home_close")
            features["_odds_draw_close"] = match.get("odds_draw_close")
            features["_odds_away_close"] = match.get("odds_away_close")
            features["_max_odds_home"] = match.get("max_odds_home")
            features["_max_odds_draw"] = match.get("max_odds_draw")
            features["_max_odds_away"] = match.get("max_odds_away")
            features["_avg_odds_home"] = match.get("avg_odds_home")
            features["_avg_odds_draw"] = match.get("avg_odds_draw")
            features["_avg_odds_away"] = match.get("avg_odds_away")
            features_list.append(features)

            # Update caches AFTER feature extraction
            self._update_caches(match, team_history, team_home_history, team_away_history, standings, result_map)

        if progress:
            print(f"  Processing complete: {len(features_list)} feature vectors built")

        return pd.DataFrame(features_list)

    def _update_caches(self, match, team_history, team_home_history, team_away_history, standings, result_map):
        """Update all incremental caches after processing a match."""
        home = match["home_team"]
        away = match["away_team"]
        fthg = int(match["fthg"])
        ftag = int(match["ftag"])
        ftr = match["ftr"]
        league_season = f"{match['league']}_{match['season']}"

        match_dict = {
            "date": match["date"],
            "home_team": home, "away_team": away,
            "fthg": fthg, "ftag": ftag, "ftr": ftr,
            "home_shots": match.get("home_shots"),
            "away_shots": match.get("away_shots"),
            "home_shots_target": match.get("home_shots_target"),
            "away_shots_target": match.get("away_shots_target"),
            "home_xg": match.get("home_xg"),
            "away_xg": match.get("away_xg"),
        }

        team_history[home].append(match_dict)
        team_history[away].append(match_dict)
        team_home_history[home].append(match_dict)
        team_away_history[away].append(match_dict)

        # Update standings
        home_pts = {"H": 3, "D": 1, "A": 0}.get(ftr, 0)
        away_pts = {"A": 3, "D": 1, "H": 0}.get(ftr, 0)
        standings[league_season][home]["points"] += home_pts
        standings[league_season][home]["gd"] += fthg - ftag
        standings[league_season][home]["gf"] += fthg
        standings[league_season][away]["points"] += away_pts
        standings[league_season][away]["gd"] += ftag - fthg
        standings[league_season][away]["gf"] += ftag

        # Update ELO
        result = result_map.get(ftr, 0.5)
        goal_diff = abs(fthg - ftag)
        self.elo.update(home, away, result, goal_diff)

    def _build_features_from_cache(
        self, match, home, away, league_season,
        team_history, team_home_history, team_away_history, standings
    ) -> dict:
        """Build features using cached data (fast)."""
        features = {}

        # 1. ELO
        features["home_elo"] = self.elo.get_rating(home)
        features["away_elo"] = self.elo.get_rating(away)
        features["elo_diff"] = features["home_elo"] - features["away_elo"]

        # 2. FORM (rolling windows)
        for n in [3, 5, 10]:
            hf = self._form_from_cache(home, team_history[home], n)
            af = self._form_from_cache(away, team_history[away], n)
            features[f"home_form_{n}"] = hf["ppg"]
            features[f"away_form_{n}"] = af["ppg"]
            features[f"home_goals_scored_{n}"] = hf["gs_avg"]
            features[f"home_goals_conceded_{n}"] = hf["gc_avg"]
            features[f"away_goals_scored_{n}"] = af["gs_avg"]
            features[f"away_goals_conceded_{n}"] = af["gc_avg"]
            features[f"home_goal_diff_{n}"] = hf["gd_avg"]
            features[f"away_goal_diff_{n}"] = af["gd_avg"]

        # 3. HOME/AWAY SPECIFIC FORM
        features["home_home_form_5"] = self._form_from_cache(home, team_home_history[home], 5)["ppg"]
        features["away_away_form_5"] = self._form_from_cache(away, team_away_history[away], 5)["ppg"]

        # 4. SHOTS
        features["home_shots_avg_5"] = self._avg_stat_cache(home, team_history[home], 5, "shots")
        features["away_shots_avg_5"] = self._avg_stat_cache(away, team_history[away], 5, "shots")
        features["home_sot_avg_5"] = self._avg_stat_cache(home, team_history[home], 5, "shots_target")
        features["away_sot_avg_5"] = self._avg_stat_cache(away, team_history[away], 5, "shots_target")
        if features["home_shots_avg_5"] and features["home_shots_avg_5"] > 0:
            features["home_shot_accuracy_5"] = (features["home_sot_avg_5"] or 0) / features["home_shots_avg_5"]
        else:
            features["home_shot_accuracy_5"] = np.nan

        # 5. H2H
        h2h = self._h2h_from_cache(home, away, team_history[home], 6)
        features["h2h_home_win_rate"] = h2h["home_win_rate"]
        features["h2h_draw_rate"] = h2h["draw_rate"]
        features["h2h_avg_goals"] = h2h["avg_goals"]
        features["h2h_count"] = h2h["count"]

        # 6. REST DAYS
        features["home_rest_days"] = self._rest_days_cache(home, match["date"], team_history[home])
        features["away_rest_days"] = self._rest_days_cache(away, match["date"], team_history[away])
        features["rest_diff"] = (features["home_rest_days"] or 7) - (features["away_rest_days"] or 7)

        # 7. STANDINGS
        pos_h, pos_a = self._positions_from_standings(home, away, standings[league_season])
        features["home_position"] = pos_h
        features["away_position"] = pos_a
        features["position_diff"] = pos_h - pos_a

        # 8. xG
        features["home_xg_avg_5"] = self._avg_stat_cache(home, team_history[home], 5, "xg")
        features["away_xg_avg_5"] = self._avg_stat_cache(away, team_history[away], 5, "xg")
        home_xg_c = self._avg_stat_conceded_cache(home, team_history[home], 5, "xg")
        if features["home_xg_avg_5"] is not None and home_xg_c is not None:
            features["home_xg_diff_5"] = features["home_xg_avg_5"] - home_xg_c
        else:
            features["home_xg_diff_5"] = np.nan

        # 9. IMPLIED PROBABILITIES
        odds_h = match.get("odds_home")
        odds_d = match.get("odds_draw")
        odds_a = match.get("odds_away")
        if odds_h and odds_d and odds_a and odds_h > 1 and odds_d > 1 and odds_a > 1:
            total = 1/odds_h + 1/odds_d + 1/odds_a
            features["implied_home"] = (1/odds_h) / total
            features["implied_draw"] = (1/odds_d) / total
            features["implied_away"] = (1/odds_a) / total
        else:
            features["implied_home"] = np.nan
            features["implied_draw"] = np.nan
            features["implied_away"] = np.nan

        return features

    def _form_from_cache(self, team: str, history: list[dict], n: int) -> dict:
        """Form stats from cached match history."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return {"ppg": np.nan, "gs_avg": np.nan, "gc_avg": np.nan, "gd_avg": np.nan}

        points = []
        scored = []
        conceded = []
        for m in recent:
            if m["home_team"] == team:
                points.append({"H": 3, "D": 1, "A": 0}.get(m["ftr"], 0))
                scored.append(m["fthg"])
                conceded.append(m["ftag"])
            else:
                points.append({"A": 3, "D": 1, "H": 0}.get(m["ftr"], 0))
                scored.append(m["ftag"])
                conceded.append(m["fthg"])

        return {
            "ppg": np.mean(points),
            "gs_avg": np.mean(scored),
            "gc_avg": np.mean(conceded),
            "gd_avg": np.mean([s - c for s, c in zip(scored, conceded)]),
        }

    def _avg_stat_cache(self, team: str, history: list[dict], n: int, stat: str) -> float | None:
        """Average stat from cache."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return None

        stat_map = {
            "shots": ("home_shots", "away_shots"),
            "shots_target": ("home_shots_target", "away_shots_target"),
            "xg": ("home_xg", "away_xg"),
        }
        if stat not in stat_map:
            return None

        home_col, away_col = stat_map[stat]
        values = []
        for m in recent:
            val = m.get(home_col) if m["home_team"] == team else m.get(away_col)
            if val is not None and not (isinstance(val, float) and np.isnan(val)):
                values.append(float(val))

        return np.mean(values) if values else None

    def _avg_stat_conceded_cache(self, team: str, history: list[dict], n: int, stat: str) -> float | None:
        """Average opponent stat from cache."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return None

        stat_map = {"xg": ("away_xg", "home_xg")}
        if stat not in stat_map:
            return None

        opp_home_col, opp_away_col = stat_map[stat]
        values = []
        for m in recent:
            val = m.get(opp_home_col) if m["home_team"] == team else m.get(opp_away_col)
            if val is not None and not (isinstance(val, float) and np.isnan(val)):
                values.append(float(val))

        return np.mean(values) if values else None

    def _h2h_from_cache(self, home: str, away: str, home_history: list[dict], n: int) -> dict:
        """H2H stats from cache."""
        h2h = [m for m in home_history
               if (m["home_team"] == home and m["away_team"] == away)
               or (m["home_team"] == away and m["away_team"] == home)]
        h2h = h2h[-n:]  # Last n meetings

        if not h2h:
            return {"home_win_rate": 0.5, "draw_rate": 0.2, "avg_goals": 2.5, "count": 0}

        home_wins = 0
        draws = 0
        total_goals = 0
        for m in h2h:
            total_goals += m["fthg"] + m["ftag"]
            if m["home_team"] == home:
                if m["ftr"] == "H": home_wins += 1
                elif m["ftr"] == "D": draws += 1
            else:
                if m["ftr"] == "A": home_wins += 1
                elif m["ftr"] == "D": draws += 1

        count = len(h2h)
        return {
            "home_win_rate": home_wins / count,
            "draw_rate": draws / count,
            "avg_goals": total_goals / count,
            "count": count,
        }

    def _rest_days_cache(self, team: str, current_date, history: list[dict]) -> float | None:
        """Days since last match from cache."""
        if not history:
            return None
        last_date = history[-1]["date"]
        return float((pd.Timestamp(current_date) - pd.Timestamp(last_date)).days)

    def _positions_from_standings(self, home: str, away: str, league_standings: dict) -> tuple[int, int]:
        """Get positions from cached standings."""
        if not league_standings:
            return 10, 10

        sorted_teams = sorted(
            league_standings.keys(),
            key=lambda t: (-league_standings[t]["points"], -league_standings[t]["gd"], -league_standings[t]["gf"])
        )

        try:
            pos_h = sorted_teams.index(home) + 1
        except ValueError:
            pos_h = len(sorted_teams) + 1

        try:
            pos_a = sorted_teams.index(away) + 1
        except ValueError:
            pos_a = len(sorted_teams) + 1

        return pos_h, pos_a


# Feature columns used by the model (excluding metadata columns)
FEATURE_COLUMNS = [
    "elo_diff", "home_elo", "away_elo",
    "home_form_3", "away_form_3",
    "home_form_5", "away_form_5",
    "home_form_10", "away_form_10",
    "home_goals_scored_3", "home_goals_conceded_3",
    "away_goals_scored_3", "away_goals_conceded_3",
    "home_goal_diff_3", "away_goal_diff_3",
    "home_goal_diff_5", "away_goal_diff_5",
    "home_home_form_5", "away_away_form_5",
    "home_shots_avg_5", "away_shots_avg_5",
    "home_sot_avg_5", "away_sot_avg_5",
    "home_shot_accuracy_5",
    "h2h_home_win_rate", "h2h_draw_rate", "h2h_avg_goals", "h2h_count",
    "home_rest_days", "away_rest_days", "rest_diff",
    "home_position", "away_position", "position_diff",
    "home_xg_avg_5", "away_xg_avg_5", "home_xg_diff_5",
    "implied_home", "implied_draw", "implied_away",
]
