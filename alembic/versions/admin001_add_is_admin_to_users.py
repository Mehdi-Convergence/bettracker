"""Add is_admin column to users table.

Revision ID: admin001
Revises: h8i9j3k4l5m6
Create Date: 2026-03-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "admin001"
down_revision: Union[str, None] = "h8i9j3k4l5m6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("is_admin", sa.Boolean(), server_default="0", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("is_admin")
