"""Add dashboard_presets column to user_preferences table.

Revision ID: w002_add_dashboard_presets_to_user_preferences
Revises: w001_add_dashboard_layout_to_user_preferences
Create Date: 2026-03-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w002_add_dashboard_presets_to_user_preferences"
down_revision: Union[str, None] = "w001_add_dashboard_layout_to_user_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.add_column(sa.Column("dashboard_presets", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("active_preset_id", sa.String(50), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.drop_column("active_preset_id")
        batch_op.drop_column("dashboard_presets")
