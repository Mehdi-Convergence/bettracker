"""add_tennis_matches_table

Revision ID: 7863a5572e7d
Revises: g7h8i9j0k1l2
Create Date: 2026-03-11 10:37:05.063080

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = '7863a5572e7d'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('tennis_matches',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('tournament', sa.String(length=150), nullable=True),
    sa.Column('location', sa.String(length=150), nullable=True),
    sa.Column('surface', sa.String(length=20), nullable=True),
    sa.Column('series', sa.String(length=50), nullable=True),
    sa.Column('court', sa.String(length=20), nullable=True),
    sa.Column('round', sa.String(length=30), nullable=True),
    sa.Column('best_of', sa.Integer(), nullable=True),
    sa.Column('date', sa.DateTime(), nullable=False),
    sa.Column('winner', sa.String(length=100), nullable=False),
    sa.Column('loser', sa.String(length=100), nullable=False),
    sa.Column('winner_rank', sa.Integer(), nullable=True),
    sa.Column('loser_rank', sa.Integer(), nullable=True),
    sa.Column('winner_rank_pts', sa.Integer(), nullable=True),
    sa.Column('loser_rank_pts', sa.Integer(), nullable=True),
    sa.Column('w1', sa.Integer(), nullable=True),
    sa.Column('l1', sa.Integer(), nullable=True),
    sa.Column('w2', sa.Integer(), nullable=True),
    sa.Column('l2', sa.Integer(), nullable=True),
    sa.Column('w3', sa.Integer(), nullable=True),
    sa.Column('l3', sa.Integer(), nullable=True),
    sa.Column('w4', sa.Integer(), nullable=True),
    sa.Column('l4', sa.Integer(), nullable=True),
    sa.Column('w5', sa.Integer(), nullable=True),
    sa.Column('l5', sa.Integer(), nullable=True),
    sa.Column('wsets', sa.Integer(), nullable=True),
    sa.Column('lsets', sa.Integer(), nullable=True),
    sa.Column('comment', sa.String(length=50), nullable=True),
    sa.Column('odds_winner', sa.Float(), nullable=True),
    sa.Column('odds_loser', sa.Float(), nullable=True),
    sa.Column('odds_winner_close', sa.Float(), nullable=True),
    sa.Column('odds_loser_close', sa.Float(), nullable=True),
    sa.Column('max_odds_winner', sa.Float(), nullable=True),
    sa.Column('max_odds_loser', sa.Float(), nullable=True),
    sa.Column('avg_odds_winner', sa.Float(), nullable=True),
    sa.Column('avg_odds_loser', sa.Float(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_tennis_date', 'tennis_matches', ['date'], unique=False)
    op.create_index('idx_tennis_players', 'tennis_matches', ['winner', 'loser'], unique=False)
    op.create_index('idx_tennis_year_tournament', 'tennis_matches', ['year', 'tournament'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_tennis_year_tournament', table_name='tennis_matches')
    op.drop_index('idx_tennis_players', table_name='tennis_matches')
    op.drop_index('idx_tennis_date', table_name='tennis_matches')
    op.drop_table('tennis_matches')
