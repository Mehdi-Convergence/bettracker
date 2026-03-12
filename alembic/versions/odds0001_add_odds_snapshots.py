"""add odds_snapshots table

Revision ID: odds0001
Revises: nba0001a2b3c
Create Date: 2026-03-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "odds0001"
down_revision: Union[str, None] = "nba0001a2b3c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "odds_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column("home_team", sa.String(100), nullable=False),
        sa.Column("away_team", sa.String(100), nullable=False),
        sa.Column("match_date", sa.DateTime(), nullable=False),
        sa.Column("snapshot_time", sa.DateTime(), nullable=False),
        sa.Column("odds_home", sa.Float(), nullable=True),
        sa.Column("odds_draw", sa.Float(), nullable=True),
        sa.Column("odds_away", sa.Float(), nullable=True),
    )
    op.create_index(
        "idx_odds_snap_match",
        "odds_snapshots",
        ["sport", "home_team", "away_team", "match_date"],
    )
    op.create_index(
        "idx_odds_snap_time",
        "odds_snapshots",
        ["snapshot_time"],
    )


def downgrade() -> None:
    op.drop_index("idx_odds_snap_time", "odds_snapshots")
    op.drop_index("idx_odds_snap_match", "odds_snapshots")
    op.drop_table("odds_snapshots")
