import numpy as np
import pandas as pd


def get_team_matches(team: str, matches: pd.DataFrame, venue: str | None = None) -> pd.DataFrame:
    """Get all matches for a team, optionally filtered by venue."""
    if venue == "home":
        return matches[matches["home_team"] == team]
    elif venue == "away":
        return matches[matches["away_team"] == team]
    else:
        return matches[(matches["home_team"] == team) | (matches["away_team"] == team)]


def get_last_n_matches(team: str, matches: pd.DataFrame, n: int, venue: str | None = None) -> pd.DataFrame:
    """Get last N matches for a team before (already filtered by date)."""
    team_matches = get_team_matches(team, matches, venue)
    return team_matches.sort_values("date", ascending=False).head(n)


def team_points_in_match(team: str, row: pd.Series) -> int:
    """Points earned by team in a match: W=3, D=1, L=0."""
    if row["home_team"] == team:
        return {"H": 3, "D": 1, "A": 0}.get(row["ftr"], 0)
    elif row["away_team"] == team:
        return {"A": 3, "D": 1, "H": 0}.get(row["ftr"], 0)
    return 0


def team_goals_scored(team: str, row: pd.Series) -> int:
    if row["home_team"] == team:
        return int(row["fthg"])
    elif row["away_team"] == team:
        return int(row["ftag"])
    return 0


def team_goals_conceded(team: str, row: pd.Series) -> int:
    if row["home_team"] == team:
        return int(row["ftag"])
    elif row["away_team"] == team:
        return int(row["fthg"])
    return 0


def team_stat(team: str, row: pd.Series, stat: str) -> float | None:
    """Get a stat for a team in a match (shots, sot, corners, etc.)."""
    stat_map = {
        "shots": ("home_shots", "away_shots"),
        "shots_target": ("home_shots_target", "away_shots_target"),
        "corners": ("home_corners", "away_corners"),
        "fouls": ("home_fouls", "away_fouls"),
        "yellow": ("home_yellow", "away_yellow"),
        "red": ("home_red", "away_red"),
        "xg": ("home_xg", "away_xg"),
    }
    if stat not in stat_map:
        return None
    home_col, away_col = stat_map[stat]
    if row["home_team"] == team:
        val = row.get(home_col)
    elif row["away_team"] == team:
        val = row.get(away_col)
    else:
        return None
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return float(val)


def team_stat_conceded(team: str, row: pd.Series, stat: str) -> float | None:
    """Get the opponent's stat for a team in a match."""
    stat_map = {
        "shots": ("away_shots", "home_shots"),
        "shots_target": ("away_shots_target", "home_shots_target"),
        "xg": ("away_xg", "home_xg"),
    }
    if stat not in stat_map:
        return None
    home_col, away_col = stat_map[stat]
    if row["home_team"] == team:
        val = row.get(home_col)
    elif row["away_team"] == team:
        val = row.get(away_col)
    else:
        return None
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return float(val)
