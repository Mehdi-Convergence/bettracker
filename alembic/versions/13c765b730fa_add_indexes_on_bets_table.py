"""add_indexes_on_bets_table

Revision ID: 13c765b730fa
Revises: f3g4h5i6j7k8_add_avatar_url_to_users
Create Date: 2026-03-18 20:51:23.935779

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '13c765b730fa'
down_revision: Union[str, None] = 'f3g4h5i6j7k8_add_avatar_url_to_users'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('idx_bet_campaign', 'bets', ['campaign_id'], unique=False)
    op.create_index('idx_bet_match_date', 'bets', ['match_date'], unique=False)
    op.create_index('idx_bet_result', 'bets', ['result'], unique=False)
    op.create_index('idx_bet_user_backtest', 'bets', ['user_id', 'is_backtest'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_bet_user_backtest', table_name='bets')
    op.drop_index('idx_bet_result', table_name='bets')
    op.drop_index('idx_bet_match_date', table_name='bets')
    op.drop_index('idx_bet_campaign', table_name='bets')
