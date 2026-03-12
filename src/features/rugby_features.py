"""Rugby feature engineering.

CRITICAL: All features use only data BEFORE the match date. No look-ahead bias.

Features:
  - ELO ratings (global, K=32 — higher than NBA due to more variance)
  - Win rate (last 5, 10 matches)
  - Points scored / allowed (rolling 5, 10)
  - Point differential (rolling)
  - Tries avg (rolling 10)
  - Penalties avg (rolling 10)
  - Home advantage (very strong in rugby)
  - Home/away win rates
  - H2H record (last 5)
  - Rest days + fatigue flag
  - Streak
  - ELO momentum
  - Implied probability from odds (1X2)
"""

import logging
from collections import defaultdict

import numpy as np
import pandas as pd

from src.features.elo import EloRatingSystem

logger = logging.getLogger(__name__)

_INITIAL_ELO = 1500.0
_MIN_HISTORY = 5
_K = 32  # Higher K than NBA — rugby results are more volatile
_HOME_ADV_ELO = 75  # Rugby home advantage is very strong (comparable to football)


class RugbyFeatureBuilder:
    """Build feature vectors for rugby match prediction."""

    def __init__(self):
        self.elo = EloRatingSystem(k_factor=_K, home_advantage=_HOME_ADV_ELO)

    def build_dataset(self, games_df: pd.DataFrame, progress: bool = True) -> pd.DataFrame:
        """Build feature dataset chronologically. No look-ahead bias."""
        games_sorted = games_df.sort_values("match_date").reset_index(drop=True)
        features_list = []

        team_history: dict[str, list[dict]] = defaultdict(list)

        total = len(games_sorted)
        log_interval = max(total // 20, 1)

        for idx, game in games_sorted.iterrows():
            if progress and idx % log_interval == 0:
                logger.info("  Processing match %d/%d (%d%%)", idx, total, idx * 100 // total)

            home = game["home_team"]
            away = game["away_team"]

            if len(team_history[home]) < _MIN_HISTORY or len(team_history[away]) < _MIN_HISTORY:
                self._update_cache(game, team_history)
                continue

            features = self._build_features(game, home, away, team_history)

            # Target: 1 = home win, 0 = draw/away win (binary for primary model)
            home_pts = _safe_int(game.get("home_score"))
            away_pts = _safe_int(game.get("away_score"))
            if home_pts is None or away_pts is None:
                self._update_cache(game, team_history)
                continue

            features["target"] = 1 if home_pts > away_pts else 0
            features["result"] = "H" if home_pts > away_pts else ("D" if home_pts == away_pts else "A")
            features["match_date"] = game["match_date"]
            features["season"] = game.get("season")
            features["league"] = game.get("league")
            features["home_team"] = home
            features["away_team"] = away
            features["_odds_home"] = game.get("odds_home")
            features["_odds_draw"] = game.get("odds_draw")
            features["_odds_away"] = game.get("odds_away")
            features["_total_line"] = game.get("total_line")

            features_list.append(features)
            self._update_cache(game, team_history)

        if progress:
            logger.info("  Done: %d feature vectors built", len(features_list))

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
        for n in [5, 10]:
            f[f"home_win_rate_{n}"] = self._win_rate(h_hist, n)
            f[f"away_win_rate_{n}"] = self._win_rate(a_hist, n)

        # 3. Points scored / allowed (rolling 5 and 10)
        for n in [5, 10]:
            f[f"home_pts_avg_{n}"] = self._avg_stat(h_hist, n, "pts_scored")
            f[f"away_pts_avg_{n}"] = self._avg_stat(a_hist, n, "pts_scored")
            f[f"home_pts_allowed_{n}"] = self._avg_stat(h_hist, n, "pts_allowed")
            f[f"away_pts_allowed_{n}"] = self._avg_stat(a_hist, n, "pts_allowed")

        # 4. Point differential (rolling 10)
        f["home_pt_diff_10"] = self._avg_point_diff(h_hist, 10)
        f["away_pt_diff_10"] = self._avg_point_diff(a_hist, 10)
        f["pt_diff_diff"] = (
            f["home_pt_diff_10"] - f["away_pt_diff_10"]
            if not (np.isnan(f["home_pt_diff_10"]) or np.isnan(f["away_pt_diff_10"]))
            else np.nan
        )

        # 5. Tries avg (rolling 10) — key rugby metric
        f["home_tries_avg_10"] = self._avg_stat(h_hist, 10, "tries_scored")
        f["away_tries_avg_10"] = self._avg_stat(a_hist, 10, "tries_scored")
        f["home_tries_allowed_10"] = self._avg_stat(h_hist, 10, "tries_allowed")
        f["away_tries_allowed_10"] = self._avg_stat(a_hist, 10, "tries_allowed")

        # 6. Penalties avg (rolling 10) — penalty-heavy teams are predictable
        f["home_penalties_avg_10"] = self._avg_stat(h_hist, 10, "penalties")
        f["away_penalties_avg_10"] = self._avg_stat(a_hist, 10, "penalties")

        # 7. Rest days + fatigue (Champions Cup teams often play mid-week)
        home_rest = self._rest_days(game["match_date"], h_hist)
        away_rest = self._rest_days(game["match_date"], a_hist)
        f["home_rest_days"] = float(home_rest) if home_rest is not None else 7.0
        f["away_rest_days"] = float(away_rest) if away_rest is not None else 7.0
        f["rest_diff"] = f["home_rest_days"] - f["away_rest_days"]
        f["home_fatigue"] = 1.0 if (home_rest is not None and home_rest <= 5) else 0.0
        f["away_fatigue"] = 1.0 if (away_rest is not None and away_rest <= 5) else 0.0

        # 8. Home/away win rates (last 10)
        f["home_home_win_rate"] = self._home_win_rate(h_hist, 10)
        f["away_away_win_rate"] = self._away_win_rate(a_hist, 10)

        # 9. H2H record (last 5 head-to-heads)
        f["h2h_home_win_rate"] = self._h2h_win_rate(home, away, h_hist, 5)

        # 10. Streak
        f["home_streak"] = float(self._streak(h_hist, 10))
        f["away_streak"] = float(self._streak(a_hist, 10))

        # 11. ELO momentum (change over last 5)
        f["home_elo_change_5"] = self._elo_change(home, h_hist, 5)
        f["away_elo_change_5"] = self._elo_change(away, a_hist, 5)

        # 12. Implied probability from 1X2 odds
        odds_h = game.get("odds_home")
        odds_d = game.get("odds_draw")
        odds_a = game.get("odds_away")
        if odds_h and odds_d and odds_a and all(o > 1.0 for o in [odds_h, odds_d, odds_a]):
            total_imp = 1 / odds_h + 1 / odds_d + 1 / odds_a
            f["implied_home"] = (1 / odds_h) / total_imp
            f["implied_draw"] = (1 / odds_d) / total_imp
            f["implied_away"] = (1 / odds_a) / total_imp
            f["bookmaker_vig"] = total_imp - 1.0
        else:
            f["implied_home"] = np.nan
            f["implied_draw"] = np.nan
            f["implied_away"] = np.nan
            f["bookmaker_vig"] = np.nan

        # 13. Total line context
        total_line = game.get("total_line")
        f["total_line"] = float(total_line) if total_line else np.nan

        return f

    def _update_cache(self, game, team_history: dict) -> None:
        home = game["home_team"]
        away = game["away_team"]
        home_pts = _safe_int(game.get("home_score"))
        away_pts = _safe_int(game.get("away_score"))
        if home_pts is None or away_pts is None:
            return

        home_won = home_pts > away_pts
        is_draw = home_pts == away_pts

        elo_result = 1.0 if home_won else (0.5 if is_draw else 0.0)

        home_entry = {
            "date": game["match_date"],
            "team": home,
            "opponent": away,
            "is_home": True,
            "won": home_won,
            "is_draw": is_draw,
            "pts_scored": home_pts,
            "pts_allowed": away_pts,
            "tries_scored": _safe_int(game.get("home_tries")),
            "tries_allowed": _safe_int(game.get("away_tries")),
            "penalties": _safe_int(game.get("home_penalties")),
            "elo_pre": self.elo.get_rating(home),
        }
        away_entry = {
            "date": game["match_date"],
            "team": away,
            "opponent": home,
            "is_home": False,
            "won": not home_won and not is_draw,
            "is_draw": is_draw,
            "pts_scored": away_pts,
            "pts_allowed": home_pts,
            "tries_scored": _safe_int(game.get("away_tries")),
            "tries_allowed": _safe_int(game.get("home_tries")),
            "penalties": _safe_int(game.get("away_penalties")),
            "elo_pre": self.elo.get_rating(away),
        }
        team_history[home].append(home_entry)
        team_history[away].append(away_entry)

        point_diff = abs(home_pts - away_pts)
        self.elo.update(home, away, result=elo_result, goal_diff=point_diff)

    # ------------------------------------------------------------------
    # Stat helpers
    # ------------------------------------------------------------------

    def _win_rate(self, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        return sum(1 for g in recent if g["won"]) / len(recent)

    def _avg_stat(self, history: list[dict], n: int, stat: str) -> float:
        recent = history[-n:]
        vals = [g[stat] for g in recent if g.get(stat) is not None]
        return float(np.mean(vals)) if vals else np.nan

    def _avg_point_diff(self, history: list[dict], n: int) -> float:
        recent = history[-n:]
        if not recent:
            return np.nan
        diffs = [
            g["pts_scored"] - g["pts_allowed"]
            for g in recent
            if g.get("pts_scored") is not None and g.get("pts_allowed") is not None
        ]
        return float(np.mean(diffs)) if diffs else np.nan

    def _rest_days(self, current_date, history: list[dict]) -> int | None:
        if not history:
            return None
        last_date = history[-1]["date"]
        try:
            delta = (pd.Timestamp(current_date) - pd.Timestamp(last_date)).days
            return int(delta)
        except Exception:
            return None

    def _streak(self, history: list[dict], n: int) -> int:
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

    def _home_win_rate(self, history: list[dict], n: int) -> float:
        home_games = [g for g in history if g.get("is_home")][-n:]
        if not home_games:
            return np.nan
        return sum(1 for g in home_games if g["won"]) / len(home_games)

    def _away_win_rate(self, history: list[dict], n: int) -> float:
        away_games = [g for g in history if not g.get("is_home")][-n:]
        if not away_games:
            return np.nan
        return sum(1 for g in away_games if g["won"]) / len(away_games)

    def _h2h_win_rate(self, home: str, away: str, history: list[dict], n: int) -> float:
        """Win rate of home team in last n H2H matches against away team."""
        h2h = [g for g in history if g.get("opponent") == away][-n:]
        if not h2h:
            return np.nan
        return sum(1 for g in h2h if g["won"]) / len(h2h)

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
            for n in [5, 10]:
                stats[f"win_rate_{n}"] = self._win_rate(history, n)
                stats[f"pts_avg_{n}"] = self._avg_stat(history, n, "pts_scored")
                stats[f"pts_allowed_{n}"] = self._avg_stat(history, n, "pts_allowed")
            stats["pt_diff_10"] = self._avg_point_diff(history, 10)
            stats["tries_avg_10"] = self._avg_stat(history, 10, "tries_scored")
            stats["tries_allowed_10"] = self._avg_stat(history, 10, "tries_allowed")
            stats["penalties_avg_10"] = self._avg_stat(history, 10, "penalties")
            stats["streak"] = self._streak(history, 10)
            stats["home_win_rate"] = self._home_win_rate(history, 10)
            stats["away_win_rate"] = self._away_win_rate(history, 10)
            stats["elo_change_5"] = self._elo_change(team, history, 5)
            stats["last_game_date"] = str(history[-1]["date"]) if history else None

            snapshot["teams"][team] = {
                k: (None if isinstance(v, float) and np.isnan(v) else v)
                for k, v in stats.items()
            }
        return snapshot


# ------------------------------------------------------------------
# Feature columns used by the model
# ------------------------------------------------------------------

RUGBY_FEATURE_COLUMNS = [
    "home_elo", "away_elo", "elo_diff",
    "home_win_rate_5", "away_win_rate_5",
    "home_win_rate_10", "away_win_rate_10",
    "home_pts_avg_5", "away_pts_avg_5",
    "home_pts_avg_10", "away_pts_avg_10",
    "home_pts_allowed_5", "away_pts_allowed_5",
    "home_pts_allowed_10", "away_pts_allowed_10",
    "home_pt_diff_10", "away_pt_diff_10", "pt_diff_diff",
    "home_tries_avg_10", "away_tries_avg_10",
    "home_tries_allowed_10", "away_tries_allowed_10",
    "home_penalties_avg_10", "away_penalties_avg_10",
    "home_rest_days", "away_rest_days", "rest_diff",
    "home_fatigue", "away_fatigue",
    "home_home_win_rate", "away_away_win_rate",
    "h2h_home_win_rate",
    "home_streak", "away_streak",
    "home_elo_change_5", "away_elo_change_5",
    # Odds excluded from feature set to avoid train/test distribution shift
    # (same reasoning as NBA: historical data coverage is uneven)
]


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(float(val)) if val is not None and str(val).strip() not in ("", "null", "None") else None
    except (TypeError, ValueError):
        return None


def build_rugby_live_features(
    home_team: str,
    away_team: str,
    odds_home: float,
    odds_draw: float | None,
    odds_away: float,
    odds_over: float | None,
    odds_under: float | None,
    total_line: float | None,
    team_snapshot: dict,
) -> dict:
    """Build a feature vector for a live rugby match using saved team stats snapshot."""
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
    for n in [5, 10]:
        f[f"home_win_rate_{n}"] = _v(h, f"win_rate_{n}")
        f[f"away_win_rate_{n}"] = _v(a, f"win_rate_{n}")

    # Points
    for n in [5, 10]:
        f[f"home_pts_avg_{n}"] = _v(h, f"pts_avg_{n}")
        f[f"away_pts_avg_{n}"] = _v(a, f"pts_avg_{n}")
        f[f"home_pts_allowed_{n}"] = _v(h, f"pts_allowed_{n}")
        f[f"away_pts_allowed_{n}"] = _v(a, f"pts_allowed_{n}")

    f["home_pt_diff_10"] = _v(h, "pt_diff_10")
    f["away_pt_diff_10"] = _v(a, "pt_diff_10")
    f["pt_diff_diff"] = (
        f["home_pt_diff_10"] - f["away_pt_diff_10"]
        if not (np.isnan(f["home_pt_diff_10"]) or np.isnan(f["away_pt_diff_10"]))
        else np.nan
    )

    # Tries
    f["home_tries_avg_10"] = _v(h, "tries_avg_10")
    f["away_tries_avg_10"] = _v(a, "tries_avg_10")
    f["home_tries_allowed_10"] = _v(h, "tries_allowed_10")
    f["away_tries_allowed_10"] = _v(a, "tries_allowed_10")

    # Penalties
    f["home_penalties_avg_10"] = _v(h, "penalties_avg_10")
    f["away_penalties_avg_10"] = _v(a, "penalties_avg_10")

    # Rest — not available from live data, use reasonable defaults
    f["home_rest_days"] = 7.0
    f["away_rest_days"] = 7.0
    f["rest_diff"] = 0.0
    f["home_fatigue"] = 0.0
    f["away_fatigue"] = 0.0

    # Home/away win rates
    f["home_home_win_rate"] = _v(h, "home_win_rate")
    f["away_away_win_rate"] = _v(a, "away_win_rate")

    # H2H — not available from live snapshot
    f["h2h_home_win_rate"] = np.nan

    # Streak
    f["home_streak"] = float(_v(h, "streak") or 0)
    f["away_streak"] = float(_v(a, "streak") or 0)

    # ELO momentum
    f["home_elo_change_5"] = _v(h, "elo_change_5")
    f["away_elo_change_5"] = _v(a, "elo_change_5")

    # Implied prob from 1X2 odds (not used in model training but useful for display)
    if odds_home and odds_draw and odds_away and all(o > 1.0 for o in [odds_home, odds_draw, odds_away]):
        total_imp = 1 / odds_home + 1 / odds_draw + 1 / odds_away
        f["implied_home"] = (1 / odds_home) / total_imp
        f["implied_draw"] = (1 / odds_draw) / total_imp
        f["implied_away"] = (1 / odds_away) / total_imp
        f["bookmaker_vig"] = total_imp - 1.0
    else:
        f["implied_home"] = np.nan
        f["implied_draw"] = np.nan
        f["implied_away"] = np.nan
        f["bookmaker_vig"] = np.nan

    f["total_line"] = float(total_line) if total_line else np.nan

    return f
