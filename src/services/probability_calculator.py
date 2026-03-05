"""Probability calculator for AI scan matches.

Combines Poisson model (when goals averages available) with heuristic
adjustments (form, position, H2H, absences, xG).

Architecture is data-resilient: works with partial data, produces a
data_quality score (green/yellow/red) based on how many inputs were used.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Literal


# ---------------------------------------------------------------------------
# Data quality thresholds
# ---------------------------------------------------------------------------
# Points available:
#   [always]   odds H/D/A                  -> 3 pts
#   [optional] form_home                   -> 1 pt
#   [optional] form_away                   -> 1 pt
#   [optional] position_home               -> 1 pt
#   [optional] position_away               -> 1 pt
#   [optional] h2h_summary                 -> 1 pt
#   [optional] key_absences                -> 1 pt
#   [api]      home goals scored/conceded  -> 2 pts
#   [api]      away goals scored/conceded  -> 2 pts
#   [api]      xg_home/away               -> 2 pts
#   [api]      lineup_confirmed           -> 1 pt
#   [api]      h2h_details (structured)   -> 1 pt
MAX_POINTS = 20
BASE_POINTS = 3  # always available (odds)

GREEN_THRESHOLD = 0.55
YELLOW_THRESHOLD = 0.30

HOME_ADV = 1.10         # Poisson home advantage factor
LEAGUE_AVG_GOALS = 2.6  # default if not provided


@dataclass
class MatchProbabilityResult:
    """Output of the probability calculator for one match."""
    # Estimated probabilities (sum = 1)
    home_prob: float
    draw_prob: float
    away_prob: float
    # Edge vs bookmaker implied probability (positive = value bet)
    edges: dict[str, float] = field(default_factory=dict)
    # Data quality
    data_quality: Literal["green", "yellow", "red"] = "red"
    data_score: float = 0.0
    data_points_used: int = 0
    data_points_max: int = MAX_POINTS
    # Which inputs were used
    used_odds: bool = False
    used_form: bool = False
    used_position: bool = False
    used_h2h: bool = False
    used_absences: bool = False
    used_poisson: bool = False
    # Poisson lambdas (for display/debug)
    lambda_home: float | None = None
    lambda_away: float | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _form_strength(form: str | None) -> float | None:
    """Convert form string to strength 0-1.

    Supports both BetTracker (V/N/D) and API-Football (W/D/L) formats.
    V/W = Victoire/Win = 1.0
    N   = Nul = 0.5
    D/L = Defaite/Loss = 0.0
    P   = Participation (neutral) = 0.5
    """
    if not form:
        return None
    # V=Victoire, W=Win, N=Nul, D=Defaite, L=Loss, P=Participation
    mapping = {"V": 1.0, "W": 1.0, "N": 0.5, "D": 0.0, "L": 0.0, "P": 0.5}
    chars = list(form.upper().strip())[-5:]
    if not chars:
        return None
    return sum(mapping.get(c, 0.5) for c in chars) / len(chars)


def _position_advantage(pos_home: int | None, pos_away: int | None, league_size: int = 20) -> float | None:
    """Home advantage from league positions. Range: -0.15 to +0.15."""
    if pos_home is None or pos_away is None:
        return None
    gap = pos_away - pos_home  # positive = home has better rank
    factor = gap / (league_size * 2)
    return max(-0.15, min(0.15, factor))


def _remove_overround(h: float, d: float, a: float) -> tuple[float, float, float]:
    """Remove bookmaker margin, return fair implied probabilities."""
    total = h + d + a
    if total <= 0:
        return 1 / 3, 1 / 3, 1 / 3
    return h / total, d / total, a / total


def _absence_penalty(absences: list[str], key_player_goals_per_match: float = 0.0) -> float:
    """Penalty for key absences, weighted by player importance.

    - Top scorer absent (>0.4 goals/match): -0.06
    - Regular player absent: -0.02
    Max 3 players counted.
    """
    if not absences:
        return 0.0
    count = min(len(absences), 3)
    base = count * 0.02
    # Boost if the top scorer is among absentees
    if key_player_goals_per_match >= 0.4:
        base += 0.04
    return min(base, 0.10)


def _h2h_adjustment(h2h_summary: str | None, h2h_details: list[dict] | None, home_team_id: int | None = None) -> float:
    """Return H2H adjustment for home team. Range: -0.04 to +0.04.

    Tries structured data first (h2h_details), then parses text ('5V 2N 3D').
    """
    # 1. Structured H2H details (most reliable)
    if h2h_details and home_team_id:
        wins = sum(1 for m in h2h_details if m.get("winner_id") == home_team_id)
        total = len(h2h_details)
        if total > 0:
            return (wins / total - 0.5) * 0.08

    # 2. Numeric pattern in summary text: "5V 2N 3D" or "5W 2D 3L"
    if h2h_summary:
        m = re.search(r'(\d+)\s*[VW]\s+(\d+)\s*[ND]\s+(\d+)\s*[DL]', h2h_summary, re.IGNORECASE)
        if m:
            wins, draws, losses = int(m.group(1)), int(m.group(2)), int(m.group(3))
            total = wins + draws + losses
            if total > 0:
                return (wins / total - 0.5) * 0.08

        # 3. Keyword fallback (French)
        text = h2h_summary.lower()
        if any(w in text for w in ["domicile", "home wins", "victoires a domicile"]):
            return 0.03
        if any(w in text for w in ["exterieur", "away wins", "victoires a l'ext"]):
            return -0.03

    return 0.0


def _poisson_probs(lambda_h: float, lambda_a: float, max_goals: int = 10) -> tuple[float, float, float]:
    """Compute P(home wins), P(draw), P(away wins) via Poisson distribution."""
    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            p = (math.exp(-lambda_h) * lambda_h ** i / math.factorial(i)
                 * math.exp(-lambda_a) * lambda_a ** j / math.factorial(j))
            if i > j:
                p_home += p
            elif i == j:
                p_draw += p
            else:
                p_away += p
    total = p_home + p_draw + p_away
    if total <= 0:
        return 1 / 3, 1 / 3, 1 / 3
    return p_home / total, p_draw / total, p_away / total


# ---------------------------------------------------------------------------
# Main football calculator
# ---------------------------------------------------------------------------

def calculate_football(
    odds_h: float,
    odds_d: float,
    odds_a: float,
    # Form (V/N/D or W/D/L)
    form_home: str | None = None,
    form_away: str | None = None,
    # League position
    position_home: int | None = None,
    position_away: int | None = None,
    # H2H
    h2h_summary: str | None = None,
    h2h_details: list[dict] | None = None,   # structured [{winner_id, ...}]
    home_team_id: int | None = None,          # needed for structured H2H
    # Absences
    key_absences_home: list[str] | None = None,
    key_absences_away: list[str] | None = None,
    home_top_scorer_gpm: float = 0.0,         # goals/match of top absent home player
    away_top_scorer_gpm: float = 0.0,
    lineup_confirmed: bool = False,
    # Goals averages (from API-Football team stats)
    home_goals_scored_avg: float | None = None,
    home_goals_conceded_avg: float | None = None,
    away_goals_scored_avg: float | None = None,
    away_goals_conceded_avg: float | None = None,
    league_avg_goals: float = LEAGUE_AVG_GOALS,
    # xG (optional)
    xg_home: float | None = None,
    xg_away: float | None = None,
    # BTTS% (optional, currently for data quality only)
    btts_pct_home: float | None = None,
    btts_pct_away: float | None = None,
) -> MatchProbabilityResult:
    """Estimate fair probabilities and value edge for a football match.

    When goals averages are available: 50% Poisson + 50% implied odds.
    Otherwise: 100% implied odds + heuristic adjustments.
    """
    key_absences_home = key_absences_home or []
    key_absences_away = key_absences_away or []

    data_points = 0

    # --- Implied base probabilities ---
    if odds_h <= 0 or odds_d <= 0 or odds_a <= 0:
        return MatchProbabilityResult(
            home_prob=1 / 3, draw_prob=1 / 3, away_prob=1 / 3,
            edges={"H": 0.0, "D": 0.0, "A": 0.0},
            data_quality="red", data_score=0.0,
        )

    raw_implied_h = 1 / odds_h
    raw_implied_d = 1 / odds_d
    raw_implied_a = 1 / odds_a
    fair_h, fair_d, fair_a = _remove_overround(raw_implied_h, raw_implied_d, raw_implied_a)
    data_points += BASE_POINTS

    # --- Poisson model (when goals averages available) ---
    lambda_h_val: float | None = None
    lambda_a_val: float | None = None
    use_poisson = all(x is not None for x in [
        home_goals_scored_avg, home_goals_conceded_avg,
        away_goals_scored_avg, away_goals_conceded_avg,
    ])

    if use_poisson:
        data_points += 4  # 4 goal average inputs
        avg = league_avg_goals if league_avg_goals > 0 else LEAGUE_AVG_GOALS
        lambda_h_val = (home_goals_scored_avg * away_goals_conceded_avg / avg) * HOME_ADV  # type: ignore[operator]
        lambda_a_val = away_goals_scored_avg * home_goals_conceded_avg / avg               # type: ignore[operator]
        lambda_h_val = max(0.1, lambda_h_val)
        lambda_a_val = max(0.1, lambda_a_val)
        p_h, p_d, p_a = _poisson_probs(lambda_h_val, lambda_a_val)
        # Blend: 50% Poisson + 50% implied
        base_h = 0.50 * fair_h + 0.50 * p_h
        base_d = 0.50 * fair_d + 0.50 * p_d
        base_a = 0.50 * fair_a + 0.50 * p_a
    else:
        base_h, base_d, base_a = fair_h, fair_d, fair_a

    # --- Form adjustment ---
    form_adj = 0.0
    form_strength_h = _form_strength(form_home)
    form_strength_a = _form_strength(form_away)
    if form_strength_h is not None:
        data_points += 1
    if form_strength_a is not None:
        data_points += 1
    if form_strength_h is not None and form_strength_a is not None:
        form_diff = form_strength_h - form_strength_a
        form_adj = form_diff * 0.12  # max ±0.12

    # --- Position adjustment ---
    pos_adj = _position_advantage(position_home, position_away)
    if pos_adj is not None:
        data_points += 2

    # --- H2H adjustment ---
    h2h_adj = _h2h_adjustment(h2h_summary, h2h_details, home_team_id)
    if h2h_summary or h2h_details:
        data_points += 1
    if h2h_details:
        data_points += 1  # structured H2H = extra point

    # --- Absence penalty (weighted by player importance) ---
    lineup_mult = 1.5 if lineup_confirmed else 1.0
    abs_pen_home = _absence_penalty(key_absences_home, home_top_scorer_gpm) * lineup_mult
    abs_pen_away = _absence_penalty(key_absences_away, away_top_scorer_gpm) * lineup_mult
    if key_absences_home or key_absences_away:
        data_points += 1
    if lineup_confirmed:
        data_points += 1

    # --- xG boost ---
    xg_adj = 0.0
    if xg_home is not None and xg_away is not None:
        data_points += 2
        xg_total = xg_home + xg_away
        if xg_total > 0:
            xg_adj = (xg_home / xg_total - 0.5) * 0.10  # max ±0.05

    if btts_pct_home is not None and btts_pct_away is not None:
        data_points += 1

    # --- Combine adjustments ---
    total_adj = (
        (form_adj if form_strength_h is not None and form_strength_a is not None else 0.0)
        + (pos_adj if pos_adj is not None else 0.0)
        + h2h_adj
        + xg_adj
    )

    est_h = base_h + total_adj - abs_pen_home
    est_a = base_a - total_adj - abs_pen_away
    est_d = base_d

    # Clamp and renormalize
    est_h = max(0.03, est_h)
    est_d = max(0.03, est_d)
    est_a = max(0.03, est_a)
    total_est = est_h + est_d + est_a
    est_h /= total_est
    est_d /= total_est
    est_a /= total_est

    # --- Edge vs raw implied ---
    edge_h = round(est_h - raw_implied_h, 4)
    edge_d = round(est_d - raw_implied_d, 4)
    edge_a = round(est_a - raw_implied_a, 4)

    # --- Data quality ---
    data_score = data_points / MAX_POINTS
    if data_score >= GREEN_THRESHOLD:
        quality: Literal["green", "yellow", "red"] = "green"
    elif data_score >= YELLOW_THRESHOLD:
        quality = "yellow"
    else:
        quality = "red"

    return MatchProbabilityResult(
        home_prob=round(est_h, 4),
        draw_prob=round(est_d, 4),
        away_prob=round(est_a, 4),
        edges={"H": edge_h, "D": edge_d, "A": edge_a},
        data_quality=quality,
        data_score=round(data_score, 3),
        data_points_used=data_points,
        data_points_max=MAX_POINTS,
        used_odds=True,
        used_form=form_strength_h is not None or form_strength_a is not None,
        used_position=pos_adj is not None,
        used_h2h=bool(h2h_summary or h2h_details),
        used_absences=bool(key_absences_home or key_absences_away),
        used_poisson=use_poisson,
        lambda_home=round(lambda_h_val, 3) if lambda_h_val is not None else None,
        lambda_away=round(lambda_a_val, 3) if lambda_a_val is not None else None,
    )


# ---------------------------------------------------------------------------
# Tennis calculator (unchanged except form mapping fix)
# ---------------------------------------------------------------------------

def calculate_tennis(
    odds_p1: float,
    odds_p2: float,
    form_p1: str | None = None,
    form_p2: str | None = None,
    ranking_p1: int | None = None,
    ranking_p2: int | None = None,
    h2h_summary: str | None = None,
    absences_p1: list[str] | None = None,
    absences_p2: list[str] | None = None,
) -> MatchProbabilityResult:
    """Estimate fair probabilities and edge for a tennis match."""
    absences_p1 = absences_p1 or []
    absences_p2 = absences_p2 or []
    data_points = 0

    if odds_p1 <= 0 or odds_p2 <= 0:
        return MatchProbabilityResult(
            home_prob=0.5, draw_prob=0.0, away_prob=0.5,
            edges={"P1": 0.0, "P2": 0.0},
            data_quality="red", data_score=0.0,
        )

    raw_p1 = 1 / odds_p1
    raw_p2 = 1 / odds_p2
    fair_p1, _, fair_p2 = _remove_overround(raw_p1, 0.0, raw_p2)
    data_points += 2

    form_adj = 0.0
    fs1 = _form_strength(form_p1)
    fs2 = _form_strength(form_p2)
    if fs1 is not None:
        data_points += 1
    if fs2 is not None:
        data_points += 1
    if fs1 is not None and fs2 is not None:
        form_adj = (fs1 - fs2) * 0.10

    rank_adj = 0.0
    if ranking_p1 is not None and ranking_p2 is not None:
        data_points += 2
        gap = ranking_p2 - ranking_p1
        rank_adj = max(-0.12, min(0.12, gap / 500))

    h2h_adj = _h2h_adjustment(h2h_summary, None)
    if h2h_summary:
        data_points += 1

    abs_pen_p1 = _absence_penalty(absences_p1)
    abs_pen_p2 = _absence_penalty(absences_p2)
    if absences_p1 or absences_p2:
        data_points += 1

    total_adj = form_adj + rank_adj + h2h_adj
    est_p1 = max(0.03, fair_p1 + total_adj - abs_pen_p1)
    est_p2 = max(0.03, fair_p2 - total_adj - abs_pen_p2)
    total_est = est_p1 + est_p2
    est_p1 /= total_est
    est_p2 /= total_est

    edge_p1 = round(est_p1 - raw_p1, 4)
    edge_p2 = round(est_p2 - raw_p2, 4)

    data_score = data_points / MAX_POINTS
    if data_score >= GREEN_THRESHOLD:
        quality: Literal["green", "yellow", "red"] = "green"
    elif data_score >= YELLOW_THRESHOLD:
        quality = "yellow"
    else:
        quality = "red"

    return MatchProbabilityResult(
        home_prob=round(est_p1, 4),
        draw_prob=0.0,
        away_prob=round(est_p2, 4),
        edges={"P1": edge_p1, "P2": edge_p2},
        data_quality=quality,
        data_score=round(data_score, 3),
        data_points_used=data_points,
        data_points_max=MAX_POINTS,
        used_odds=True,
        used_form=fs1 is not None or fs2 is not None,
        used_position=ranking_p1 is not None,
        used_h2h=bool(h2h_summary),
        used_absences=bool(absences_p1 or absences_p2),
    )
