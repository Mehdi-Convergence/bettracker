from datetime import datetime
from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class FootballMatch(Base, TimestampMixin):
    __tablename__ = "football_matches"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identifiers
    season: Mapped[str] = mapped_column(String(4))  # "2324"
    league: Mapped[str] = mapped_column(String(4))  # "E0", "F1", etc.
    date: Mapped[datetime]
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))

    # Full time result
    fthg: Mapped[int]  # Full time home goals
    ftag: Mapped[int]  # Full time away goals
    ftr: Mapped[str] = mapped_column(String(1))  # H/D/A

    # Half time
    hthg: Mapped[Optional[int]]
    htag: Mapped[Optional[int]]

    # Match stats
    home_shots: Mapped[Optional[int]]
    away_shots: Mapped[Optional[int]]
    home_shots_target: Mapped[Optional[int]]
    away_shots_target: Mapped[Optional[int]]
    home_corners: Mapped[Optional[int]]
    away_corners: Mapped[Optional[int]]
    home_fouls: Mapped[Optional[int]]
    away_fouls: Mapped[Optional[int]]
    home_yellow: Mapped[Optional[int]]
    away_yellow: Mapped[Optional[int]]
    home_red: Mapped[Optional[int]]
    away_red: Mapped[Optional[int]]

    # xG (optional, from FBref enrichment)
    home_xg: Mapped[Optional[float]]
    away_xg: Mapped[Optional[float]]

    # Odds - Pinnacle (sharpest market)
    odds_home: Mapped[Optional[float]]
    odds_draw: Mapped[Optional[float]]
    odds_away: Mapped[Optional[float]]

    # Pinnacle closing odds (for CLV calculation)
    odds_home_close: Mapped[Optional[float]]
    odds_draw_close: Mapped[Optional[float]]
    odds_away_close: Mapped[Optional[float]]

    # Max odds across bookmakers
    max_odds_home: Mapped[Optional[float]]
    max_odds_draw: Mapped[Optional[float]]
    max_odds_away: Mapped[Optional[float]]

    # Average odds across bookmakers
    avg_odds_home: Mapped[Optional[float]]
    avg_odds_draw: Mapped[Optional[float]]
    avg_odds_away: Mapped[Optional[float]]

    __table_args__ = (
        Index("idx_match_date", "date"),
        Index("idx_match_league_season", "league", "season"),
        Index("idx_match_teams", "home_team", "away_team"),
    )

    def __repr__(self) -> str:
        return f"<FootballMatch {self.home_team} vs {self.away_team} ({self.date.strftime('%Y-%m-%d')})>"
