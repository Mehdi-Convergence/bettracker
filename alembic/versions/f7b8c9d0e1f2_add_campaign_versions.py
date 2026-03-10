"""add campaign_versions table and bets.campaign_version column

Revision ID: f7b8c9d0e1f2
Revises: e6a4b7c8d9f0
Create Date: 2026-03-10 18:00:00.000000

"""
import json
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7b8c9d0e1f2'
down_revision: Union[str, None] = 'e6a4b7c8d9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'campaign_versions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaigns.id'), nullable=False, index=True),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('snapshot', sa.JSON(), nullable=False),
        sa.Column('changed_at', sa.DateTime(), nullable=False),
        sa.Column('change_summary', sa.String(500), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('campaign_id', 'version'),
    )

    op.add_column('bets', sa.Column('campaign_version', sa.Integer(), nullable=True))

    # Backfill: create version 1 for each existing campaign
    conn = op.get_bind()
    campaigns = conn.execute(sa.text("SELECT id, name, status, initial_bankroll, flat_stake, min_edge, min_model_prob, min_odds, max_odds, allowed_outcomes, excluded_leagues, combo_mode, combo_max_legs, combo_min_odds, combo_max_odds, combo_top_n, target_bankroll FROM campaigns")).fetchall()
    now = datetime.now(timezone.utc).isoformat()
    for c in campaigns:
        snapshot = {
            "name": c[1],
            "status": c[2],
            "initial_bankroll": c[3],
            "flat_stake": c[4],
            "min_edge": c[5],
            "min_model_prob": c[6],
            "min_odds": c[7],
            "max_odds": c[8],
            "allowed_outcomes": c[9],
            "excluded_leagues": c[10],
            "combo_mode": bool(c[11]),
            "combo_max_legs": c[12],
            "combo_min_odds": c[13],
            "combo_max_odds": c[14],
            "combo_top_n": c[15],
            "target_bankroll": c[16],
        }
        conn.execute(
            sa.text(
                "INSERT INTO campaign_versions (campaign_id, version, snapshot, changed_at, change_summary, created_at, updated_at) "
                "VALUES (:cid, 1, :snap, :now, :summary, :now, :now)"
            ),
            {"cid": c[0], "snap": json.dumps(snapshot), "now": now, "summary": "Initial (backfill)"},
        )


def downgrade() -> None:
    op.drop_column('bets', 'campaign_version')
    op.drop_table('campaign_versions')
