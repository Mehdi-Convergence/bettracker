"""User preferences endpoints (bankroll, notifications, display, dashboard presets)."""

import json
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.api.schemas import (
    UserPreferencesResponse,
    UserPreferencesUpdateRequest,
    DashboardPresetCreate,
    DashboardPresetUpdate,
    DashboardPresetResponse,
    DashboardPresetsListResponse,
)
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


@router.get("/settings/dashboard-layout")
def get_dashboard_layout(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user's dashboard v2 layout."""
    import json
    prefs = _get_or_create_prefs(user, db)
    if prefs.dashboard_layout:
        return json.loads(prefs.dashboard_layout)
    return None


@router.put("/settings/dashboard-layout")
def update_dashboard_layout(
    layout: dict = Body(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save user's dashboard v2 layout."""
    prefs = _get_or_create_prefs(user, db)
    prefs.dashboard_layout = json.dumps(layout)
    db.commit()
    return {"ok": True}


# ── Dashboard V2 Presets CRUD ──


def _load_presets(prefs: UserPreferences) -> list[dict]:
    """Load presets from JSON text column."""
    if not prefs.dashboard_presets:
        return []
    try:
        return json.loads(prefs.dashboard_presets)
    except (json.JSONDecodeError, TypeError):
        return []


def _save_presets(prefs: UserPreferences, presets: list[dict], db: Session) -> None:
    """Save presets list back to JSON text column."""
    prefs.dashboard_presets = json.dumps(presets)
    db.commit()


@router.get("/settings/dashboard-presets", response_model=DashboardPresetsListResponse)
def list_dashboard_presets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all dashboard presets for the current user."""
    prefs = _get_or_create_prefs(user, db)
    presets = _load_presets(prefs)
    return DashboardPresetsListResponse(
        presets=[DashboardPresetResponse(**p) for p in presets],
        active_preset_id=prefs.active_preset_id,
    )


@router.post("/settings/dashboard-presets", response_model=DashboardPresetResponse, status_code=201)
def create_dashboard_preset(
    body: DashboardPresetCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new dashboard preset."""
    prefs = _get_or_create_prefs(user, db)
    presets = _load_presets(prefs)

    if len(presets) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 presets allowed")

    preset_id = str(uuid.uuid4())[:8]
    new_preset = {
        "id": preset_id,
        "name": body.name,
        "widgets": [w.model_dump() for w in body.widgets],
    }
    presets.append(new_preset)
    _save_presets(prefs, presets, db)

    # Auto-activate the first preset
    if len(presets) == 1:
        prefs.active_preset_id = preset_id
        db.commit()

    return DashboardPresetResponse(**new_preset)


@router.get("/settings/dashboard-presets/{preset_id}", response_model=DashboardPresetResponse)
def get_dashboard_preset(
    preset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific dashboard preset by ID."""
    prefs = _get_or_create_prefs(user, db)
    presets = _load_presets(prefs)

    preset = next((p for p in presets if p["id"] == preset_id), None)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    return DashboardPresetResponse(**preset)


@router.put("/settings/dashboard-presets/{preset_id}", response_model=DashboardPresetResponse)
def update_dashboard_preset(
    preset_id: str,
    body: DashboardPresetUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing dashboard preset (name and/or widgets)."""
    prefs = _get_or_create_prefs(user, db)
    presets = _load_presets(prefs)

    idx = next((i for i, p in enumerate(presets) if p["id"] == preset_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Preset not found")

    if body.name is not None:
        presets[idx]["name"] = body.name
    if body.widgets is not None:
        presets[idx]["widgets"] = [w.model_dump() for w in body.widgets]

    _save_presets(prefs, presets, db)
    return DashboardPresetResponse(**presets[idx])


@router.delete("/settings/dashboard-presets/{preset_id}")
def delete_dashboard_preset(
    preset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a dashboard preset."""
    prefs = _get_or_create_prefs(user, db)
    presets = _load_presets(prefs)

    new_presets = [p for p in presets if p["id"] != preset_id]
    if len(new_presets) == len(presets):
        raise HTTPException(status_code=404, detail="Preset not found")

    _save_presets(prefs, new_presets, db)

    # Clear active if it was the deleted one
    if prefs.active_preset_id == preset_id:
        prefs.active_preset_id = new_presets[0]["id"] if new_presets else None
        db.commit()

    return {"ok": True}


@router.put("/settings/dashboard-presets/{preset_id}/activate")
def activate_dashboard_preset(
    preset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set a preset as the active dashboard."""
    prefs = _get_or_create_prefs(user, db)
    presets = _load_presets(prefs)

    if not any(p["id"] == preset_id for p in presets):
        raise HTTPException(status_code=404, detail="Preset not found")

    prefs.active_preset_id = preset_id
    db.commit()
    return {"ok": True}


@router.post("/settings/dashboard-presets/{preset_id}/duplicate", response_model=DashboardPresetResponse, status_code=201)
def duplicate_dashboard_preset(
    preset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Duplicate an existing preset."""
    prefs = _get_or_create_prefs(user, db)
    presets = _load_presets(prefs)

    source = next((p for p in presets if p["id"] == preset_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Preset not found")

    if len(presets) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 presets allowed")

    new_id = str(uuid.uuid4())[:8]
    duplicate = {
        "id": new_id,
        "name": f"{source['name']} (copie)",
        "widgets": source["widgets"],
    }
    presets.append(duplicate)
    _save_presets(prefs, presets, db)

    return DashboardPresetResponse(**duplicate)
