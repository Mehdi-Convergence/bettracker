"""add rugby_matches table

Revision ID: h8i9j1k2l3m4
Revises: h8i9j0k1l2m3
Create Date: 2026-03-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h8i9j1k2l3m4"
down_revision: Union[str, None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if "rugby_matches" not in existing_tables:
        op.create_table(
            "rugby_matches",
            sa.Column("id", sa.Integer(), primary_key=True),
            # Identifiers
            sa.Column("match_id", sa.String(30), nullable=True, unique=True),
            sa.Column("season", sa.String(20), nullable=False),
            sa.Column("match_date", sa.Date(), nullable=False),
            # Competition
            sa.Column("league", sa.String(100), nullable=False),
            sa.Column("league_id", sa.Integer(), nullable=True),
            # Teams
            sa.Column("home_team", sa.String(100), nullable=False),
            sa.Column("away_team", sa.String(100), nullable=False),
            sa.Column("home_team_id", sa.Integer(), nullable=True),
            sa.Column("away_team_id", sa.Integer(), nullable=True),
            # Final scores
            sa.Column("home_score", sa.Integer(), nullable=True),
            sa.Column("away_score", sa.Integer(), nullable=True),
            # Rugby-specific scoring breakdown
            sa.Column("home_tries", sa.Integer(), nullable=True),
            sa.Column("away_tries", sa.Integer(), nullable=True),
            sa.Column("home_conversions", sa.Integer(), nullable=True),
            sa.Column("away_conversions", sa.Integer(), nullable=True),
            sa.Column("home_penalties", sa.Integer(), nullable=True),
            sa.Column("away_penalties", sa.Integer(), nullable=True),
            sa.Column("home_drop_goals", sa.Integer(), nullable=True),
            sa.Column("away_drop_goals", sa.Integer(), nullable=True),
            # Odds (1X2 — rugby has draws like football)
            sa.Column("odds_home", sa.Float(), nullable=True),
            sa.Column("odds_draw", sa.Float(), nullable=True),
            sa.Column("odds_away", sa.Float(), nullable=True),
            # Over/under market
            sa.Column("odds_over", sa.Float(), nullable=True),
            sa.Column("odds_under", sa.Float(), nullable=True),
            sa.Column("total_line", sa.Float(), nullable=True),
            # Timestamps
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("rugby_matches")} if "rugby_matches" in existing_tables else set()
    if "idx_rugby_date" not in existing_indexes:
        op.create_index("idx_rugby_date", "rugby_matches", ["match_date"])
    if "idx_rugby_season" not in existing_indexes:
        op.create_index("idx_rugby_season", "rugby_matches", ["season"])
    if "idx_rugby_teams" not in existing_indexes:
        op.create_index("idx_rugby_teams", "rugby_matches", ["home_team", "away_team"])
    if "idx_rugby_league" not in existing_indexes:
        op.create_index("idx_rugby_league", "rugby_matches", ["league"])


def downgrade() -> None:
    op.drop_index("idx_rugby_league", "rugby_matches")
    op.drop_index("idx_rugby_teams", "rugby_matches")
    op.drop_index("idx_rugby_season", "rugby_matches")
    op.drop_index("idx_rugby_date", "rugby_matches")
    op.drop_table("rugby_matches")
