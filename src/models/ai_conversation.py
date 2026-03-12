"""AI Analyste conversation and message models."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class AIConversation(Base, TimestampMixin):
    __tablename__ = "ai_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20))  # user, assistant, system
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
