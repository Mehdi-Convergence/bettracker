"""Add email_verified and email_verification_token to users.

Revision ID: v001_add_email_verification
Revises: admin001
Create Date: 2026-03-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v001_add_email_verification"
down_revision: Union[str, None] = "admin001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("email_verified", sa.Boolean(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("email_verification_token", sa.String(255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("email_verification_token")
        batch_op.drop_column("email_verified")
