"""SavedBacktest model: persist backtest configs and results."""


from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class SavedBacktest(Base, TimestampMixin):
    __tablename__ = "saved_backtests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    sport: Mapped[str] = mapped_column(String(30), default="football")
    # JSON-serialised columns (stored as TEXT for SQLite compat)
    params: Mapped[str] = mapped_column(Text)       # BacktestRequest JSON
    metrics: Mapped[str] = mapped_column(Text)       # BacktestMetricsResponse JSON
    bets: Mapped[str] = mapped_column(Text)          # list[BacktestBetResponse] JSON
    bankroll_curve: Mapped[str] = mapped_column(Text)  # list[float] JSON
    config: Mapped[str] = mapped_column(Text)        # engine config echo JSON

    def __repr__(self) -> str:
        return f"<SavedBacktest {self.id} '{self.name}'>"
