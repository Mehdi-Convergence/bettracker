"""Add totp_secret and totp_enabled to users table.

Revision ID: t001_add_totp_to_users
Revises: v001_add_email_verification
Create Date: 2026-03-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t001_add_totp_to_users"
down_revision: Union[str, None] = "v001_add_email_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("totp_secret", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("totp_enabled", sa.Boolean(), server_default="0", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("totp_enabled")
        batch_op.drop_column("totp_secret")
