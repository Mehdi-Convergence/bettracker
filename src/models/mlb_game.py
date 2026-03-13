from datetime import date
from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class MLBGame(Base, TimestampMixin):
    __tablename__ = "mlb_games"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identifiers
    game_id: Mapped[Optional[int]] = mapped_column(unique=True)  # MLB Stats API game PK
    season: Mapped[str] = mapped_column(String(10))  # e.g. "2024"
    game_date: Mapped[date]

    # Teams
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))
    home_team_id: Mapped[Optional[int]]
    away_team_id: Mapped[Optional[int]]

    # Scores
    home_score: Mapped[Optional[int]]
    away_score: Mapped[Optional[int]]

    # Box score stats
    home_hits: Mapped[Optional[int]]
    away_hits: Mapped[Optional[int]]
    home_errors: Mapped[Optional[int]]
    away_errors: Mapped[Optional[int]]

    # Game info
    innings: Mapped[int] = mapped_column(default=9)

    # Starting pitchers
    home_starter_name: Mapped[Optional[str]] = mapped_column(String(100))
    away_starter_name: Mapped[Optional[str]] = mapped_column(String(100))
    home_starter_id: Mapped[Optional[int]]
    away_starter_id: Mapped[Optional[int]]

    # Odds (Pinnacle / Odds API)
    odds_home: Mapped[Optional[float]]
    odds_away: Mapped[Optional[float]]
    odds_over: Mapped[Optional[float]]
    odds_under: Mapped[Optional[float]]
    total_line: Mapped[Optional[float]]  # e.g. 8.5 runs

    __table_args__ = (
        Index("idx_mlb_date", "game_date"),
        Index("idx_mlb_season", "season"),
        Index("idx_mlb_teams", "home_team", "away_team"),
    )

    def __repr__(self) -> str:
        return f"<MLBGame {self.home_team} vs {self.away_team} ({self.game_date})>"
