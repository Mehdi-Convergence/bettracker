"""Football feature engineering.

CRITICAL: All features use only data BEFORE the match date. No look-ahead bias.
Optimized with incremental caches for O(n) performance instead of O(n^2).
"""

import logging
from collections import defaultdict

import numpy as np
import pandas as pd

from src.features.elo import EloRatingSystem

logger = logging.getLogger(__name__)


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
        league_draws = defaultdict(lambda: {"draws": 0, "total": 0})
        league_match_count = defaultdict(int)

        total = len(matches_sorted)
        log_interval = total // 20 if total > 20 else 1

        for idx, match in matches_sorted.iterrows():
            if progress and idx % log_interval == 0:
                logger.info("  Processing match %d/%d (%d%%)", idx, total, idx * 100 // total)

            home = match["home_team"]
            away = match["away_team"]
            league_season = f"{match['league']}_{match['season']}"

            # Skip first matches (not enough history)
            if len(team_history[home]) < 3 or len(team_history[away]) < 3:
                self._update_caches(match, team_history, team_home_history, team_away_history, standings, result_map, league_draws, league_match_count)
                continue

            features = self._build_features_from_cache(
                match, home, away, league_season,
                team_history, team_home_history, team_away_history, standings,
                league_draws, league_match_count
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
            self._update_caches(match, team_history, team_home_history, team_away_history, standings, result_map, league_draws, league_match_count)

        if progress:
            logger.info("  Processing complete: %d feature vectors built", len(features_list))

        return pd.DataFrame(features_list)

    def _update_caches(self, match, team_history, team_home_history, team_away_history, standings, result_map,
                       league_draws, league_match_count):
        """Update all incremental caches after processing a match."""
        home = match["home_team"]
        away = match["away_team"]
        fthg = int(match["fthg"])
        ftag = int(match["ftag"])
        ftr = match["ftr"]
        league_season = f"{match['league']}_{match['season']}"

        # Read pre-match ELO before updating (needed for opponent-strength features)
        home_elo_pre = self.elo.get_rating(home)
        away_elo_pre = self.elo.get_rating(away)

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
            "home_corners": match.get("home_corners"),
            "away_corners": match.get("away_corners"),
            "home_yellow": match.get("home_yellow"),
            "away_yellow": match.get("away_yellow"),
            "home_red": match.get("home_red"),
            "away_red": match.get("away_red"),
            # Pre-match ELO of each team (used as opponent strength by the other team)
            "opp_elo_for_home": away_elo_pre,
            "opp_elo_for_away": home_elo_pre,
            # Team's own pre-match ELO (used for momentum/trajectory features)
            "home_elo_at_match": home_elo_pre,
            "away_elo_at_match": away_elo_pre,
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

        # Update league draw rate and match count
        league_draws[league_season]["total"] += 1
        if ftr == "D":
            league_draws[league_season]["draws"] += 1
        league_match_count[league_season] += 1

    def _build_features_from_cache(
        self, match, home, away, league_season,
        team_history, team_home_history, team_away_history, standings,
        league_draws, league_match_count
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

        # 4b. CORNERS & CARDS (rolling avg last 5)
        features["home_corners_avg"] = self._avg_stat_cache(home, team_history[home], 5, "corners") or np.nan
        features["away_corners_avg"] = self._avg_stat_cache(away, team_history[away], 5, "corners") or np.nan
        features["home_cards_avg"] = self._avg_stat_cache(home, team_history[home], 5, "yellow") or np.nan
        features["away_cards_avg"] = self._avg_stat_cache(away, team_history[away], 5, "yellow") or np.nan
        features["home_red_avg_5"] = self._avg_stat_cache(home, team_history[home], 5, "red") or np.nan
        features["away_red_avg_5"] = self._avg_stat_cache(away, team_history[away], 5, "red") or np.nan

        # 4c. POSSESSION (not available in football-data.co.uk CSVs — set to NaN)
        features["home_possession"] = np.nan
        features["away_possession"] = np.nan

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
        away_xg_c = self._avg_stat_conceded_cache(away, team_history[away], 5, "xg")
        if features["home_xg_avg_5"] is not None and home_xg_c is not None:
            features["home_xg_diff_5"] = features["home_xg_avg_5"] - home_xg_c
        else:
            features["home_xg_diff_5"] = np.nan
        if features["away_xg_avg_5"] is not None and away_xg_c is not None:
            features["away_xg_diff_5"] = features["away_xg_avg_5"] - away_xg_c
        else:
            features["away_xg_diff_5"] = np.nan

        # 8b. xG overperformance (goals - xG over last 5 matches)
        # Positive = team scores more than expected (hot streak vs luck indicator)
        # Negative = team scores less than expected (cold streak, regression candidate)
        features["home_xg_overperformance"] = self._xg_overperformance_cache(
            home, team_history[home], 5
        )
        features["away_xg_overperformance"] = self._xg_overperformance_cache(
            away, team_history[away], 5
        )

        # 10. LAMBDA FEATURES (Poisson attack x defense matchup)
        # lambda_home = home_attack * away_defense (predicts home goals)
        # lambda_away = away_attack * home_defense (predicts away goals)
        hgs5 = features.get("home_goals_scored_5")
        hgc5 = features.get("home_goals_conceded_5")
        ags5 = features.get("away_goals_scored_5")
        agc5 = features.get("away_goals_conceded_5")
        if all(v is not None and not (isinstance(v, float) and np.isnan(v)) for v in [hgs5, agc5, ags5, hgc5]):
            features["lambda_home_5"] = hgs5 * agc5
            features["lambda_away_5"] = ags5 * hgc5
            features["lambda_ratio_5"] = features["lambda_home_5"] / max(0.01, features["lambda_away_5"])
        else:
            features["lambda_home_5"] = np.nan
            features["lambda_away_5"] = np.nan
            features["lambda_ratio_5"] = np.nan

        # Home-specific lambda (home goals at home × away goals conceded away)
        hf5 = self._form_from_cache(home, team_home_history[home], 5)
        af5 = self._form_from_cache(away, team_away_history[away], 5)
        hgs_home = hf5["gs_avg"]
        agc_away = af5["gc_avg"]
        ags_away = af5["gs_avg"]
        hgc_home = hf5["gc_avg"]
        if all(v is not None and not (isinstance(v, float) and np.isnan(v)) for v in [hgs_home, agc_away, ags_away, hgc_home]):
            features["lambda_home_venue"] = hgs_home * agc_away
            features["lambda_away_venue"] = ags_away * hgc_home
        else:
            features["lambda_home_venue"] = np.nan
            features["lambda_away_venue"] = np.nan

        # 11. WEIGHTED LAMBDA (exponential decay: recent matches count more)
        # Weights for last 5 matches: oldest→newest = [0.05, 0.075, 0.125, 0.25, 0.50]
        WEIGHTS_5 = [0.05, 0.075, 0.125, 0.25, 0.50]
        wf_home = self._weighted_form_from_cache(home, team_history[home], 5, WEIGHTS_5)
        wf_away = self._weighted_form_from_cache(away, team_history[away], 5, WEIGHTS_5)
        hgs5w = wf_home["gs_avg"]
        hgc5w = wf_home["gc_avg"]
        ags5w = wf_away["gs_avg"]
        agc5w = wf_away["gc_avg"]
        if all(v is not None and not (isinstance(v, float) and np.isnan(v)) for v in [hgs5w, agc5w, ags5w, hgc5w]):
            features["lambda_home_weighted"] = hgs5w * agc5w
            features["lambda_away_weighted"] = ags5w * hgc5w
            features["lambda_ratio_weighted"] = features["lambda_home_weighted"] / max(0.01, features["lambda_away_weighted"])
        else:
            features["lambda_home_weighted"] = np.nan
            features["lambda_away_weighted"] = np.nan
            features["lambda_ratio_weighted"] = np.nan

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

        # 12. CLV FEATURES (odds movement: closing vs opening)
        # Positive = bookmaker increased odds = market moved against this outcome
        # Negative = bookmaker decreased odds = market confirmed this outcome
        odds_h_close = match.get("odds_home_close")
        odds_d_close = match.get("odds_draw_close")
        odds_a_close = match.get("odds_away_close")
        def _clv(open_o, close_o):
            if open_o and close_o and open_o > 1 and close_o > 1:
                return close_o / open_o - 1.0
            return np.nan
        features["clv_home"] = _clv(odds_h, odds_h_close)
        features["clv_draw"] = _clv(odds_d, odds_d_close)
        features["clv_away"] = _clv(odds_a, odds_a_close)

        # 13. OPPONENT-STRENGTH ADJUSTED GOALS (last 5 matches)
        # Goals weighted by opponent ELO — scoring vs a strong team is worth more
        INITIAL_ELO = 1500.0
        adj_home = self._adj_goals_from_cache(home, team_history[home], 5, INITIAL_ELO)
        adj_away = self._adj_goals_from_cache(away, team_history[away], 5, INITIAL_ELO)
        features["home_adj_gs_5"] = adj_home["adj_gs"]
        features["home_adj_gc_5"] = adj_home["adj_gc"]
        features["away_adj_gs_5"] = adj_away["adj_gs"]
        features["away_adj_gc_5"] = adj_away["adj_gc"]
        # Quality-adjusted lambda (attack strength vs defense quality)
        adj_h_gs = adj_home["adj_gs"]
        adj_a_gc = adj_away["adj_gc"]
        adj_a_gs = adj_away["adj_gs"]
        adj_h_gc = adj_home["adj_gc"]
        if all(v is not None and not (isinstance(v, float) and np.isnan(v)) for v in [adj_h_gs, adj_a_gc, adj_a_gs, adj_h_gc]):
            features["lambda_adj_home"] = adj_h_gs * adj_a_gc
            features["lambda_adj_away"] = adj_a_gs * adj_h_gc
        else:
            features["lambda_adj_home"] = np.nan
            features["lambda_adj_away"] = np.nan

        # 14. LEAGUE & SEASON CONTEXT
        ld = league_draws[league_season]
        features["league_draw_rate"] = ld["draws"] / max(1, ld["total"])
        n_teams = max(len(standings[league_season]), 10)
        expected_season_matches = n_teams * (n_teams - 1)
        features["season_progress"] = league_match_count[league_season] / max(1, expected_season_matches)

        # 15. ELO MOMENTUM (rate of ELO change over last 5 matches)
        features["home_elo_change_5"] = self._elo_change_from_cache(home, team_history[home], 5)
        features["away_elo_change_5"] = self._elo_change_from_cache(away, team_history[away], 5)

        # 16. WIN/LOSS STREAK (consecutive wins = positive, losses = negative)
        features["home_streak"] = self._streak_from_cache(home, team_history[home], 10)
        features["away_streak"] = self._streak_from_cache(away, team_history[away], 10)

        # 17. CLEAN SHEET RATE (last 5 matches)
        features["home_clean_sheet_5"] = self._clean_sheet_rate_from_cache(home, team_history[home], 5)
        features["away_clean_sheet_5"] = self._clean_sheet_rate_from_cache(away, team_history[away], 5)

        # 18. BOOKMAKER VIG (market confidence: higher vig = bookmaker more certain = harder to beat)
        if odds_h and odds_d and odds_a and odds_h > 1 and odds_d > 1 and odds_a > 1:
            features["bookmaker_vig"] = (1.0/odds_h + 1.0/odds_d + 1.0/odds_a) - 1.0
        else:
            features["bookmaker_vig"] = np.nan

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

    def _weighted_form_from_cache(self, team: str, history: list[dict], n: int, weights: list[float]) -> dict:
        """Weighted form stats — recent matches weighted more heavily."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return {"gs_avg": np.nan, "gc_avg": np.nan}
        w = weights[-len(recent):]
        total_w = sum(w)
        if total_w <= 0:
            return {"gs_avg": np.nan, "gc_avg": np.nan}
        scored_w = []
        conceded_w = []
        for i, m in enumerate(recent):
            if m["home_team"] == team:
                scored_w.append(m["fthg"] * w[i])
                conceded_w.append(m["ftag"] * w[i])
            else:
                scored_w.append(m["ftag"] * w[i])
                conceded_w.append(m["fthg"] * w[i])
        return {
            "gs_avg": sum(scored_w) / total_w,
            "gc_avg": sum(conceded_w) / total_w,
        }

    def _adj_goals_from_cache(self, team: str, history: list[dict], n: int, initial_elo: float) -> dict:
        """Goals scored/conceded weighted by opponent ELO strength."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return {"adj_gs": np.nan, "adj_gc": np.nan}
        scored_vals = []
        conceded_vals = []
        for m in recent:
            if m["home_team"] == team:
                opp_elo = m.get("opp_elo_for_home", initial_elo)
                gs = m["fthg"]
                gc = m["ftag"]
            else:
                opp_elo = m.get("opp_elo_for_away", initial_elo)
                gs = m["ftag"]
                gc = m["fthg"]
            strength = opp_elo / initial_elo
            scored_vals.append(gs * strength)
            conceded_vals.append(gc * strength)
        return {
            "adj_gs": float(np.mean(scored_vals)),
            "adj_gc": float(np.mean(conceded_vals)),
        }

    def _elo_change_from_cache(self, team: str, history: list[dict], n: int) -> float:
        """ELO change over last n matches (current_elo - elo_n_games_ago)."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return np.nan
        oldest = recent[0]
        if oldest["home_team"] == team:
            old_elo = oldest.get("home_elo_at_match", 1500.0)
        else:
            old_elo = oldest.get("away_elo_at_match", 1500.0)
        if old_elo is None:
            return np.nan
        return self.elo.get_rating(team) - old_elo

    def _streak_from_cache(self, team: str, history: list[dict], n: int) -> int:
        """Consecutive win (+) or loss (-) streak. 0 if latest result is draw."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return 0
        streak = 0
        expected = None  # "W" or "L"
        for m in reversed(recent):
            won = (m["ftr"] == "H") if m["home_team"] == team else (m["ftr"] == "A")
            lost = (m["ftr"] == "A") if m["home_team"] == team else (m["ftr"] == "H")
            if expected is None:
                if won:
                    streak = 1; expected = "W"
                elif lost:
                    streak = -1; expected = "L"
                else:
                    break  # draw as latest result → streak = 0
            elif expected == "W" and won:
                streak += 1
            elif expected == "L" and lost:
                streak -= 1
            else:
                break
        return streak

    def _clean_sheet_rate_from_cache(self, team: str, history: list[dict], n: int) -> float:
        """Proportion of last n matches where team conceded 0 goals."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return np.nan
        clean = sum(
            1 for m in recent
            if (m["ftag"] == 0 if m["home_team"] == team else m["fthg"] == 0)
        )
        return clean / len(recent)

    def _avg_stat_cache(self, team: str, history: list[dict], n: int, stat: str) -> float | None:
        """Average stat from cache."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return None

        stat_map = {
            "shots": ("home_shots", "away_shots"),
            "shots_target": ("home_shots_target", "away_shots_target"),
            "xg": ("home_xg", "away_xg"),
            "corners": ("home_corners", "away_corners"),
            "yellow": ("home_yellow", "away_yellow"),
            "red": ("home_red", "away_red"),
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
        """Average opponent stat from cache (xG conceded = opponent's xG against this team)."""
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return None

        # For xG conceded: when team is home, opponent (away) xG is "away_xg"
        # When team is away, opponent (home) xG is "home_xg"
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

    def _xg_overperformance_cache(self, team: str, history: list[dict], n: int) -> float:
        """xG overperformance: mean(actual goals - xG) over last n matches.

        Positive = team scores more than model predicts (hot streak or finishing quality).
        Negative = team scores less than model predicts (cold streak or regression candidate).
        Returns NaN if xG data not available.
        """
        recent = history[-n:] if len(history) >= n else history
        if not recent:
            return np.nan

        diffs = []
        for m in recent:
            if m["home_team"] == team:
                goals = m["fthg"]
                xg = m.get("home_xg")
            else:
                goals = m["ftag"]
                xg = m.get("away_xg")
            if xg is not None and not (isinstance(xg, float) and np.isnan(xg)):
                diffs.append(float(goals) - float(xg))

        return float(np.mean(diffs)) if diffs else np.nan

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
    # Goals scored/conceded (individual, not just diff)
    "home_goals_scored_3", "home_goals_conceded_3",
    "away_goals_scored_3", "away_goals_conceded_3",
    "home_goals_scored_5", "home_goals_conceded_5",
    "away_goals_scored_5", "away_goals_conceded_5",
    "home_goal_diff_3", "away_goal_diff_3",
    "home_goal_diff_5", "away_goal_diff_5",
    "home_home_form_5", "away_away_form_5",
    "home_shots_avg_5", "away_shots_avg_5",
    "home_sot_avg_5", "away_sot_avg_5",
    "home_shot_accuracy_5",
    "h2h_home_win_rate", "h2h_draw_rate", "h2h_avg_goals", "h2h_count",
    "home_rest_days", "away_rest_days", "rest_diff",
    "home_position", "away_position", "position_diff",
    "home_xg_avg_5", "away_xg_avg_5", "home_xg_diff_5", "away_xg_diff_5",
    # xG overperformance: actual goals minus expected goals (last 5 matches avg)
    # Positive = scoring above model (hot streak), Negative = below (cold streak)
    "home_xg_overperformance", "away_xg_overperformance",
    # Poisson λ features (attack × defense matchup)
    "lambda_home_5", "lambda_away_5", "lambda_ratio_5",
    "lambda_home_venue", "lambda_away_venue",
    # Weighted λ (exponential decay — recent matches count more)
    "lambda_home_weighted", "lambda_away_weighted", "lambda_ratio_weighted",
    "implied_home", "implied_draw", "implied_away",
    # Opponent-strength adjusted goals (ELO-weighted, last 5)
    "home_adj_gs_5", "home_adj_gc_5",
    "away_adj_gs_5", "away_adj_gc_5",
    "lambda_adj_home", "lambda_adj_away",
    # League & season context
    "league_draw_rate", "season_progress",
    # ELO momentum (trajectory over last 5 matches)
    "home_elo_change_5", "away_elo_change_5",
    # Win/loss streak (consecutive wins = +, losses = -)
    "home_streak", "away_streak",
    # Clean sheet rate (proportion of last 5 matches with 0 goals conceded)
    "home_clean_sheet_5", "away_clean_sheet_5",
    # Bookmaker vig (market overround: higher = bookmaker more confident)
    "bookmaker_vig",
    # Enriched stats (from /teams/statistics — 0 extra API calls)
    "home_possession", "away_possession",
    "home_corners_avg", "away_corners_avg",
    "home_cards_avg", "away_cards_avg",
    # Red cards (disciplinary — correlates with tactics / match intensity)
    "home_red_avg_5", "away_red_avg_5",
]
