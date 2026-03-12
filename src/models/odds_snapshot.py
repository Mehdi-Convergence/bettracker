import datetime

from sqlalchemy import DateTime, Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class OddsSnapshot(Base):
    __tablename__ = "odds_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(20))
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))
    match_date: Mapped[datetime.datetime] = mapped_column(DateTime)
    snapshot_time: Mapped[datetime.datetime] = mapped_column(DateTime)
    odds_home: Mapped[float | None] = mapped_column(Float, nullable=True)
    odds_draw: Mapped[float | None] = mapped_column(Float, nullable=True)
    odds_away: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        Index("idx_odds_snap_match", "sport", "home_team", "away_team", "match_date"),
        Index("idx_odds_snap_time", "snapshot_time"),
    )
