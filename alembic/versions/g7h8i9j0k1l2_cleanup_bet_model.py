"""Cleanup bet model: drop prediction_id, widen league column.

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-03-10
"""

from alembic import op
import sqlalchemy as sa

revision = "g7h8i9j0k1l2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("bets") as batch_op:
        batch_op.drop_column("prediction_id")
        batch_op.alter_column("league", type_=sa.String(50))


def downgrade() -> None:
    with op.batch_alter_table("bets") as batch_op:
        batch_op.add_column(sa.Column("prediction_id", sa.Integer(), nullable=True))
        batch_op.alter_column("league", type_=sa.String(10))
