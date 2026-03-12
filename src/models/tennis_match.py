from datetime import datetime
from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class TennisMatch(Base, TimestampMixin):
    __tablename__ = "tennis_matches"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identifiers
    year: Mapped[int]
    tournament: Mapped[Optional[str]] = mapped_column(String(150))
    location: Mapped[Optional[str]] = mapped_column(String(150))
    surface: Mapped[Optional[str]] = mapped_column(String(20))   # Hard / Clay / Grass / Carpet
    series: Mapped[Optional[str]] = mapped_column(String(50))    # Grand Slam, Masters, etc.
    court: Mapped[Optional[str]] = mapped_column(String(20))     # Indoor / Outdoor
    round: Mapped[Optional[str]] = mapped_column(String(30))
    best_of: Mapped[Optional[int]]
    date: Mapped[datetime]

    # Players
    winner: Mapped[str] = mapped_column(String(100))
    loser: Mapped[str] = mapped_column(String(100))
    winner_rank: Mapped[Optional[int]]
    loser_rank: Mapped[Optional[int]]
    winner_rank_pts: Mapped[Optional[int]]
    loser_rank_pts: Mapped[Optional[int]]

    # Score per set
    w1: Mapped[Optional[int]]
    l1: Mapped[Optional[int]]
    w2: Mapped[Optional[int]]
    l2: Mapped[Optional[int]]
    w3: Mapped[Optional[int]]
    l3: Mapped[Optional[int]]
    w4: Mapped[Optional[int]]
    l4: Mapped[Optional[int]]
    w5: Mapped[Optional[int]]
    l5: Mapped[Optional[int]]
    wsets: Mapped[Optional[int]]
    lsets: Mapped[Optional[int]]
    comment: Mapped[Optional[str]] = mapped_column(String(50))   # Completed / Retired / W/O

    # Odds — Pinnacle (reference market)
    odds_winner: Mapped[Optional[float]]   # PSW
    odds_loser: Mapped[Optional[float]]    # PSL

    # Pinnacle closing odds (for CLV)
    odds_winner_close: Mapped[Optional[float]]
    odds_loser_close: Mapped[Optional[float]]

    # Max / Avg across bookmakers
    max_odds_winner: Mapped[Optional[float]]
    max_odds_loser: Mapped[Optional[float]]
    avg_odds_winner: Mapped[Optional[float]]
    avg_odds_loser: Mapped[Optional[float]]

    # Service stats (from Tennis Abstract — enriched by scripts/enrich_tennis_abstract.py)
    w_ace: Mapped[Optional[int]]
    w_df: Mapped[Optional[int]]
    w_svpt: Mapped[Optional[int]]
    w_1stIn: Mapped[Optional[int]]
    w_1stWon: Mapped[Optional[int]]
    w_2ndWon: Mapped[Optional[int]]
    w_SvGms: Mapped[Optional[int]]
    w_bpSaved: Mapped[Optional[int]]
    w_bpFaced: Mapped[Optional[int]]
    l_ace: Mapped[Optional[int]]
    l_df: Mapped[Optional[int]]
    l_svpt: Mapped[Optional[int]]
    l_1stIn: Mapped[Optional[int]]
    l_1stWon: Mapped[Optional[int]]
    l_2ndWon: Mapped[Optional[int]]
    l_SvGms: Mapped[Optional[int]]
    l_bpSaved: Mapped[Optional[int]]
    l_bpFaced: Mapped[Optional[int]]
    minutes: Mapped[Optional[int]]
    abstract_winner_id: Mapped[Optional[int]]
    abstract_loser_id: Mapped[Optional[int]]

    __table_args__ = (
        Index("idx_tennis_date", "date"),
        Index("idx_tennis_year_tournament", "year", "tournament"),
        Index("idx_tennis_players", "winner", "loser"),
    )

    def __repr__(self) -> str:
        return f"<TennisMatch {self.winner} vs {self.loser} ({self.date.strftime('%Y-%m-%d')})>"
