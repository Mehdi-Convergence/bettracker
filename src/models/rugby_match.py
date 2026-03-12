from datetime import date
from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class RugbyMatch(Base, TimestampMixin):
    __tablename__ = "rugby_matches"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identifiers
    match_id: Mapped[Optional[str]] = mapped_column(String(30), unique=True)  # API-Sports match id
    season: Mapped[str] = mapped_column(String(20))   # e.g. "2023-24" or "2024"
    match_date: Mapped[date]

    # Competition
    league: Mapped[str] = mapped_column(String(100))      # e.g. "Top 14", "Premiership"
    league_id: Mapped[Optional[int]]

    # Teams
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))
    home_team_id: Mapped[Optional[int]]
    away_team_id: Mapped[Optional[int]]

    # Final scores
    home_score: Mapped[Optional[int]]
    away_score: Mapped[Optional[int]]

    # Rugby-specific scoring breakdown
    home_tries: Mapped[Optional[int]]
    away_tries: Mapped[Optional[int]]
    home_conversions: Mapped[Optional[int]]
    away_conversions: Mapped[Optional[int]]
    home_penalties: Mapped[Optional[int]]
    away_penalties: Mapped[Optional[int]]
    home_drop_goals: Mapped[Optional[int]]
    away_drop_goals: Mapped[Optional[int]]

    # Odds (rugby has draws, so 1X2 like football)
    odds_home: Mapped[Optional[float]]
    odds_draw: Mapped[Optional[float]]
    odds_away: Mapped[Optional[float]]

    # Over/under market
    odds_over: Mapped[Optional[float]]
    odds_under: Mapped[Optional[float]]
    total_line: Mapped[Optional[float]]   # e.g. 44.5

    __table_args__ = (
        Index("idx_rugby_date", "match_date"),
        Index("idx_rugby_season", "season"),
        Index("idx_rugby_teams", "home_team", "away_team"),
        Index("idx_rugby_league", "league"),
    )

    def __repr__(self) -> str:
        return f"<RugbyMatch {self.home_team} vs {self.away_team} ({self.match_date})>"
