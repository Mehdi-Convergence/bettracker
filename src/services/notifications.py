"""Notification service — create in-app notifications based on user preferences."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from src.models.notification import Notification
from src.models.user_preferences import UserPreferences

logger = logging.getLogger(__name__)

# Preference field name mapping: notification type → UserPreferences column
_PREF_MAP = {
    "stop_loss": "notif_stop_loss",
    "low_bankroll": "notif_low_bankroll",
    "campaign_ending": "notif_campaign_ending",
    "new_ticket": "notif_new_ticket",
    "smart_stop": "notif_smart_stop",
}


def create_notification(
    db: Session,
    user_id: int,
    notif_type: str,
    title: str,
    message: str,
    metadata: dict | None = None,
) -> Notification | None:
    """Create an in-app notification if the user's preference allows it.

    Returns the created Notification, or None if skipped.
    """
    # Check user preference
    pref_field = _PREF_MAP.get(notif_type)
    if pref_field:
        prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
        if prefs and not getattr(prefs, pref_field, True):
            return None

    notif = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        message=message,
        metadata_json=metadata,
    )
    db.add(notif)
    db.flush()
    logger.info("Notification created: [%s] %s for user %d", notif_type, title, user_id)
    return notif


def check_smart_stop(db: Session, user_id: int) -> Notification | None:
    """Check if the user's last 20 bets have ROI < -15%. Anti-spam: max 1 per 24h."""
    from src.models.bet import Bet

    # Anti-spam: skip if smart_stop notif sent in last 24h
    recent = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type == "smart_stop",
            Notification.created_at >= datetime.now(timezone.utc) - timedelta(hours=24),
        )
        .first()
    )
    if recent:
        return None

    # Get last 20 settled bets
    last_bets = (
        db.query(Bet)
        .filter(
            Bet.user_id == user_id,
            Bet.is_backtest == False,
            Bet.result.in_(["won", "lost"]),
        )
        .order_by(Bet.match_date.desc())
        .limit(20)
        .all()
    )

    if len(last_bets) < 10:
        return None

    total_staked = sum(b.stake for b in last_bets)
    total_pnl = sum(b.profit_loss or 0 for b in last_bets)
    if total_staked <= 0:
        return None

    roi = total_pnl / total_staked * 100
    if roi >= -15:
        return None

    return create_notification(
        db,
        user_id,
        "smart_stop",
        "Smart Stop — pause recommandée",
        f"Vos {len(last_bets)} derniers paris affichent un ROI de {roi:.1f}%. "
        "Nous vous recommandons de faire une pause pour réévaluer votre stratégie.",
        {"roi_pct": round(roi, 2), "n_bets": len(last_bets)},
    )
