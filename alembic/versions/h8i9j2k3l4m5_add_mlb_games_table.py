"""add mlb_games table

Revision ID: h8i9j2k3l4m5
Revises: ai0001a1b2c3
Create Date: 2026-03-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h8i9j2k3l4m5"
down_revision: Union[str, None] = "ai0001a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if "mlb_games" not in existing_tables:
        op.create_table(
            "mlb_games",
            sa.Column("id", sa.Integer(), primary_key=True),
            # Identifiers
            sa.Column("game_id", sa.Integer(), nullable=True, unique=True),
            sa.Column("season", sa.String(10), nullable=False),
            sa.Column("game_date", sa.Date(), nullable=False),
            # Teams
            sa.Column("home_team", sa.String(100), nullable=False),
            sa.Column("away_team", sa.String(100), nullable=False),
            sa.Column("home_team_id", sa.Integer(), nullable=True),
            sa.Column("away_team_id", sa.Integer(), nullable=True),
            # Scores
            sa.Column("home_score", sa.Integer(), nullable=True),
            sa.Column("away_score", sa.Integer(), nullable=True),
            # Box score stats
            sa.Column("home_hits", sa.Integer(), nullable=True),
            sa.Column("away_hits", sa.Integer(), nullable=True),
            sa.Column("home_errors", sa.Integer(), nullable=True),
            sa.Column("away_errors", sa.Integer(), nullable=True),
            # Game info
            sa.Column("innings", sa.Integer(), nullable=False, server_default="9"),
            # Starting pitchers
            sa.Column("home_starter_name", sa.String(100), nullable=True),
            sa.Column("away_starter_name", sa.String(100), nullable=True),
            sa.Column("home_starter_id", sa.Integer(), nullable=True),
            sa.Column("away_starter_id", sa.Integer(), nullable=True),
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

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("mlb_games")} if "mlb_games" in existing_tables else set()
    if "idx_mlb_date" not in existing_indexes:
        op.create_index("idx_mlb_date", "mlb_games", ["game_date"])
    if "idx_mlb_season" not in existing_indexes:
        op.create_index("idx_mlb_season", "mlb_games", ["season"])
    if "idx_mlb_teams" not in existing_indexes:
        op.create_index("idx_mlb_teams", "mlb_games", ["home_team", "away_team"])


def downgrade() -> None:
    op.drop_index("idx_mlb_teams", "mlb_games")
    op.drop_index("idx_mlb_season", "mlb_games")
    op.drop_index("idx_mlb_date", "mlb_games")
    op.drop_table("mlb_games")
