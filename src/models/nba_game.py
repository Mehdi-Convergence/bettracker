from datetime import date
from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class NBAGame(Base, TimestampMixin):
    __tablename__ = "nba_games"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identifiers
    game_id: Mapped[Optional[str]] = mapped_column(String(20), unique=True)  # NBA API game_id
    season: Mapped[str] = mapped_column(String(10))   # e.g. "2023-24"
    season_type: Mapped[Optional[str]] = mapped_column(String(20))  # Regular Season / Playoffs
    game_date: Mapped[date]

    # Teams
    home_team: Mapped[str] = mapped_column(String(50))
    away_team: Mapped[str] = mapped_column(String(50))
    home_team_id: Mapped[Optional[int]]
    away_team_id: Mapped[Optional[int]]

    # Scores
    home_score: Mapped[Optional[int]]
    away_score: Mapped[Optional[int]]

    # Box score stats — home
    home_fg_pct: Mapped[Optional[float]]
    home_fg3_pct: Mapped[Optional[float]]
    home_ft_pct: Mapped[Optional[float]]
    home_reb: Mapped[Optional[int]]
    home_ast: Mapped[Optional[int]]
    home_tov: Mapped[Optional[int]]
    home_stl: Mapped[Optional[int]]
    home_blk: Mapped[Optional[int]]
    home_pts: Mapped[Optional[int]]

    # Box score stats — away
    away_fg_pct: Mapped[Optional[float]]
    away_fg3_pct: Mapped[Optional[float]]
    away_ft_pct: Mapped[Optional[float]]
    away_reb: Mapped[Optional[int]]
    away_ast: Mapped[Optional[int]]
    away_tov: Mapped[Optional[int]]
    away_stl: Mapped[Optional[int]]
    away_blk: Mapped[Optional[int]]
    away_pts: Mapped[Optional[int]]

    # Advanced stats (from leaguedashteamstats)
    home_off_rating: Mapped[Optional[float]]
    home_def_rating: Mapped[Optional[float]]
    home_pace: Mapped[Optional[float]]
    away_off_rating: Mapped[Optional[float]]
    away_def_rating: Mapped[Optional[float]]
    away_pace: Mapped[Optional[float]]

    # Odds (Pinnacle / Odds API)
    odds_home: Mapped[Optional[float]]
    odds_away: Mapped[Optional[float]]
    odds_over: Mapped[Optional[float]]
    odds_under: Mapped[Optional[float]]
    total_line: Mapped[Optional[float]]  # e.g. 226.5

    __table_args__ = (
        Index("idx_nba_date", "game_date"),
        Index("idx_nba_season", "season"),
        Index("idx_nba_teams", "home_team", "away_team"),
    )

    def __repr__(self) -> str:
        return f"<NBAGame {self.home_team} vs {self.away_team} ({self.game_date})>"
