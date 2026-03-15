"""User model for authentication and subscription management."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Integer, String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Subscription
    tier: Mapped[str] = mapped_column(String(20), default="free")  # free / pro / premium
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Stripe (filled later in Phase 1.7)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Email verification
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    email_verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)

    # 2FA (TOTP)
    totp_secret: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    # Admin
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    # Onboarding & Tour
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    visited_modules: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, default="")

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.tier})>"

    @property
    def is_trial_active(self) -> bool:
        """Check if user is still within trial period."""
        if self.tier != "free" or self.trial_ends_at is None:
            return False
        now = datetime.now(timezone.utc)
        trial = self.trial_ends_at
        # Handle naive datetimes from SQLite
        if trial.tzinfo is None:
            trial = trial.replace(tzinfo=timezone.utc)
        return now < trial
