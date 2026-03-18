"""Centralized bet statistics calculator.

Ce module centralise les calculs ROI/PNL/win_rate/streaks dupliques dans
portfolio.py, widgets.py, dashboard.py et campaigns.py.

Usage:
    from src.services.bet_stats import calculate_user_stats, calculate_bets_stats, BetStats
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from src.models.bet import Bet


@dataclass
class BetStats:
    """Statistiques agregees pour un ensemble de paris."""

    total_bets: int = 0
    won: int = 0
    lost: int = 0
    pending: int = 0
    win_rate: float = 0.0
    roi_pct: float = 0.0
    total_staked: float = 0.0
    total_pnl: float = 0.0
    avg_odds: float = 0.0
    avg_clv: float | None = None
    best_streak: int = 0
    worst_streak: int = 0
    current_streak: int = 0
    streak_type: str = "none"


def calculate_bets_stats(bets: list[Bet]) -> BetStats:
    """Calcule les statistiques a partir d'une liste de paris deja charges.

    Utilise du Python pur (pas de SQL) — adapte quand les paris sont deja
    en memoire (ex: campaigns.py charge les bets avant d'appeler).

    Args:
        bets: Liste de paris (peut contenir des paris pending, won, lost, void).

    Returns:
        BetStats avec tous les champs calcules.
    """
    if not bets:
        return BetStats()

    settled = [b for b in bets if b.result in ("won", "lost")]
    won_count = sum(1 for b in settled if b.result == "won")
    lost_count = sum(1 for b in settled if b.result == "lost")
    pending_count = sum(1 for b in bets if b.result == "pending")

    total_staked = sum(b.stake for b in settled)
    total_pnl = sum(b.profit_loss or 0 for b in settled)

    win_rate = won_count / len(settled) if settled else 0.0
    roi_pct = (total_pnl / total_staked * 100) if total_staked > 0 else 0.0

    # Odds moyens (tous paris, pas seulement settled)
    all_odds = [b.odds_at_bet for b in bets if b.odds_at_bet]
    avg_odds = sum(all_odds) / len(all_odds) if all_odds else 0.0

    # CLV moyen (settled uniquement)
    clv_values = [b.clv for b in settled if b.clv is not None]
    avg_clv = sum(clv_values) / len(clv_values) if clv_values else None

    # Streaks (dans l'ordre chronologique)
    sorted_settled = sorted(settled, key=lambda b: b.match_date or b.created_at)
    best_streak, worst_streak = _compute_max_streaks(sorted_settled)
    current_streak, streak_type = _compute_current_streak(sorted_settled)

    return BetStats(
        total_bets=len(bets),
        won=won_count,
        lost=lost_count,
        pending=pending_count,
        win_rate=round(win_rate, 4),
        roi_pct=round(roi_pct, 2),
        total_staked=round(total_staked, 2),
        total_pnl=round(total_pnl, 2),
        avg_odds=round(avg_odds, 4),
        avg_clv=round(avg_clv, 4) if avg_clv is not None else None,
        best_streak=best_streak,
        worst_streak=worst_streak,
        current_streak=current_streak,
        streak_type=streak_type,
    )


def calculate_user_stats(
    db: Session,
    user_id: int,
    campaign_id: int | None = None,
) -> BetStats:
    """Calcule les statistiques via une requete DB.

    Charge les paris depuis la DB puis delègue a calculate_bets_stats.
    Filtre automatiquement les paris de backtest (is_backtest == False).

    Args:
        db: Session SQLAlchemy.
        user_id: ID de l'utilisateur.
        campaign_id: Si fourni, filtre par campagne. Si None, tous les paris.

    Returns:
        BetStats avec tous les champs calcules.
    """
    q = db.query(Bet).filter(Bet.user_id == user_id, Bet.is_backtest == False)  # noqa: E712
    if campaign_id is not None:
        q = q.filter(Bet.campaign_id == campaign_id)

    bets = q.order_by(Bet.match_date).all()
    return calculate_bets_stats(bets)


# ---------------------------------------------------------------------------
# Helpers internes
# ---------------------------------------------------------------------------


def _compute_max_streaks(sorted_settled: list[Bet]) -> tuple[int, int]:
    """Retourne (meilleure_serie_victoires, pire_serie_defaites).

    Args:
        sorted_settled: Paris settled tries par date (asc).

    Returns:
        Tuple (best_streak, worst_streak).
    """
    w_streak = l_streak = max_w = max_l = 0
    for b in sorted_settled:
        if b.result == "won":
            w_streak += 1
            l_streak = 0
            if w_streak > max_w:
                max_w = w_streak
        else:
            l_streak += 1
            w_streak = 0
            if l_streak > max_l:
                max_l = l_streak
    return max_w, max_l


def _compute_current_streak(sorted_settled: list[Bet]) -> tuple[int, str]:
    """Calcule la serie en cours (du plus recent vers le plus ancien).

    Args:
        sorted_settled: Paris settled tries par date (asc).

    Returns:
        Tuple (longueur_serie, type_serie) ou type_serie in ("win", "loss", "none").
    """
    if not sorted_settled:
        return 0, "none"

    current = 0
    streak_type = "none"
    for b in reversed(sorted_settled):
        is_win = b.result == "won"
        if current == 0:
            streak_type = "win" if is_win else "loss"
            current = 1
        elif (streak_type == "win" and is_win) or (streak_type == "loss" and not is_win):
            current += 1
        else:
            break

    return current, streak_type
