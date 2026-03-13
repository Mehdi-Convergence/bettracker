"""add pmu_races and pmu_runners tables

Revision ID: h8i9j3k4l5m6
Revises: h8i9j2k3l4m5
Create Date: 2026-03-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h8i9j3k4l5m6"
down_revision: Union[str, None] = "h8i9j2k3l4m5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # --- Table pmu_races ---
    if "pmu_races" not in existing_tables:
        op.create_table(
            "pmu_races",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("race_id", sa.String(60), nullable=False, unique=True),
            sa.Column("race_date", sa.Date(), nullable=False),
            sa.Column("race_time", sa.String(10), nullable=True),
            sa.Column("hippodrome", sa.String(100), nullable=False),
            sa.Column("race_number", sa.Integer(), nullable=False),
            sa.Column("race_type", sa.String(30), nullable=False),
            sa.Column("distance", sa.Integer(), nullable=False),
            sa.Column("terrain", sa.String(30), nullable=True),
            sa.Column("prize_pool", sa.Float(), nullable=True),
            sa.Column("num_runners", sa.Integer(), nullable=True),
            sa.Column("is_quinteplus", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    existing_race_indexes = (
        {idx["name"] for idx in inspector.get_indexes("pmu_races")}
        if "pmu_races" in existing_tables
        else set()
    )
    if "idx_pmu_race_date" not in existing_race_indexes:
        op.create_index("idx_pmu_race_date", "pmu_races", ["race_date"])
    if "idx_pmu_hippodrome" not in existing_race_indexes:
        op.create_index("idx_pmu_hippodrome", "pmu_races", ["hippodrome"])
    if "idx_pmu_race_type" not in existing_race_indexes:
        op.create_index("idx_pmu_race_type", "pmu_races", ["race_type"])

    # --- Table pmu_runners ---
    if "pmu_runners" not in existing_tables:
        op.create_table(
            "pmu_runners",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "race_id",
                sa.Integer(),
                sa.ForeignKey("pmu_races.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("horse_name", sa.String(100), nullable=False),
            sa.Column("jockey_name", sa.String(100), nullable=True),
            sa.Column("trainer_name", sa.String(100), nullable=True),
            sa.Column("age", sa.Integer(), nullable=True),
            sa.Column("weight", sa.Float(), nullable=True),
            sa.Column("odds_final", sa.Float(), nullable=True),
            sa.Column("odds_morning", sa.Float(), nullable=True),
            sa.Column("finish_position", sa.Integer(), nullable=True),
            sa.Column("is_scratched", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("form_string", sa.String(30), nullable=True),
            sa.Column("last_5_positions", sa.String(50), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    existing_runner_indexes = (
        {idx["name"] for idx in inspector.get_indexes("pmu_runners")}
        if "pmu_runners" in existing_tables
        else set()
    )
    if "idx_pmu_runner_race" not in existing_runner_indexes:
        op.create_index("idx_pmu_runner_race", "pmu_runners", ["race_id"])
    if "idx_pmu_horse_name" not in existing_runner_indexes:
        op.create_index("idx_pmu_horse_name", "pmu_runners", ["horse_name"])


def downgrade() -> None:
    op.drop_index("idx_pmu_horse_name", "pmu_runners")
    op.drop_index("idx_pmu_runner_race", "pmu_runners")
    op.drop_table("pmu_runners")

    op.drop_index("idx_pmu_race_type", "pmu_races")
    op.drop_index("idx_pmu_hippodrome", "pmu_races")
    op.drop_index("idx_pmu_race_date", "pmu_races")
    op.drop_table("pmu_races")
