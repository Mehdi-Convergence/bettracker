"""In-app notification endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.database import get_db
from src.models.notification import Notification
from src.models.user import User

router = APIRouter(tags=["notifications"])


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    metadata: dict | None = None
    created_at: str


class UnreadCountResponse(BaseModel):
    count: int


def _notif_to_response(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        type=n.type,
        title=n.title,
        message=n.message,
        is_read=n.is_read,
        metadata=n.metadata_json,
        created_at=n.created_at.isoformat() if n.created_at else "",
    )


@router.get("/notifications", response_model=list[NotificationResponse])
def list_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the user's 50 most recent notifications."""
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [_notif_to_response(n) for n in notifs]


@router.get("/notifications/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the count of unread notifications."""
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == False)
        .count()
    )
    return UnreadCountResponse(count=count)


@router.patch("/notifications/{notif_id}/read", response_model=NotificationResponse)
def mark_as_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a single notification as read."""
    notif = db.query(Notification).filter(
        Notification.id == notif_id, Notification.user_id == user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return _notif_to_response(notif)


@router.patch("/notifications/{notif_id}/toggle-read", response_model=NotificationResponse)
def toggle_notification_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bascule l'etat lu/non-lu d'une notification."""
    notif = (
        db.query(Notification)
        .filter(Notification.id == notif_id, Notification.user_id == user.id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    notif.is_read = not notif.is_read
    db.commit()
    db.refresh(notif)
    return _notif_to_response(notif)


@router.post("/notifications/read-all", status_code=204)
def mark_all_as_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read."""
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
