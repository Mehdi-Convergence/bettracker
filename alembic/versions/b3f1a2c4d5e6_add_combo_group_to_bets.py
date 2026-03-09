"""add_combo_group_to_bets

Revision ID: b3f1a2c4d5e6
Revises: 98c59938dddb
Create Date: 2026-03-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f1a2c4d5e6'
down_revision: Union[str, None] = '3ffb26dea7cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bets', sa.Column('combo_group', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('bets', 'combo_group')
