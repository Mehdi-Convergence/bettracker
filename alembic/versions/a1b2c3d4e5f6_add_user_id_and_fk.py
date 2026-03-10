"""add user_id to campaigns/bets and FK constraints

Revision ID: a1b2c3d4e5f6
Revises: f7b8c9d0e1f2
Create Date: 2026-03-10 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add user_id to campaigns
    op.add_column("campaigns", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_index("ix_campaigns_user_id", "campaigns", ["user_id"])

    # Add user_id to bets
    op.add_column("bets", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_index("ix_bets_user_id", "bets", ["user_id"])

    # Note: FK constraints on SQLite are limited (no ALTER TABLE ADD CONSTRAINT).
    # The ForeignKey is defined in the ORM model for new tables / future PostgreSQL.
    # For SQLite, the indexes above provide query performance.


def downgrade() -> None:
    op.drop_index("ix_bets_user_id", table_name="bets")
    op.drop_column("bets", "user_id")
    op.drop_index("ix_campaigns_user_id", table_name="campaigns")
    op.drop_column("campaigns", "user_id")
