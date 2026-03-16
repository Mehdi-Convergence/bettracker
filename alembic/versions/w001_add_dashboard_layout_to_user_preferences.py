"""Add dashboard_layout column to user_preferences table.

Revision ID: w001_add_dashboard_layout_to_user_preferences
Revises: t001_add_totp_to_users
Create Date: 2026-03-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w001_add_dashboard_layout_to_user_preferences"
down_revision: Union[str, None] = "t001_add_totp_to_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.add_column(sa.Column("dashboard_layout", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.drop_column("dashboard_layout")
