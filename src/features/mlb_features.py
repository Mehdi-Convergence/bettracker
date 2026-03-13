"""MLB feature engineering.

CRITICAL: All features use only data BEFORE the game date. No look-ahead bias.

Features:
  - ELO ratings (global + home/away split)
  - Win rate (last 5, 10, 20 games)
  - Runs scored / allowed (rolling)
  - Run differential (rolling)
  - Home/away win rate
  - Rest days
  - Streak
  - Hits avg (rolling)
  - Errors avg (rolling)
  - Implied probability from odds
  - Bookmaker vig
"""

from collections import defaultdict

import numpy as np
import pandas as pd

from src.features.elo import EloRatingSystem

_INITIAL_ELO = 1500.0
_MIN_HISTORY = 5
_K = 24  # MLB ELO k-factor
_HOME_ADV = 40  # slight home advantage in baseball


class MLBFeatureBuilder:
    """Build feature vectors for MLB game prediction."""

    def __init__(self):
        self.elo = EloRatingSystem(k_factor=_K, home_advantage=_HOME_ADV)

    def build_dataset(self, games_df: pd.DataFrame, progress: bool = True) -> pd.DataFrame:
        """Build feature dataset chronologically. No look-ahead bias."""
        games_sorted = games_df.sort_values("game_date").reset_index(drop=True)
        features_list = []

        # team -> list of game dicts (chronological)
        team_history: dict[str, list[dict]] = defaultdict(list)

        total = len(games_sorted)
        log_interval = max(total // 20, 1)

        for idx, game in games_sorted.iterrows():
            if progress and idx % log_interval == 0:
                print(f"  Processing game {idx}/{total} ({idx * 100 // total}%)")

            home = game["home_team"]
            away = game["away_team"]

            # Skip if not enough history
            if len(team_history[home]) < _MIN_HISTORY or len(team_history[away]) < _MIN_HISTORY:
                self._update_cache(game, team_history)
                continue

            features = self._build_features(game, home, away, team_history)
            features["target"] = 1 if game["home_score"] > game["away_score"] else 0
            features["game_date"] = game["game_date"]
            features["season"] = game.get("season")
            features["home_team"] = home
            features["away_team"] = away
            features["game_id"] = game.get("game_id")
            features["_odds_home"] = game.get("odds_home")
            features["_odds_away"] = game.get("odds_away")
            features["_odds_over"] = game.get("odds_over")
            features["_odds_under"] = game.get("odds_under")
            features["_total_line"] = game.get("total_line")

            features_list.append(features)
            self._update_cache(game, team_history)

        if progress:
            print(f"  Done: {len(features_list)} feature vectors built")

        return pd.DataFrame(features_list)

    def _build_features(self, game, home: str, away: str, team_history: dict) -> dict:
        f: dict = {}
        h_hist = team_history[home]
        a_hist = team_history[away]

        # 1. ELO
        f["home_elo"] = self.elo.get_rating(home)
        f["away_elo"] = self.elo.get_rating(away)
        f["elo_diff"] = f["home_elo"] - f["away_elo"]

        # 2. Win rate (last N)
        for n in [5, 10, 20]:
            f[f"home_win_rate_{n}"] = self._win_rate(home, h_hist, n)
            f[f"away_win_rate_{n}"] = self._win_rate(away, a_hist, n)

        # 3. Runs scored / allowed (rolling 10)
        f["home_runs_avg_10"] = self._avg_stat(home, h_hist, 10, "runs_scored")
        f["away_runs_avg_10"] = self._avg_stat(away, a_hist, 10, "runs_scored")
        f["home_runs_allowed_10"] = self._avg_stat(home, h_hist, 10, "runs_allowed")
        f["away_runs_allowed_10"] = self._avg_stat(away, a_hist, 10, "runs_allowed")

        # 4. Run differential (rolling 10)
        f["home_run_diff_10"] = self._avg_run_diff(home, h_hist, 10)
        f["away_run_diff_10"] = self._avg_run_diff(away, a_hist, 10)
        f["run_diff_diff"] = (
            f["home_run_diff_10"] - f["away_run_diff_10"]
            if not (np.isnan(f["home_run_diff_10"]) or np.isnan(f["away_run_diff_10"]))
            else np.nan
        )

        # 5. Rest days
        home_rest = self._rest_days(home, game["game_date"], h_hist)
        away_rest = self._rest_days(away, game["game_date"], a_hist)
        f["home_rest_days"] = float(home_rest) if home_rest is not None else 1.0
        f["away_rest_days"] = float(away_rest) if away_rest is not None else 1.0
        f["rest_diff"] = f["home_rest_days"] - f["away_rest_days"]

        # 6. Home/away win rate (last 20)
        f["home_home_win_rate"] = self._home_win_rate(home, h_hist, 20)
        f["away_away_win_rate"] = self._away_win_rate(away, a_hist, 20)

        # 7. Streak
        f["home_streak"] = self._streak(home, h_hist, 10)
        f["away_streak"] = self._streak(away, a_hist, 10)

        # 8. ELO momentum (change over last 5)
        f["home_elo_change_5"] = self._elo_change(home, h_hist, 5)
        f["away_elo_change_5"] = self._elo_change(away, a_hist, 5)

        # 9. Hits avg (rolling 10) — optional stat
        f["home_hits_avg_10"] = self._avg_stat(home, h_hist, 10, "hits")
        f["away_hits_avg_10"] = self._avg_stat(away, a_hist, 10, "hits")

        # 10. Errors avg (rolling 10) — optional stat
        f["home_errors_avg_10"] = self._avg_stat(home, h_hist, 10, "errors")
        f["away_errors_avg_10"] = self._avg_stat(away, a_hist, 10, "errors")

        # 11. Implied probability from odds
        odds_h = game.get("odds_home")
        odds_a = game.get("odds_away")
        if odds_h and odds_a and odds_h > 1.0 and odds_a > 1.0:
            total_imp = 1 / odds_h + 1 / odds_a
            f["implied_home"] = (1 / odds_h) / total_imp
            f["implied_away"] = (1 / odds_a) / total_imp
            f["bookmaker_vig"] = total_imp - 1.0
        else:
            f["implied_home"] = np.nan
            f["implied_away"] = np.nan
            f["bookmaker_vig"] = np.nan

        # 12. Total line context
        total_line = game.get("total_line")
        f["total_line"] = float(total_line) if total_line else np.nan

        return f

    def _update_cache(self, game, team_history: dict):
        home = game["home_team"]
        away = game["away_team"]
        home_runs = _safe_int(game.get("home_score"))
        away_runs = _safe_int(game.get("away_score"))
        if home_runs is None or away_runs is None:
            return  # Skip games with missing scores

        home_won = home_runs > away_runs

        home_entry = {
            "date": game["game_date"],
            "team": home,
            "opponent": away,
            "is_home": True,
            "won": home_won,
            "runs_scored": home_runs,
            "runs_allowed": away_runs,
            "hits": _safe_int(game.get("home_hits")),
            "errors": _safe_int(game.get("home_errors")),
            "elo_pre": self.elo.get_rating(home),
        }
        away_entry = {
            "date": game["game_date"],
            "team": away,
            "opponent": home,
            "is_home": False,
            "won": not home_won,
            "runs_scored": away_runs,
            "runs_allowed": home_runs,
            "hits": _safe_int(game.get("away_hits")),
            "errors": _safe_int(game.get("away_errors")),
            "elo_pre": self.elo.get_rating(away),
        }
        team_history[home].append(home_entry)
        team_history[away].append(away_entry)

        # Update ELO (run differential as margin proxy)
        run_diff = abs(home_runs - away_runs)
        self.elo.update(
            home if home_won else away,
            away if home_won else home,
            result=1.0,
            goal_diff=run_diff,
        )

    # ------------------------------------------------------------------
    # Stat helpers
    # ------------------------------------------------------------------

    def _win_rate(self, team: str, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        return sum(1 for g in recent if g["won"]) / len(recent)

    def _avg_stat(self, team: str, history: list[dict], n: int, stat: str) -> float:
        recent = history[-n:]
        vals = [g[stat] for g in recent if g.get(stat) is not None]
        return float(np.mean(vals)) if vals else np.nan

    def _avg_run_diff(self, team: str, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        diffs = [
            g["runs_scored"] - g["runs_allowed"]
            for g in recent
            if g.get("runs_scored") is not None and g.get("runs_allowed") is not None
        ]
        return float(np.mean(diffs)) if diffs else np.nan

    def _rest_days(self, team: str, current_date, history: list[dict]) -> int | None:
        if not history:
            return None
        last_date = history[-1]["date"]
        try:
            delta = (pd.Timestamp(current_date) - pd.Timestamp(last_date)).days
            return int(delta)
        except Exception:
            return None

    def _streak(self, team: str, history: list[dict], n: int) -> int:
        recent = history[-n:]
        if not recent:
            return 0
        streak = 0
        expected = None
        for g in reversed(recent):
            if expected is None:
                streak = 1 if g["won"] else -1
                expected = "W" if g["won"] else "L"
            elif expected == "W" and g["won"]:
                streak += 1
            elif expected == "L" and not g["won"]:
                streak -= 1
            else:
                break
        return streak

    def _home_win_rate(self, team: str, history: list[dict], n: int) -> float:
        home_games = [g for g in history if g.get("is_home")][-n:]
        if not home_games:
            return np.nan
        return sum(1 for g in home_games if g["won"]) / len(home_games)

    def _away_win_rate(self, team: str, history: list[dict], n: int) -> float:
        away_games = [g for g in history if not g.get("is_home")][-n:]
        if not away_games:
            return np.nan
        return sum(1 for g in away_games if g["won"]) / len(away_games)

    def _elo_change(self, team: str, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        old_elo = recent[0].get("elo_pre", _INITIAL_ELO) or _INITIAL_ELO
        return self.elo.get_rating(team) - old_elo

    def get_team_snapshot(self, team_history: dict) -> dict:
        """Export current team stats for live prediction."""
        snapshot: dict = {
            "elo": dict(self.elo.ratings),
            "teams": {},
        }
        for team, history in team_history.items():
            if len(history) < _MIN_HISTORY:
                continue
            stats: dict = {}
            for n in [5, 10, 20]:
                stats[f"win_rate_{n}"] = self._win_rate(team, history, n)
            stats["runs_avg_10"] = self._avg_stat(team, history, 10, "runs_scored")
            stats["runs_allowed_10"] = self._avg_stat(team, history, 10, "runs_allowed")
            stats["run_diff_10"] = self._avg_run_diff(team, history, 10)
            stats["hits_avg_10"] = self._avg_stat(team, history, 10, "hits")
            stats["errors_avg_10"] = self._avg_stat(team, history, 10, "errors")
            stats["streak"] = self._streak(team, history, 10)
            stats["home_win_rate"] = self._home_win_rate(team, history, 20)
            stats["away_win_rate"] = self._away_win_rate(team, history, 20)
            stats["elo_change_5"] = self._elo_change(team, history, 5)
            stats["last_game_date"] = str(history[-1]["date"]) if history else None

            # Serialize NaN -> None
            snapshot["teams"][team] = {
                k: (None if isinstance(v, float) and np.isnan(v) else v)
                for k, v in stats.items()
            }
        return snapshot


# ------------------------------------------------------------------
# Feature columns used by the model
# ------------------------------------------------------------------

MLB_FEATURE_COLUMNS = [
    "home_elo", "away_elo", "elo_diff",
    "home_win_rate_5", "away_win_rate_5",
    "home_win_rate_10", "away_win_rate_10",
    "home_win_rate_20", "away_win_rate_20",
    "home_runs_avg_10", "away_runs_avg_10",
    "home_runs_allowed_10", "away_runs_allowed_10",
    "home_run_diff_10", "away_run_diff_10", "run_diff_diff",
    "home_rest_days", "away_rest_days", "rest_diff",
    "home_home_win_rate", "away_away_win_rate",
    "home_streak", "away_streak",
    "home_elo_change_5", "away_elo_change_5",
    "home_hits_avg_10", "away_hits_avg_10",
    "home_errors_avg_10", "away_errors_avg_10",
    # NOTE: implied_home/implied_away/bookmaker_vig/total_line intentionally excluded.
    # Odds availability may be sparse in early seasons; excluded to avoid train/test
    # distribution shift (NaN -> median) that degrades model edge detection.
]


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(float(val)) if val is not None and str(val).strip() != "" else None
    except (TypeError, ValueError):
        return None


def build_mlb_live_features(
    home_team: str,
    away_team: str,
    odds_home: float,
    odds_away: float,
    team_snapshot: dict,
) -> dict:
    """Build a feature vector for a live game using saved team stats snapshot."""
    teams = team_snapshot.get("teams", {})
    elo_map = team_snapshot.get("elo", {})

    h = teams.get(home_team, {})
    a = teams.get(away_team, {})

    def _v(stats: dict, key: str) -> float:
        v = stats.get(key)
        return float(v) if v is not None else np.nan

    f: dict = {}

    # ELO
    f["home_elo"] = float(elo_map.get(home_team, _INITIAL_ELO))
    f["away_elo"] = float(elo_map.get(away_team, _INITIAL_ELO))
    f["elo_diff"] = f["home_elo"] - f["away_elo"]

    # Win rates
    for n in [5, 10, 20]:
        f[f"home_win_rate_{n}"] = _v(h, f"win_rate_{n}")
        f[f"away_win_rate_{n}"] = _v(a, f"win_rate_{n}")

    # Runs
    f["home_runs_avg_10"] = _v(h, "runs_avg_10")
    f["away_runs_avg_10"] = _v(a, "runs_avg_10")
    f["home_runs_allowed_10"] = _v(h, "runs_allowed_10")
    f["away_runs_allowed_10"] = _v(a, "runs_allowed_10")
    f["home_run_diff_10"] = _v(h, "run_diff_10")
    f["away_run_diff_10"] = _v(a, "run_diff_10")
    f["run_diff_diff"] = (
        f["home_run_diff_10"] - f["away_run_diff_10"]
        if not (np.isnan(f["home_run_diff_10"]) or np.isnan(f["away_run_diff_10"]))
        else np.nan
    )

    # Rest — not available from live data, use defaults
    f["home_rest_days"] = 1.0
    f["away_rest_days"] = 1.0
    f["rest_diff"] = 0.0

    # Home/away win rates
    f["home_home_win_rate"] = _v(h, "home_win_rate")
    f["away_away_win_rate"] = _v(a, "away_win_rate")

    # Streak
    f["home_streak"] = float(_v(h, "streak") or 0)
    f["away_streak"] = float(_v(a, "streak") or 0)

    # ELO momentum
    f["home_elo_change_5"] = _v(h, "elo_change_5")
    f["away_elo_change_5"] = _v(a, "elo_change_5")

    # Hits / Errors
    f["home_hits_avg_10"] = _v(h, "hits_avg_10")
    f["away_hits_avg_10"] = _v(a, "hits_avg_10")
    f["home_errors_avg_10"] = _v(h, "errors_avg_10")
    f["away_errors_avg_10"] = _v(a, "errors_avg_10")

    # Implied prob from odds (for context only, not in MLB_FEATURE_COLUMNS)
    if odds_home and odds_away and odds_home > 1.0 and odds_away > 1.0:
        total_imp = 1 / odds_home + 1 / odds_away
        f["implied_home"] = (1 / odds_home) / total_imp
        f["implied_away"] = (1 / odds_away) / total_imp
        f["bookmaker_vig"] = total_imp - 1.0
    else:
        f["implied_home"] = np.nan
        f["implied_away"] = np.nan
        f["bookmaker_vig"] = np.nan

    return f
