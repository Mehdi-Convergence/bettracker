from typing import Optional

from sqlalchemy import ForeignKey, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class Campaign(Base, TimestampMixin):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active / paused / archived

    # Strategy parameters (same as BacktestRequest)
    initial_bankroll: Mapped[float]
    flat_stake: Mapped[float]  # e.g. 0.05 = 5%
    min_edge: Mapped[float]
    min_model_prob: Mapped[Optional[float]]
    min_odds: Mapped[Optional[float]]
    max_odds: Mapped[Optional[float]]
    allowed_outcomes: Mapped[Optional[str]] = mapped_column(String(20))  # CSV "H,D,A"
    excluded_leagues: Mapped[Optional[str]] = mapped_column(Text)  # CSV "E1,D2"

    # Combo settings
    combo_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    combo_max_legs: Mapped[int] = mapped_column(default=4)
    combo_min_odds: Mapped[float] = mapped_column(default=1.8)
    combo_max_odds: Mapped[float] = mapped_column(default=3.0)
    combo_top_n: Mapped[int] = mapped_column(default=3)

    # Optional target
    target_bankroll: Mapped[Optional[float]]

    def __repr__(self) -> str:
        return f"<Campaign {self.name} ({self.status})>"
