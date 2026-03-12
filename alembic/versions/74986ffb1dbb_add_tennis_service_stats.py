"""add tennis service stats columns from Tennis Abstract

Revision ID: 74986ffb1dbb
Revises: 7863a5572e7d
Create Date: 2026-03-12

Adds service statistics columns to tennis_matches table.
Data populated by scripts/enrich_tennis_abstract.py.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "74986ffb1dbb"
down_revision: Union[str, None] = "7863a5572e7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tennis_matches") as batch_op:
        # Winner service stats
        batch_op.add_column(sa.Column("w_ace", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_df", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_svpt", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_1stIn", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_1stWon", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_2ndWon", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_SvGms", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_bpSaved", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("w_bpFaced", sa.Integer(), nullable=True))
        # Loser service stats
        batch_op.add_column(sa.Column("l_ace", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_df", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_svpt", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_1stIn", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_1stWon", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_2ndWon", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_SvGms", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_bpSaved", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("l_bpFaced", sa.Integer(), nullable=True))
        # Match duration
        batch_op.add_column(sa.Column("minutes", sa.Integer(), nullable=True))
        # Abstract player IDs (for future use)
        batch_op.add_column(sa.Column("abstract_winner_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("abstract_loser_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tennis_matches") as batch_op:
        for col in [
            "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon", "w_SvGms", "w_bpSaved", "w_bpFaced",
            "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon", "l_SvGms", "l_bpSaved", "l_bpFaced",
            "minutes", "abstract_winner_id", "abstract_loser_id",
        ]:
            batch_op.drop_column(col)
