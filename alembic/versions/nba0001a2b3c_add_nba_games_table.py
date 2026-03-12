"""add nba_games table

Revision ID: a1b2c3d4e5f6
Revises: 74986ffb1dbb
Create Date: 2026-03-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "nba0001a2b3c"
down_revision: Union[str, None] = "74986ffb1dbb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nba_games",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("game_id", sa.String(20), nullable=True, unique=True),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("season_type", sa.String(20), nullable=True),
        sa.Column("game_date", sa.Date(), nullable=False),
        sa.Column("home_team", sa.String(50), nullable=False),
        sa.Column("away_team", sa.String(50), nullable=False),
        sa.Column("home_team_id", sa.Integer(), nullable=True),
        sa.Column("away_team_id", sa.Integer(), nullable=True),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        # Home box score
        sa.Column("home_fg_pct", sa.Float(), nullable=True),
        sa.Column("home_fg3_pct", sa.Float(), nullable=True),
        sa.Column("home_ft_pct", sa.Float(), nullable=True),
        sa.Column("home_reb", sa.Integer(), nullable=True),
        sa.Column("home_ast", sa.Integer(), nullable=True),
        sa.Column("home_tov", sa.Integer(), nullable=True),
        sa.Column("home_stl", sa.Integer(), nullable=True),
        sa.Column("home_blk", sa.Integer(), nullable=True),
        sa.Column("home_pts", sa.Integer(), nullable=True),
        # Away box score
        sa.Column("away_fg_pct", sa.Float(), nullable=True),
        sa.Column("away_fg3_pct", sa.Float(), nullable=True),
        sa.Column("away_ft_pct", sa.Float(), nullable=True),
        sa.Column("away_reb", sa.Integer(), nullable=True),
        sa.Column("away_ast", sa.Integer(), nullable=True),
        sa.Column("away_tov", sa.Integer(), nullable=True),
        sa.Column("away_stl", sa.Integer(), nullable=True),
        sa.Column("away_blk", sa.Integer(), nullable=True),
        sa.Column("away_pts", sa.Integer(), nullable=True),
        # Advanced
        sa.Column("home_off_rating", sa.Float(), nullable=True),
        sa.Column("home_def_rating", sa.Float(), nullable=True),
        sa.Column("home_pace", sa.Float(), nullable=True),
        sa.Column("away_off_rating", sa.Float(), nullable=True),
        sa.Column("away_def_rating", sa.Float(), nullable=True),
        sa.Column("away_pace", sa.Float(), nullable=True),
        # Odds
        sa.Column("odds_home", sa.Float(), nullable=True),
        sa.Column("odds_away", sa.Float(), nullable=True),
        sa.Column("odds_over", sa.Float(), nullable=True),
        sa.Column("odds_under", sa.Float(), nullable=True),
        sa.Column("total_line", sa.Float(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_nba_date", "nba_games", ["game_date"])
    op.create_index("idx_nba_season", "nba_games", ["season"])
    op.create_index("idx_nba_teams", "nba_games", ["home_team", "away_team"])


def downgrade() -> None:
    op.drop_index("idx_nba_teams", "nba_games")
    op.drop_index("idx_nba_season", "nba_games")
    op.drop_index("idx_nba_date", "nba_games")
    op.drop_table("nba_games")
