"""User preferences endpoints (bankroll, notifications, display)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.api.schemas import UserPreferencesResponse, UserPreferencesUpdateRequest
from src.database import get_db
from src.models.user import User
from src.models.user_preferences import UserPreferences

router = APIRouter(tags=["settings"])


def _get_or_create_prefs(user: User, db: Session) -> UserPreferences:
    """Get existing preferences or create defaults for this user."""
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user.id).first()
    if prefs is None:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


def _prefs_to_response(p: UserPreferences) -> UserPreferencesResponse:
    return UserPreferencesResponse(
        # Bankroll
        initial_bankroll=p.initial_bankroll,
        default_stake=p.default_stake,
        stake_as_percentage=p.stake_as_percentage,
        stake_percentage=p.stake_percentage,
        daily_stop_loss=p.daily_stop_loss,
        stop_loss_unit=p.stop_loss_unit,
        low_bankroll_alert=p.low_bankroll_alert,
        # Notifications in-app
        notif_new_ticket=p.notif_new_ticket,
        notif_stop_loss=p.notif_stop_loss,
        notif_smart_stop=p.notif_smart_stop,
        notif_campaign_ending=p.notif_campaign_ending,
        notif_low_bankroll=p.notif_low_bankroll,
        # Share
        share_pseudo=p.share_pseudo,
        share_show_stake=p.share_show_stake,
        share_show_gain_euros=p.share_show_gain_euros,
        share_show_bookmaker=p.share_show_bookmaker,
        share_show_clv=p.share_show_clv,
        # Display
        theme=p.theme,
        language=p.language,
        currency=p.currency,
        odds_format=p.odds_format,
        default_tickets_view=p.default_tickets_view,
        default_campaigns_view=p.default_campaigns_view,
    )


@router.get("/settings/preferences", response_model=UserPreferencesResponse)
def get_preferences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user preferences (creates defaults if none exist)."""
    prefs = _get_or_create_prefs(user, db)
    return _prefs_to_response(prefs)


@router.patch("/settings/preferences", response_model=UserPreferencesResponse)
def update_preferences(
    body: UserPreferencesUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update of user preferences."""
    prefs = _get_or_create_prefs(user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prefs, field, value)
    db.commit()
    db.refresh(prefs)
    return _prefs_to_response(prefs)
