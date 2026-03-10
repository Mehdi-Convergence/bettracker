"""add_user_preferences_table

Revision ID: d5f3e8a9b0c2
Revises: c4e2f7a8b9d1
Create Date: 2026-03-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f3e8a9b0c2'
down_revision: Union[str, None] = 'c4e2f7a8b9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        # Bankroll
        sa.Column('initial_bankroll', sa.Float(), server_default='1000.0', nullable=False),
        sa.Column('default_stake', sa.Float(), server_default='30.0', nullable=False),
        sa.Column('stake_as_percentage', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('stake_percentage', sa.Float(), server_default='2.0', nullable=False),
        sa.Column('daily_stop_loss', sa.Float(), server_default='10.0', nullable=False),
        sa.Column('stop_loss_unit', sa.String(5), server_default='pct', nullable=False),
        sa.Column('low_bankroll_alert', sa.Float(), server_default='200.0', nullable=False),
        # Notifications — 8 events × 2 channels
        sa.Column('notif_push_new_ticket', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_email_new_ticket', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('notif_push_odds_changed', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_email_odds_changed', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('notif_push_ticket_expired', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_email_ticket_expired', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('notif_push_stop_loss', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_email_stop_loss', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_push_smart_stop', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_email_smart_stop', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_push_daily_summary', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('notif_email_daily_summary', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_push_campaign_ending', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_email_campaign_ending', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_push_low_bankroll', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('notif_email_low_bankroll', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('notification_email', sa.String(255), server_default='', nullable=False),
        # Share
        sa.Column('share_pseudo', sa.String(50), server_default='', nullable=False),
        sa.Column('share_show_stake', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('share_show_gain_euros', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('share_show_bookmaker', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('share_show_clv', sa.Boolean(), server_default='1', nullable=False),
        # Display
        sa.Column('theme', sa.String(10), server_default='light', nullable=False),
        sa.Column('language', sa.String(5), server_default='fr', nullable=False),
        sa.Column('currency', sa.String(5), server_default='EUR', nullable=False),
        sa.Column('odds_format', sa.String(15), server_default='decimal', nullable=False),
        sa.Column('default_tickets_view', sa.String(15), server_default='kanban', nullable=False),
        sa.Column('default_campaigns_view', sa.String(15), server_default='grid', nullable=False),
        # Timestamps
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_user_preferences_user_id', 'user_preferences', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_user_preferences_user_id', table_name='user_preferences')
    op.drop_table('user_preferences')
