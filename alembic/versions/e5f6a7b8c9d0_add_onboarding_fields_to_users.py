"""Add onboarding_completed and visited_modules to users.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-10
"""

from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("onboarding_completed", sa.Boolean(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("visited_modules", sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("visited_modules")
        batch_op.drop_column("onboarding_completed")
