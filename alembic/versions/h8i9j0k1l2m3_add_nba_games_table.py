"""add nba_games table

Revision ID: h8i9j0k1l2m3
Revises: 74986ffb1dbb
Create Date: 2026-03-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h8i9j0k1l2m3"
down_revision: Union[str, None] = "74986ffb1dbb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if "nba_games" not in existing_tables:
        op.create_table(
            "nba_games",
            sa.Column("id", sa.Integer(), primary_key=True),
            # Identifiers
            sa.Column("game_id", sa.String(20), nullable=True, unique=True),
            sa.Column("season", sa.String(10), nullable=False),
            sa.Column("season_type", sa.String(20), nullable=True),
            sa.Column("game_date", sa.Date(), nullable=False),
            # Teams
            sa.Column("home_team", sa.String(50), nullable=False),
            sa.Column("away_team", sa.String(50), nullable=False),
            sa.Column("home_team_id", sa.Integer(), nullable=True),
            sa.Column("away_team_id", sa.Integer(), nullable=True),
            # Scores
            sa.Column("home_score", sa.Integer(), nullable=True),
            sa.Column("away_score", sa.Integer(), nullable=True),
            # Box score stats — home
            sa.Column("home_fg_pct", sa.Float(), nullable=True),
            sa.Column("home_fg3_pct", sa.Float(), nullable=True),
            sa.Column("home_ft_pct", sa.Float(), nullable=True),
            sa.Column("home_reb", sa.Integer(), nullable=True),
            sa.Column("home_ast", sa.Integer(), nullable=True),
            sa.Column("home_tov", sa.Integer(), nullable=True),
            sa.Column("home_stl", sa.Integer(), nullable=True),
            sa.Column("home_blk", sa.Integer(), nullable=True),
            sa.Column("home_pts", sa.Integer(), nullable=True),
            # Box score stats — away
            sa.Column("away_fg_pct", sa.Float(), nullable=True),
            sa.Column("away_fg3_pct", sa.Float(), nullable=True),
            sa.Column("away_ft_pct", sa.Float(), nullable=True),
            sa.Column("away_reb", sa.Integer(), nullable=True),
            sa.Column("away_ast", sa.Integer(), nullable=True),
            sa.Column("away_tov", sa.Integer(), nullable=True),
            sa.Column("away_stl", sa.Integer(), nullable=True),
            sa.Column("away_blk", sa.Integer(), nullable=True),
            sa.Column("away_pts", sa.Integer(), nullable=True),
            # Advanced stats
            sa.Column("home_off_rating", sa.Float(), nullable=True),
            sa.Column("home_def_rating", sa.Float(), nullable=True),
            sa.Column("home_pace", sa.Float(), nullable=True),
            sa.Column("away_off_rating", sa.Float(), nullable=True),
            sa.Column("away_def_rating", sa.Float(), nullable=True),
            sa.Column("away_pace", sa.Float(), nullable=True),
            # Odds (Pinnacle / Odds API)
            sa.Column("odds_home", sa.Float(), nullable=True),
            sa.Column("odds_away", sa.Float(), nullable=True),
            sa.Column("odds_over", sa.Float(), nullable=True),
            sa.Column("odds_under", sa.Float(), nullable=True),
            sa.Column("total_line", sa.Float(), nullable=True),
            # Timestamps
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("nba_games")} if "nba_games" in existing_tables else set()
    if "idx_nba_date" not in existing_indexes:
        op.create_index("idx_nba_date", "nba_games", ["game_date"])
    if "idx_nba_season" not in existing_indexes:
        op.create_index("idx_nba_season", "nba_games", ["season"])
    if "idx_nba_teams" not in existing_indexes:
        op.create_index("idx_nba_teams", "nba_games", ["home_team", "away_team"])


def downgrade() -> None:
    op.drop_index("idx_nba_teams", "nba_games")
    op.drop_index("idx_nba_season", "nba_games")
    op.drop_index("idx_nba_date", "nba_games")
    op.drop_table("nba_games")
