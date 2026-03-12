"""add rugby_matches table

Revision ID: rugby0001a2b3c
Revises: nba0001a2b3c
Create Date: 2026-03-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "rugby0001a2b3c"
down_revision: Union[str, None] = "nba0001a2b3c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rugby_matches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("match_id", sa.String(30), nullable=True, unique=True),
        sa.Column("season", sa.String(20), nullable=False),
        sa.Column("match_date", sa.Date(), nullable=False),
        sa.Column("league", sa.String(100), nullable=False),
        sa.Column("league_id", sa.Integer(), nullable=True),
        sa.Column("home_team", sa.String(100), nullable=False),
        sa.Column("away_team", sa.String(100), nullable=False),
        sa.Column("home_team_id", sa.Integer(), nullable=True),
        sa.Column("away_team_id", sa.Integer(), nullable=True),
        # Scores
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        # Scoring breakdown
        sa.Column("home_tries", sa.Integer(), nullable=True),
        sa.Column("away_tries", sa.Integer(), nullable=True),
        sa.Column("home_conversions", sa.Integer(), nullable=True),
        sa.Column("away_conversions", sa.Integer(), nullable=True),
        sa.Column("home_penalties", sa.Integer(), nullable=True),
        sa.Column("away_penalties", sa.Integer(), nullable=True),
        sa.Column("home_drop_goals", sa.Integer(), nullable=True),
        sa.Column("away_drop_goals", sa.Integer(), nullable=True),
        # Odds (1X2 — rugby has draws)
        sa.Column("odds_home", sa.Float(), nullable=True),
        sa.Column("odds_draw", sa.Float(), nullable=True),
        sa.Column("odds_away", sa.Float(), nullable=True),
        # Over/under
        sa.Column("odds_over", sa.Float(), nullable=True),
        sa.Column("odds_under", sa.Float(), nullable=True),
        sa.Column("total_line", sa.Float(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_rugby_date", "rugby_matches", ["match_date"])
    op.create_index("idx_rugby_season", "rugby_matches", ["season"])
    op.create_index("idx_rugby_teams", "rugby_matches", ["home_team", "away_team"])
    op.create_index("idx_rugby_league", "rugby_matches", ["league"])


def downgrade() -> None:
    op.drop_index("idx_rugby_league", "rugby_matches")
    op.drop_index("idx_rugby_teams", "rugby_matches")
    op.drop_index("idx_rugby_season", "rugby_matches")
    op.drop_index("idx_rugby_date", "rugby_matches")
    op.drop_table("rugby_matches")
