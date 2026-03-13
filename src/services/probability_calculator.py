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
#   [api]      possession                 -> 1 pt
#   [api]      rest_days                  -> 1 pt
#   [api]      corners/cards              -> 1 pt
MAX_POINTS = 23
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


def _absence_penalty(
    absences: list[str],
    key_player_goals_per_match: float = 0.0,
    absent_positions: list[str] | None = None,
) -> float:
    """Penalty for key absences, weighted by player importance and position.

    Position-based penalties (per absent player):
    - Goalkeeper: -0.10 (critical, no backup in quality)
    - Attacker: -0.07
    - Midfielder: -0.05
    - Defender: -0.03
    - Unknown: -0.02
    Max 3 players counted. Extra boost if top scorer absent (>0.4 goals/match).
    """
    if not absences:
        return 0.0
    count = min(len(absences), 3)
    if absent_positions:
        pos_penalties = {
            "Goalkeeper": 0.10, "Attacker": 0.07,
            "Midfielder": 0.05, "Defender": 0.03,
        }
        base = sum(
            pos_penalties.get(pos, 0.02)
            for pos in absent_positions[:count]
        )
    else:
        base = count * 0.02
        # Boost if the top scorer is among absentees
        if key_player_goals_per_match >= 0.4:
            base += 0.04
    return min(base, 0.12)


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


def _form_multiplier(form: str | None) -> float:
    """Multiplier for λ based on recent form. Range 0.80 (5 losses) to 1.20 (5 wins)."""
    if not form:
        return 1.0
    mapping = {"V": 1.0, "W": 1.0, "N": 0.5, "D": 0.0, "L": 0.0, "P": 0.5}
    chars = list(form.upper().strip())[-5:]
    if not chars:
        return 1.0
    strength = sum(mapping.get(c, 0.5) for c in chars) / len(chars)
    # 0.0 (all losses) → 0.80, 0.5 (all draws) → 1.0, 1.0 (all wins) → 1.20
    return 0.80 + strength * 0.40


def _dc_tau(lam_h: float, lam_a: float, x: int, y: int, rho: float = -0.04) -> float:
    """Dixon-Coles tau correction for low-scoring matches (0-0, 1-0, 0-1, 1-1).

    rho < 0 means 0-0 and 1-1 are more likely than pure Poisson predicts,
    while 1-0 and 0-1 are slightly less likely.
    """
    if x == 0 and y == 0:
        return 1.0 - lam_h * lam_a * rho
    elif x == 0 and y == 1:
        return 1.0 + lam_h * rho
    elif x == 1 and y == 0:
        return 1.0 + lam_a * rho
    elif x == 1 and y == 1:
        return 1.0 - rho
    return 1.0


def _poisson_probs(lambda_h: float, lambda_a: float, max_goals: int = 10) -> tuple[float, float, float]:
    """Compute P(home wins), P(draw), P(away wins) via Dixon-Coles corrected Poisson."""
    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            p = (math.exp(-lambda_h) * lambda_h ** i / math.factorial(i)
                 * math.exp(-lambda_a) * lambda_a ** j / math.factorial(j)
                 * _dc_tau(lambda_h, lambda_a, i, j))
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
    absent_positions_home: list[str] | None = None,  # positions of absent home players
    absent_positions_away: list[str] | None = None,  # positions of absent away players
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
    # Enriched stats (from /teams/statistics — 0 extra API calls)
    possession_home: float | None = None,
    possession_away: float | None = None,
    corners_pg_home: float | None = None,
    corners_pg_away: float | None = None,
    cards_pg_home: float | None = None,
    cards_pg_away: float | None = None,
    rest_days_home: int | None = None,
    rest_days_away: int | None = None,
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
        # Apply form multiplier: recent form adjusts λ by ±20%
        lambda_h_val *= _form_multiplier(form_home)
        lambda_a_val *= _form_multiplier(form_away)
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

    # --- Absence penalty (weighted by position when available) ---
    lineup_mult = 1.5 if lineup_confirmed else 1.0
    abs_pen_home = _absence_penalty(key_absences_home, home_top_scorer_gpm, absent_positions_home) * lineup_mult
    abs_pen_away = _absence_penalty(key_absences_away, away_top_scorer_gpm, absent_positions_away) * lineup_mult
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

    # --- Possession adjustment ---
    poss_adj = 0.0
    if possession_home is not None and possession_away is not None:
        data_points += 1
        # Higher possession correlates with more chances — max ±0.04
        poss_diff = (possession_home - possession_away) / 100  # e.g. 55% - 45% = 0.10
        poss_adj = max(-0.04, min(0.04, poss_diff * 0.40))

    # --- Rest days adjustment ---
    rest_adj = 0.0
    if rest_days_home is not None and rest_days_away is not None:
        data_points += 1
        diff = rest_days_home - rest_days_away
        # Fatigue penalty: ≥2 days difference matters — max ±0.03
        if abs(diff) >= 2:
            rest_adj = max(-0.03, min(0.03, diff * 0.01))

    # --- Corners/cards (data quality bonus, minor lambda adjustment) ---
    corners_adj = 0.0
    if corners_pg_home is not None and corners_pg_away is not None:
        data_points += 1
        # More corners = more attacking intent — max ±0.02
        c_diff = corners_pg_home - corners_pg_away
        corners_adj = max(-0.02, min(0.02, c_diff * 0.004))

    # --- Combine adjustments ---
    total_adj = (
        (form_adj if form_strength_h is not None and form_strength_a is not None else 0.0)
        + (pos_adj if pos_adj is not None else 0.0)
        + h2h_adj
        + xg_adj
        + poss_adj
        + rest_adj
        + corners_adj
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

# Tennis-specific data quality
# Points available:
#   odds P1/P2                  -> 2 pts
#   form_p1                     -> 1 pt
#   form_p2                     -> 1 pt
#   ranking_p1/p2               -> 2 pts
#   h2h_summary                 -> 1 pt
#   h2h_surface                 -> 1 pt
#   h2h_last3                   -> 1 pt
#   surface_record_p1           -> 1 pt
#   surface_record_p2           -> 1 pt
#   serve_pct_p1                -> 1 pt
#   serve_pct_p2                -> 1 pt
#   return_pct_p1               -> 1 pt
#   return_pct_p2               -> 1 pt
#   season_record_p1            -> 1 pt
#   season_record_p2            -> 1 pt
#   rest_days                   -> 1 pt
#   aces_avg                    -> 1 pt
TENNIS_MAX_POINTS = 18


def _parse_record(record: str | None) -> tuple[int, int] | None:
    """Parse a W-L record string like '15-3' into (wins, losses)."""
    if not record:
        return None
    m = re.match(r'(\d+)\s*[-/]\s*(\d+)', record)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None


def _surface_adjustment(rec_p1: str | None, rec_p2: str | None) -> float:
    """Adjustment based on surface win rates. Range: -0.06 to +0.06."""
    r1 = _parse_record(rec_p1)
    r2 = _parse_record(rec_p2)
    if r1 is None or r2 is None:
        return 0.0
    total1 = r1[0] + r1[1]
    total2 = r2[0] + r2[1]
    if total1 < 3 or total2 < 3:
        return 0.0
    wr1 = r1[0] / total1
    wr2 = r2[0] / total2
    return max(-0.06, min(0.06, (wr1 - wr2) * 0.12))


def _serve_return_adjustment(
    serve_p1: float | None, serve_p2: float | None,
    return_p1: float | None, return_p2: float | None,
) -> float:
    """Adjustment based on serve/return efficiency. Range: -0.05 to +0.05."""
    if serve_p1 is None or serve_p2 is None:
        return 0.0
    # Serve advantage: high serve% + opponent low return%
    s1 = serve_p1 / 100 if serve_p1 > 1 else serve_p1
    s2 = serve_p2 / 100 if serve_p2 > 1 else serve_p2
    r1 = (return_p1 / 100 if return_p1 and return_p1 > 1 else return_p1) if return_p1 else None
    r2 = (return_p2 / 100 if return_p2 and return_p2 > 1 else return_p2) if return_p2 else None
    # Composite: serve strength - opponent return strength
    comp1 = s1 + (1 - r2 if r2 else 0) if r2 else s1
    comp2 = s2 + (1 - r1 if r1 else 0) if r1 else s2
    diff = comp1 - comp2
    return max(-0.05, min(0.05, diff * 0.10))


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
    # Tennis enriched stats
    surface_record_p1: str | None = None,
    surface_record_p2: str | None = None,
    serve_pct_p1: float | None = None,
    serve_pct_p2: float | None = None,
    return_pct_p1: float | None = None,
    return_pct_p2: float | None = None,
    season_record_p1: str | None = None,
    season_record_p2: str | None = None,
    aces_avg_p1: float | None = None,
    aces_avg_p2: float | None = None,
    rest_days_p1: int | None = None,
    rest_days_p2: int | None = None,
    h2h_surface: str | None = None,
    h2h_last3: list[str] | None = None,
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

    # --- Form adjustment ---
    form_adj = 0.0
    fs1 = _form_strength(form_p1)
    fs2 = _form_strength(form_p2)
    if fs1 is not None:
        data_points += 1
    if fs2 is not None:
        data_points += 1
    if fs1 is not None and fs2 is not None:
        form_adj = (fs1 - fs2) * 0.10

    # --- Ranking adjustment ---
    rank_adj = 0.0
    if ranking_p1 is not None and ranking_p2 is not None:
        data_points += 2
        gap = ranking_p2 - ranking_p1
        rank_adj = max(-0.12, min(0.12, gap / 500))

    # --- H2H adjustment ---
    h2h_adj = _h2h_adjustment(h2h_summary, None)
    if h2h_summary:
        data_points += 1
    if h2h_surface:
        data_points += 1
    if h2h_last3 and len(h2h_last3) > 0:
        data_points += 1

    abs_pen_p1 = _absence_penalty(absences_p1)
    abs_pen_p2 = _absence_penalty(absences_p2)
    if absences_p1 or absences_p2:
        data_points += 1

    # --- Surface record adjustment ---
    surface_adj = _surface_adjustment(surface_record_p1, surface_record_p2)
    if surface_record_p1:
        data_points += 1
    if surface_record_p2:
        data_points += 1

    # --- Serve/return adjustment ---
    sr_adj = _serve_return_adjustment(serve_pct_p1, serve_pct_p2, return_pct_p1, return_pct_p2)
    if serve_pct_p1 is not None:
        data_points += 1
    if serve_pct_p2 is not None:
        data_points += 1
    if return_pct_p1 is not None:
        data_points += 1
    if return_pct_p2 is not None:
        data_points += 1

    # --- Season record (data quality only, no adjustment) ---
    if season_record_p1:
        data_points += 1
    if season_record_p2:
        data_points += 1

    # --- Rest days ---
    rest_adj = 0.0
    if rest_days_p1 is not None and rest_days_p2 is not None:
        data_points += 1
        # Fatigue: player with fewer rest days gets a small penalty
        diff = rest_days_p1 - rest_days_p2
        if abs(diff) >= 2:
            rest_adj = max(-0.03, min(0.03, diff * 0.01))

    # --- Aces (data quality only) ---
    if aces_avg_p1 is not None or aces_avg_p2 is not None:
        data_points += 1

    # --- Combine adjustments ---
    total_adj = form_adj + rank_adj + h2h_adj + surface_adj + sr_adj + rest_adj
    est_p1 = max(0.03, fair_p1 + total_adj - abs_pen_p1)
    est_p2 = max(0.03, fair_p2 - total_adj - abs_pen_p2)
    total_est = est_p1 + est_p2
    est_p1 /= total_est
    est_p2 /= total_est

    edge_p1 = round(est_p1 - raw_p1, 4)
    edge_p2 = round(est_p2 - raw_p2, 4)

    data_score = min(data_points / TENNIS_MAX_POINTS, 1.0)
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
        data_points_max=TENNIS_MAX_POINTS,
        used_odds=True,
        used_form=fs1 is not None or fs2 is not None,
        used_position=ranking_p1 is not None,
        used_h2h=bool(h2h_summary),
        used_absences=bool(absences_p1 or absences_p2),
    )


# ---------------------------------------------------------------------------
# NBA probability calculator (rule-based baseline)
# ---------------------------------------------------------------------------

NBA_MAX_POINTS = 6


def calculate_nba(
    odds_home: float,
    odds_away: float,
    odds_over: float | None = None,
    odds_under: float | None = None,
    total_line: float | None = None,
    home_win_rate: float | None = None,
    away_win_rate: float | None = None,
    home_pt_diff: float | None = None,
    away_pt_diff: float | None = None,
    home_b2b: bool = False,
    away_b2b: bool = False,
) -> MatchProbabilityResult:
    """Estimate fair probabilities and edges for an NBA game (rule-based baseline).

    Used as a fallback when the ML model is unavailable.
    """
    if odds_home <= 0 or odds_away <= 0:
        return MatchProbabilityResult(
            home_prob=0.5, draw_prob=0.0, away_prob=0.5,
            edges={"Home": 0.0, "Away": 0.0},
            data_quality="red", data_score=0.0,
        )

    raw_h = 1 / odds_home
    raw_a = 1 / odds_away
    fair_h, _, fair_a = _remove_overround(raw_h, 0.0, raw_a)
    data_points = 2

    # Adjust for win rate
    adj = 0.0
    if home_win_rate is not None and away_win_rate is not None:
        adj += (home_win_rate - away_win_rate) * 0.05
        data_points += 1

    # Adjust for point differential
    if home_pt_diff is not None and away_pt_diff is not None:
        pt_diff = home_pt_diff - away_pt_diff
        adj += max(-0.05, min(0.05, pt_diff / 200))
        data_points += 1

    # Back-to-back penalty
    if home_b2b:
        adj -= 0.03
    if away_b2b:
        adj += 0.03

    est_h = min(0.90, max(0.10, fair_h + adj))
    est_a = 1.0 - est_h

    edge_h = round(est_h - 1.0 / odds_home, 4)
    edge_a = round(est_a - 1.0 / odds_away, 4)

    edges: dict[str, float] = {}
    if edge_h > 0:
        edges["Home"] = edge_h
    if edge_a > 0:
        edges["Away"] = edge_a

    # Over/under edges
    if odds_over and odds_under and total_line:
        data_points += 1
        # Assume 50/50 baseline for totals unless ML adjusts
        edge_over = round(0.5 - 1.0 / odds_over, 4)
        edge_under = round(0.5 - 1.0 / odds_under, 4)
        if edge_over > 0.01:
            edges["Over"] = edge_over
        if edge_under > 0.01:
            edges["Under"] = edge_under

    data_score = data_points / NBA_MAX_POINTS
    if data_score >= 0.75:
        quality: Literal["green", "yellow", "red"] = "green"
    elif data_score >= 0.4:
        quality = "yellow"
    else:
        quality = "red"

    return MatchProbabilityResult(
        home_prob=round(est_h, 4),
        draw_prob=0.0,
        away_prob=round(est_a, 4),
        edges=edges,
        data_quality=quality,
        data_score=round(data_score, 3),
        data_points_used=data_points,
        data_points_max=NBA_MAX_POINTS,
        used_odds=True,
        used_form=home_win_rate is not None,
    )


# ---------------------------------------------------------------------------
# MLB probability calculator (rule-based baseline)
# ---------------------------------------------------------------------------

MLB_MAX_POINTS = 6


def calculate_mlb(
    odds_home: float,
    odds_away: float,
    home_win_rate: float | None = None,
    away_win_rate: float | None = None,
    home_run_diff: float | None = None,
    away_run_diff: float | None = None,
    home_runs_avg: float | None = None,
    away_runs_avg: float | None = None,
    home_runs_allowed: float | None = None,
    away_runs_allowed: float | None = None,
) -> MatchProbabilityResult:
    """Estimate fair probabilities and edges for an MLB game (rule-based baseline).

    Baseball: no draw, moneyline only.
    Used as a fallback when the ML model is unavailable.

    Data quality points:
      odds (2) + win_rate (1) + run_diff (1) + runs_avg (1) + runs_allowed (1) = 6 max
    """
    if odds_home <= 0 or odds_away <= 0:
        return MatchProbabilityResult(
            home_prob=0.5, draw_prob=0.0, away_prob=0.5,
            edges={"Home": 0.0, "Away": 0.0},
            data_quality="red", data_score=0.0,
        )

    raw_h = 1 / odds_home
    raw_a = 1 / odds_away
    fair_h, _, fair_a = _remove_overround(raw_h, 0.0, raw_a)
    data_points = 2

    adj = 0.0

    # Win rate adjustment
    if home_win_rate is not None and away_win_rate is not None:
        adj += (home_win_rate - away_win_rate) * 0.05
        data_points += 1

    # Run differential adjustment
    if home_run_diff is not None and away_run_diff is not None:
        rd_diff = home_run_diff - away_run_diff
        # MLB run differential rarely exceeds ±3 per game — normalize to ±0.05
        adj += max(-0.05, min(0.05, rd_diff / 60))
        data_points += 1

    # Offensive/defensive balance: high scoring + good defense = advantage
    if (home_runs_avg is not None and away_runs_allowed is not None
            and away_runs_avg is not None and home_runs_allowed is not None):
        off_edge_h = home_runs_avg - away_runs_allowed
        off_edge_a = away_runs_avg - home_runs_allowed
        balance_adj = (off_edge_h - off_edge_a) / 20.0  # normalize by typical range ~10 runs
        adj += max(-0.04, min(0.04, balance_adj))
        data_points += 2  # runs_avg + runs_allowed

    est_h = min(0.85, max(0.15, fair_h + adj))
    est_a = 1.0 - est_h

    edge_h = round(est_h - 1.0 / odds_home, 4)
    edge_a = round(est_a - 1.0 / odds_away, 4)

    edges: dict[str, float] = {}
    if edge_h > 0:
        edges["Home"] = edge_h
    if edge_a > 0:
        edges["Away"] = edge_a

    data_score = data_points / MLB_MAX_POINTS
    if data_score >= 0.75:
        quality: Literal["green", "yellow", "red"] = "green"
    elif data_score >= 0.4:
        quality = "yellow"
    else:
        quality = "red"

    return MatchProbabilityResult(
        home_prob=round(est_h, 4),
        draw_prob=0.0,
        away_prob=round(est_a, 4),
        edges=edges,
        data_quality=quality,
        data_score=round(data_score, 3),
        data_points_used=data_points,
        data_points_max=MLB_MAX_POINTS,
        used_odds=True,
        used_form=home_win_rate is not None,
    )


# ---------------------------------------------------------------------------
# Rugby probability calculator (rule-based baseline)
# ---------------------------------------------------------------------------

RUGBY_MAX_POINTS = 7
# Draw probability base: rugby draws are rare (~6%)
_RUGBY_DRAW_PROB = 0.06


def calculate_rugby(
    odds_home: float,
    odds_draw: float | None,
    odds_away: float,
    odds_over: float | None = None,
    odds_under: float | None = None,
    total_line: float | None = None,
    home_win_rate: float | None = None,
    away_win_rate: float | None = None,
    home_pt_diff: float | None = None,
    away_pt_diff: float | None = None,
    home_elo: float | None = None,
    away_elo: float | None = None,
) -> MatchProbabilityResult:
    """Estimate fair probabilities and edges for a rugby match (1X2, rule-based).

    Used as a fallback when the ML model is unavailable.
    Rugby has draws: ~6% of matches end level.
    """
    if odds_home <= 0 or odds_away <= 0:
        return MatchProbabilityResult(
            home_prob=0.47, draw_prob=_RUGBY_DRAW_PROB, away_prob=0.47,
            edges={"H": 0.0, "D": 0.0, "A": 0.0},
            data_quality="red", data_score=0.0,
        )

    raw_h = 1 / odds_home
    raw_d = (1 / odds_draw) if (odds_draw and odds_draw > 1.0) else _RUGBY_DRAW_PROB
    raw_a = 1 / odds_away
    fair_h, fair_d, fair_a = _remove_overround(raw_h, raw_d, raw_a)
    data_points = 3  # H/D/A odds

    # Adjust for form (win rate)
    adj = 0.0
    if home_win_rate is not None and away_win_rate is not None:
        adj += (home_win_rate - away_win_rate) * 0.06
        data_points += 1

    # Adjust for point differential
    if home_pt_diff is not None and away_pt_diff is not None:
        pt_diff = home_pt_diff - away_pt_diff
        # Rugby scores are high (~50 pts/match) — normalize accordingly
        adj += max(-0.06, min(0.06, pt_diff / 150))
        data_points += 1

    # ELO-based adjustment
    if home_elo is not None and away_elo is not None:
        elo_diff = home_elo - away_elo
        elo_adj = max(-0.04, min(0.04, elo_diff / 800))
        adj += elo_adj
        data_points += 1

    est_h = min(0.88, max(0.08, fair_h + adj))
    # Preserve draw probability anchored to base
    est_d = min(0.15, max(0.03, fair_d))
    # Remainder to away
    rem = 1.0 - est_h - est_d
    est_a = min(0.88, max(0.05, rem))
    # Renormalize
    total = est_h + est_d + est_a
    est_h = round(est_h / total, 4)
    est_d = round(est_d / total, 4)
    est_a = round(1.0 - est_h - est_d, 4)

    edges: dict[str, float] = {}
    edge_h = round(est_h - 1.0 / odds_home, 4)
    edge_a = round(est_a - 1.0 / odds_away, 4)
    edge_d = round(est_d - (1.0 / odds_draw if odds_draw and odds_draw > 1.0 else 0.0), 4)

    if edge_h > 0:
        edges["H"] = edge_h
    if edge_d > 0 and odds_draw and odds_draw > 1.0:
        edges["D"] = edge_d
    if edge_a > 0:
        edges["A"] = edge_a

    # Over/under (assume 50/50 baseline)
    if odds_over and odds_under and total_line:
        data_points += 1
        edge_over = round(0.5 - 1.0 / odds_over, 4)
        edge_under = round(0.5 - 1.0 / odds_under, 4)
        if edge_over > 0.01:
            edges["Over"] = edge_over
        if edge_under > 0.01:
            edges["Under"] = edge_under

    data_score = data_points / RUGBY_MAX_POINTS
    if data_score >= 0.75:
        quality: Literal["green", "yellow", "red"] = "green"
    elif data_score >= 0.4:
        quality = "yellow"
    else:
        quality = "red"

    return MatchProbabilityResult(
        home_prob=est_h,
        draw_prob=est_d,
        away_prob=est_a,
        edges=edges,
        data_quality=quality,
        data_score=round(data_score, 3),
        data_points_used=data_points,
        data_points_max=RUGBY_MAX_POINTS,
        used_odds=True,
        used_form=home_win_rate is not None,
    )


# ---------------------------------------------------------------------------
# PMU probability calculator
# ---------------------------------------------------------------------------

# Points disponibles pour la qualite des donnees PMU:
#   odds_final              -> 1 pt (toujours)
#   win_model_prob          -> 2 pts (ML disponible)
#   place_model_prob        -> 2 pts (ML disponible)
#   horse_form              -> 1 pt
#   jockey_stats            -> 1 pt
PMU_MAX_POINTS = 7


def calculate_pmu(runners: list[dict]) -> list[dict]:
    """Calcule prob_win, prob_place, edge_win, edge_place pour chaque partant.

    Args:
        runners: Liste de dicts avec au minimum:
            - odds: cote finale du cheval (float)
            - model_prob_win: probabilite ML gagnant (float | None)
            - model_prob_place: probabilite ML place (float | None)
            - horse_name: nom du cheval (str)
            - number: numero de dossard (int)

    Returns:
        Meme liste enrichie avec prob_win, prob_place, edge_win, edge_place.

    Logique:
        - Si ML dispo: utilise les probas ML
        - Sinon: utilise les probas implicites des cotes (1/odds, normalisees)
        - Commission PMU estimee: 15% gagnant, 18% place
        - Edges = prob_modele - prob_implicite_brute
    """
    PMU_COMMISSION_WIN = 0.15
    PMU_COMMISSION_PLACE = 0.18

    # Filtrer les non-partants (odds nulles ou scratches)
    active = [r for r in runners if r.get("odds") and float(r["odds"]) > 1.0]
    if not active:
        return runners

    # --- Probas implicites brutes ---
    inv_odds = []
    for r in active:
        try:
            inv_odds.append(1.0 / float(r["odds"]))
        except (TypeError, ValueError, ZeroDivisionError):
            inv_odds.append(0.0)

    total_inv = sum(inv_odds) or 1.0
    # Probas implicites normalisees (sans marge bookmaker)
    implied_probs = [v / total_inv for v in inv_odds]

    # --- Place cotes approx: odds_win / 4 (PMU standard) ---
    # Les cotes place sont generalement environ le quart des cotes gagnant
    place_odds_list = [max(1.05, float(r["odds"]) / 4.0) for r in active]
    inv_place_odds = [1.0 / p for p in place_odds_list]
    total_inv_place = sum(inv_place_odds) or 1.0
    implied_place_probs = [v / total_inv_place for v in inv_place_odds]

    result = []
    active_idx = 0
    for runner in runners:
        r = dict(runner)
        odds_val = r.get("odds")
        if not odds_val or float(odds_val) <= 1.0:
            # Partant non-actif: pas d'enrichissement
            r["prob_win"] = None
            r["prob_place"] = None
            r["edge_win"] = None
            r["edge_place"] = None
            result.append(r)
            continue

        impl_win = implied_probs[active_idx]
        impl_place = implied_place_probs[active_idx]

        # Utiliser les probas ML si disponibles, sinon probas implicites
        model_win = r.get("model_prob_win")
        model_place = r.get("model_prob_place")

        prob_win = float(model_win) if model_win is not None else impl_win
        prob_place = float(model_place) if model_place is not None else impl_place

        # Probabilite implicite brute (sans normalisation) pour le calcul d'edge
        raw_implied_win = 1.0 / float(r["odds"])
        raw_implied_place = 1.0 / place_odds_list[active_idx]

        # Cotes nettes apres commission
        net_odds_win = float(r["odds"]) * (1.0 - PMU_COMMISSION_WIN)
        net_odds_place = place_odds_list[active_idx] * (1.0 - PMU_COMMISSION_PLACE)

        # Edge = prob_modele - prob_implicite_brute
        edge_win = round(prob_win - raw_implied_win, 4)
        edge_place = round(prob_place - raw_implied_place, 4)

        r["prob_win"] = round(prob_win, 4)
        r["prob_place"] = round(prob_place, 4)
        r["edge_win"] = edge_win
        r["edge_place"] = edge_place
        r["net_odds_win"] = round(net_odds_win, 3)
        r["net_odds_place"] = round(net_odds_place, 3)

        result.append(r)
        active_idx += 1

    return result
