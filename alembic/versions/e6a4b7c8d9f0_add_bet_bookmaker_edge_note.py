"""add bookmaker, edge_at_bet, note columns to bets

Revision ID: e6a4b7c8d9f0
Revises: d5f3e8a9b0c2
Create Date: 2026-03-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6a4b7c8d9f0'
down_revision: Union[str, None] = 'd5f3e8a9b0c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bets', sa.Column('bookmaker', sa.String(50), nullable=True))
    op.add_column('bets', sa.Column('edge_at_bet', sa.Float(), nullable=True))
    op.add_column('bets', sa.Column('note', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('bets', 'note')
    op.drop_column('bets', 'edge_at_bet')
    op.drop_column('bets', 'bookmaker')
