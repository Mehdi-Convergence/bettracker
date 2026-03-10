"""cleanup notification preferences — remove 12 old columns, rename 5, drop notification_email

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-10 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite doesn't support DROP COLUMN before 3.35 or RENAME COLUMN well.
    # Use batch mode to recreate the table.
    with op.batch_alter_table("user_preferences") as batch_op:
        # Drop removed events (push + email)
        batch_op.drop_column("notif_push_odds_changed")
        batch_op.drop_column("notif_email_odds_changed")
        batch_op.drop_column("notif_push_ticket_expired")
        batch_op.drop_column("notif_email_ticket_expired")
        batch_op.drop_column("notif_push_daily_summary")
        batch_op.drop_column("notif_email_daily_summary")
        # Drop email channels for kept events
        batch_op.drop_column("notif_email_new_ticket")
        batch_op.drop_column("notif_email_stop_loss")
        batch_op.drop_column("notif_email_smart_stop")
        batch_op.drop_column("notif_email_campaign_ending")
        batch_op.drop_column("notif_email_low_bankroll")
        # Drop notification_email
        batch_op.drop_column("notification_email")

    # Rename notif_push_* → notif_* for the 5 kept events
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.alter_column("notif_push_new_ticket", new_column_name="notif_new_ticket")
        batch_op.alter_column("notif_push_stop_loss", new_column_name="notif_stop_loss")
        batch_op.alter_column("notif_push_smart_stop", new_column_name="notif_smart_stop")
        batch_op.alter_column("notif_push_campaign_ending", new_column_name="notif_campaign_ending")
        batch_op.alter_column("notif_push_low_bankroll", new_column_name="notif_low_bankroll")


def downgrade() -> None:
    # Reverse: rename back and re-add dropped columns
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.alter_column("notif_new_ticket", new_column_name="notif_push_new_ticket")
        batch_op.alter_column("notif_stop_loss", new_column_name="notif_push_stop_loss")
        batch_op.alter_column("notif_smart_stop", new_column_name="notif_push_smart_stop")
        batch_op.alter_column("notif_campaign_ending", new_column_name="notif_push_campaign_ending")
        batch_op.alter_column("notif_low_bankroll", new_column_name="notif_push_low_bankroll")

    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.add_column(sa.Column("notif_push_odds_changed", sa.Boolean(), server_default="1"))
        batch_op.add_column(sa.Column("notif_email_odds_changed", sa.Boolean(), server_default="0"))
        batch_op.add_column(sa.Column("notif_push_ticket_expired", sa.Boolean(), server_default="1"))
        batch_op.add_column(sa.Column("notif_email_ticket_expired", sa.Boolean(), server_default="0"))
        batch_op.add_column(sa.Column("notif_push_daily_summary", sa.Boolean(), server_default="0"))
        batch_op.add_column(sa.Column("notif_email_daily_summary", sa.Boolean(), server_default="1"))
        batch_op.add_column(sa.Column("notif_email_new_ticket", sa.Boolean(), server_default="0"))
        batch_op.add_column(sa.Column("notif_email_stop_loss", sa.Boolean(), server_default="1"))
        batch_op.add_column(sa.Column("notif_email_smart_stop", sa.Boolean(), server_default="1"))
        batch_op.add_column(sa.Column("notif_email_campaign_ending", sa.Boolean(), server_default="1"))
        batch_op.add_column(sa.Column("notif_email_low_bankroll", sa.Boolean(), server_default="0"))
        batch_op.add_column(sa.Column("notification_email", sa.String(255), server_default=""))
