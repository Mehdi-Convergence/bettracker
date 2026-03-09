"""Map live API-Football data to V6 ML model feature vector.

All 67 MODEL_FEATURES are populated from the data already fetched during
the AI scan (team stats, standings, H2H, odds). Missing features (ELO,
shots per match, CLV) are set to NaN and filled with 0 at prediction time —
identical to how the model was trained with fillna(0).
"""

import numpy as np
from datetime import datetime

# Historical league draw rates (from training data 2019-2025)
LEAGUE_DRAW_RATES: dict[str, float] = {
    "Premier League": 0.245,
    "La Liga": 0.265,
    "Bundesliga": 0.255,
    "Serie A": 0.275,
    "Ligue 1": 0.270,
    "Ligue 2": 0.275,
    "2. Bundesliga": 0.265,
    "Championship": 0.250,
    "Serie B": 0.280,
    "Eredivisie": 0.255,
    "Primeira Liga": 0.265,
    "Jupiler Pro League": 0.265,
    "Süper Lig": 0.260,
    "Super League 1": 0.265,
    "Premiership": 0.255,
    "Segunda División": 0.275,
    # Cups / European (slightly lower draw rate in knockout phases)
    "FA Cup": 0.215,
    "EFL Cup": 0.215,
    "Coupe de France": 0.220,
    "DFB Pokal": 0.215,
    "Copa del Rey": 0.220,
    "Coppa Italia": 0.220,
    "KNVB Cup": 0.215,
    "Taca de Portugal": 0.220,
    "Belgian Cup": 0.215,
    "Turkish Cup": 0.220,
    "Greek Cup": 0.220,
    "Scottish Cup": 0.215,
    "UEFA Champions League": 0.245,
    "UEFA Europa League": 0.250,
    "UEFA Europa Conference League": 0.255,
}


def _ppg(wins, draws, losses) -> float:
    """Season points-per-game as fraction of max (0–1)."""
    p = (wins or 0) + (draws or 0) + (losses or 0)
    return ((wins or 0) * 3 + (draws or 0)) / (p * 3) if p > 0 else np.nan


def _streak_from_form(form: str) -> int:
    """Consecutive win (+) or loss (−) streak from API form string (W/L/D)."""
    if not form:
        return 0
    streak = 0
    for c in reversed(form.upper()):
        if c == "W" and streak >= 0:
            streak += 1
        elif c == "L" and streak <= 0:
            streak -= 1
        else:
            break
    return streak


def build_live_features(
    stats_h: dict,
    stats_a: dict,
    home_rank: int | None,
    away_rank: int | None,
    h2h_raw: list[dict],
    home_id: int,
    odds_1x2: dict,
    league_name: str,
    fixture_dt: datetime,
) -> dict[str, float]:
    """Return dict mapping MODEL_FEATURES names → float values.

    Uses live API data. Approximate where exact rolling windows unavailable.
    NaN is used for features with no reasonable proxy.
    """
    f: dict[str, float] = {}

    # ------------------------------------------------------------------ #
    # Season-level win rates
    # ------------------------------------------------------------------ #
    h_wins = (stats_h.get("wins_home") or 0) + (stats_h.get("wins_away") or 0)
    h_draws = (stats_h.get("draws_home") or 0) + (stats_h.get("draws_away") or 0)
    h_losses = (stats_h.get("losses_home") or 0) + (stats_h.get("losses_away") or 0)
    a_wins = (stats_a.get("wins_home") or 0) + (stats_a.get("wins_away") or 0)
    a_draws = (stats_a.get("draws_home") or 0) + (stats_a.get("draws_away") or 0)
    a_losses = (stats_a.get("losses_home") or 0) + (stats_a.get("losses_away") or 0)

    h_ppg = _ppg(h_wins, h_draws, h_losses)
    a_ppg = _ppg(a_wins, a_draws, a_losses)
    h_home_ppg = _ppg(stats_h.get("wins_home"), stats_h.get("draws_home"), stats_h.get("losses_home"))
    a_away_ppg = _ppg(stats_a.get("wins_away"), stats_a.get("draws_away"), stats_a.get("losses_away"))

    # Goals averages (use home/away specific if available, else total)
    hgs = stats_h.get("goals_scored_avg_home") or stats_h.get("goals_scored_avg_total") or 1.2
    hgc = stats_h.get("goals_conceded_avg_home") or stats_h.get("goals_conceded_avg_total") or 1.2
    ags = stats_a.get("goals_scored_avg_away") or stats_a.get("goals_scored_avg_total") or 1.2
    agc = stats_a.get("goals_conceded_avg_away") or stats_a.get("goals_conceded_avg_total") or 1.2

    # ------------------------------------------------------------------ #
    # 1. ELO (proxy: rank 1 ≈ 1600, rank 20 ≈ 1431, step ≈ 9pts)
    # ------------------------------------------------------------------ #
    h_elo = 1600.0 - (home_rank - 1) * 9 if home_rank else 1500.0
    a_elo = 1600.0 - (away_rank - 1) * 9 if away_rank else 1500.0
    f["home_elo"] = h_elo
    f["away_elo"] = a_elo
    f["elo_diff"] = h_elo - a_elo

    # ------------------------------------------------------------------ #
    # 2. Form windows (season avg as proxy for last-3/5/10)
    # ------------------------------------------------------------------ #
    for n in [3, 5, 10]:
        f[f"home_form_{n}"] = h_ppg
        f[f"away_form_{n}"] = a_ppg
        f[f"home_goals_scored_{n}"] = hgs
        f[f"home_goals_conceded_{n}"] = hgc
        f[f"away_goals_scored_{n}"] = ags
        f[f"away_goals_conceded_{n}"] = agc
        f[f"home_goal_diff_{n}"] = hgs - hgc
        f[f"away_goal_diff_{n}"] = ags - agc

    f["home_home_form_5"] = h_home_ppg
    f["away_away_form_5"] = a_away_ppg

    # ------------------------------------------------------------------ #
    # 3. Shots (not available per match from API)
    # ------------------------------------------------------------------ #
    f["home_shots_avg_5"] = np.nan
    f["away_shots_avg_5"] = np.nan
    f["home_sot_avg_5"] = np.nan
    f["away_sot_avg_5"] = np.nan
    f["home_shot_accuracy_5"] = np.nan

    # ------------------------------------------------------------------ #
    # 4. H2H
    # ------------------------------------------------------------------ #
    if h2h_raw:
        recent = h2h_raw[:6]
        total = len(recent)
        h_wins_h2h = sum(1 for m in recent if m.get("winner_id") == home_id)
        draws_h2h = sum(1 for m in recent if m.get("winner_id") is None and m.get("score_h") is not None)
        goals = [m.get("score_h", 0) + m.get("score_a", 0) for m in recent if m.get("score_h") is not None]
        f["h2h_home_win_rate"] = h_wins_h2h / total if total > 0 else np.nan
        f["h2h_draw_rate"] = draws_h2h / total if total > 0 else np.nan
        f["h2h_avg_goals"] = sum(goals) / len(goals) if goals else np.nan
        f["h2h_count"] = float(total)
    else:
        f["h2h_home_win_rate"] = np.nan
        f["h2h_draw_rate"] = np.nan
        f["h2h_avg_goals"] = np.nan
        f["h2h_count"] = 0.0

    # ------------------------------------------------------------------ #
    # 5. Rest days (not available from API scan)
    # ------------------------------------------------------------------ #
    f["home_rest_days"] = np.nan
    f["away_rest_days"] = np.nan
    f["rest_diff"] = 0.0

    # ------------------------------------------------------------------ #
    # 6. Positions
    # ------------------------------------------------------------------ #
    f["home_position"] = float(home_rank) if home_rank else np.nan
    f["away_position"] = float(away_rank) if away_rank else np.nan
    f["position_diff"] = f["home_position"] - f["away_position"] if home_rank and away_rank else np.nan

    # ------------------------------------------------------------------ #
    # 7. Poisson lambda features
    # ------------------------------------------------------------------ #
    lh = hgs * agc
    la = ags * hgc
    f["lambda_home_5"] = lh
    f["lambda_away_5"] = la
    f["lambda_ratio_5"] = lh / max(0.01, la)
    f["lambda_home_venue"] = lh
    f["lambda_away_venue"] = la
    f["lambda_home_weighted"] = lh
    f["lambda_away_weighted"] = la
    f["lambda_ratio_weighted"] = lh / max(0.01, la)

    # ------------------------------------------------------------------ #
    # 8. Implied probabilities & bookmaker vig
    # ------------------------------------------------------------------ #
    def _best(d: dict) -> float | None:
        vals = [float(v) for v in (d or {}).values() if v and float(v) > 1.0]
        return max(vals) if vals else None

    oh = _best(odds_1x2.get("H", {}))
    od = _best(odds_1x2.get("D", {}))
    oa = _best(odds_1x2.get("A", {}))
    if oh and od and oa:
        vig_total = 1 / oh + 1 / od + 1 / oa
        f["implied_home"] = (1 / oh) / vig_total
        f["implied_draw"] = (1 / od) / vig_total
        f["implied_away"] = (1 / oa) / vig_total
        f["bookmaker_vig"] = vig_total - 1.0
    else:
        f["implied_home"] = np.nan
        f["implied_draw"] = np.nan
        f["implied_away"] = np.nan
        f["bookmaker_vig"] = np.nan

    # ------------------------------------------------------------------ #
    # 9. CLV (not available — opening odds not in API)
    # ------------------------------------------------------------------ #
    f["clv_home"] = np.nan
    f["clv_draw"] = np.nan
    f["clv_away"] = np.nan

    # ------------------------------------------------------------------ #
    # 10. Adjusted goals (ELO-weighted not available → use raw as proxy)
    # ------------------------------------------------------------------ #
    f["home_adj_gs_5"] = hgs
    f["home_adj_gc_5"] = hgc
    f["away_adj_gs_5"] = ags
    f["away_adj_gc_5"] = agc
    f["lambda_adj_home"] = lh
    f["lambda_adj_away"] = la

    # ------------------------------------------------------------------ #
    # 11. League & season context
    # ------------------------------------------------------------------ #
    f["league_draw_rate"] = LEAGUE_DRAW_RATES.get(league_name, 0.265)

    try:
        yr = fixture_dt.year if fixture_dt.month >= 7 else fixture_dt.year - 1
        season_start = datetime(yr, 7, 1)
        season_end = datetime(yr + 1, 6, 15)
        prog = (fixture_dt - season_start).days / max(1, (season_end - season_start).days)
        f["season_progress"] = float(max(0.0, min(1.0, prog)))
    except Exception:
        f["season_progress"] = 0.7

    # ------------------------------------------------------------------ #
    # 12. ELO momentum & streak
    # ------------------------------------------------------------------ #
    form_h = (stats_h.get("form") or "")[-5:]
    form_a = (stats_a.get("form") or "")[-5:]
    h_streak = _streak_from_form(form_h)
    a_streak = _streak_from_form(form_a)
    f["home_streak"] = float(h_streak)
    f["away_streak"] = float(a_streak)
    # ELO change proxy: each consecutive win/loss ≈ ±6 ELO points
    f["home_elo_change_5"] = float(h_streak * 6)
    f["away_elo_change_5"] = float(a_streak * 6)

    # ------------------------------------------------------------------ #
    # 13. Clean sheet rate (season, not last-5 rolling)
    # ------------------------------------------------------------------ #
    h_played = max(1, (stats_h.get("played_home") or 0) + (stats_h.get("played_away") or 0))
    a_played = max(1, (stats_a.get("played_home") or 0) + (stats_a.get("played_away") or 0))
    h_cs = (stats_h.get("clean_sheets_home") or 0) + (stats_h.get("clean_sheets_away") or 0)
    a_cs = (stats_a.get("clean_sheets_home") or 0) + (stats_a.get("clean_sheets_away") or 0)
    f["home_clean_sheet_5"] = h_cs / h_played
    f["away_clean_sheet_5"] = a_cs / a_played

    return f
