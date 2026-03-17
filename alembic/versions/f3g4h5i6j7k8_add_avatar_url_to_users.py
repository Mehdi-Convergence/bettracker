"""Add avatar_url to users table.

Revision ID: f3g4h5i6j7k8_add_avatar_url_to_users
Revises: e2f3a4b5c6d7_add_email_2fa_to_users
Create Date: 2026-03-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3g4h5i6j7k8_add_avatar_url_to_users"
down_revision: Union[str, None] = "e2f3a4b5c6d7_add_email_2fa_to_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("avatar_url", sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("avatar_url")
