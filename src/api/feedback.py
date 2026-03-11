from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator

from src.api.deps import get_current_user
from src.models.user import User
from src.services.email import send_feedback_email

router = APIRouter()


class FeedbackRequest(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le message ne peut pas être vide")
        if len(v) > 2000:
            raise ValueError("Message trop long (max 2000 caractères)")
        return v


@router.post("/feedback")
def send_feedback(body: FeedbackRequest, current_user: User = Depends(get_current_user)):
    sent = send_feedback_email(
        from_email=current_user.email,
        from_name=current_user.display_name or current_user.email,
        message=body.message,
    )
    return {"ok": True, "sent": sent}
