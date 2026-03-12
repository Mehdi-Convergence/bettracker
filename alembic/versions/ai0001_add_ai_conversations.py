"""Add AI conversations tables

Revision ID: ai0001a1b2c3
Revises: odds0001
Create Date: 2026-03-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ai0001a1b2c3"
down_revision: Union[str, None] = "odds0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_ai_conv_user_id",
        "ai_conversations",
        ["user_id"],
    )
    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_ai_msg_conversation_id",
        "ai_messages",
        ["conversation_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_ai_msg_conversation_id", "ai_messages")
    op.drop_table("ai_messages")
    op.drop_index("idx_ai_conv_user_id", "ai_conversations")
    op.drop_table("ai_conversations")
