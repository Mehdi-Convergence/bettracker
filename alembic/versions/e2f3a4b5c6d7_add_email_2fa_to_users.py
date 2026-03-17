"""Add email_2fa_enabled and preferred_2fa_method to users table.

Revision ID: e2f3a4b5c6d7_add_email_2fa_to_users
Revises: w002_add_dashboard_presets_to_user_preferences
Create Date: 2026-03-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2f3a4b5c6d7_add_email_2fa_to_users"
down_revision: Union[str, None] = "w002_add_dashboard_presets_to_user_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("email_2fa_enabled", sa.Boolean(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("preferred_2fa_method", sa.String(20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("preferred_2fa_method")
        batch_op.drop_column("email_2fa_enabled")
