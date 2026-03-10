from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class Bet(Base, TimestampMixin):
    __tablename__ = "bets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    sport: Mapped[str] = mapped_column(String(20))
    match_date: Mapped[datetime]
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))
    outcome_bet: Mapped[str] = mapped_column(String(1))  # H/D/A
    odds_at_bet: Mapped[float]
    odds_at_close: Mapped[Optional[float]]
    stake: Mapped[float]
    result: Mapped[Optional[str]] = mapped_column(String(10), default="pending")
    profit_loss: Mapped[Optional[float]]
    clv: Mapped[Optional[float]]
    league: Mapped[Optional[str]] = mapped_column(String(50))
    campaign_id: Mapped[Optional[int]] = mapped_column(ForeignKey("campaigns.id"))
    combo_group: Mapped[Optional[str]] = mapped_column(String(50))
    source: Mapped[Optional[str]] = mapped_column(String(10), default="scanner")  # algo / manual / scanner
    bookmaker: Mapped[Optional[str]] = mapped_column(String(50))
    edge_at_bet: Mapped[Optional[float]]
    note: Mapped[Optional[str]] = mapped_column(String(500))
    campaign_version: Mapped[Optional[int]]
    is_backtest: Mapped[bool] = mapped_column(default=False)
    backtest_id: Mapped[Optional[str]] = mapped_column(String(50))

    def __repr__(self) -> str:
        return f"<Bet {self.home_team} vs {self.away_team} {self.outcome_bet}@{self.odds_at_bet}>"
