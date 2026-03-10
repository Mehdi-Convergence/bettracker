"""add_source_to_bets

Revision ID: c4e2f7a8b9d1
Revises: b3f1a2c4d5e6
Create Date: 2026-03-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e2f7a8b9d1'
down_revision: Union[str, None] = 'b3f1a2c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bets', sa.Column('source', sa.String(length=10), nullable=True))
    # Backfill existing rows: campaign_id + prediction_id → algo, campaign_id only → manual, else → scanner
    op.execute("""
        UPDATE bets SET source = CASE
            WHEN campaign_id IS NOT NULL AND prediction_id IS NOT NULL THEN 'algo'
            WHEN campaign_id IS NOT NULL THEN 'manual'
            ELSE 'scanner'
        END
        WHERE source IS NULL
    """)


def downgrade() -> None:
    op.drop_column('bets', 'source')
