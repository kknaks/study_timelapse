"""add users sessions daily_focus tables

Revision ID: fbf04bb24f1d
Revises:
Create Date: 2025-03-01 01:38:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "fbf04bb24f1d"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users 테이블
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("provider_id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("longest_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_focus_time", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("subscription_status", sa.String(), nullable=False, server_default="free"),
        sa.Column("trial_start_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("provider_id", name=op.f("uq_users_provider_id")),
    )

    # sessions 테이블
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("output_seconds", sa.Integer(), nullable=False),
        sa.Column("aspect_ratio", sa.String(), nullable=False, server_default="9:16"),
        sa.Column("overlay_style", sa.String(), nullable=False, server_default="stopwatch"),
        sa.Column("status", sa.String(), nullable=False, server_default="recording"),
        sa.Column("file_id", sa.String(), nullable=True),
        sa.Column("task_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_sessions_user_id_users"),
        ),
    )

    # daily_focus 테이블
    op.create_table(
        "daily_focus",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("total_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("session_count", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_focus")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_daily_focus_user_id_users"),
        ),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_focus_user_date"),
    )


def downgrade() -> None:
    op.drop_table("daily_focus")
    op.drop_table("sessions")
    op.drop_table("users")
