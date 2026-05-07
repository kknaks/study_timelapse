"""Phase 1a — 구독 모델 확장 (User 컬럼 + subscription_events)

Revision ID: d1e2f3a4b5c6
Revises: c3d4e5f6a7b8
Create Date: 2026-05-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 0. 기존 subscription_status 비정상 값 정리 (Check Constraint 추가 전 안전 처리)
    op.execute(
        "UPDATE users SET subscription_status = 'free' "
        "WHERE subscription_status IS NULL "
        "OR subscription_status NOT IN ('free','trial','pro','expired','cancelled')"
    )

    # 1. User 컬럼 추가
    op.add_column(
        "users",
        sa.Column("timezone", sa.String(50), nullable=False, server_default="UTC"),
    )
    op.add_column("users", sa.Column("terms_agreed_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("privacy_agreed_at", sa.DateTime(), nullable=True))

    # 2. subscription_status Check Constraint (naming convention → ck_users_subscription_status)
    op.create_check_constraint(
        "subscription_status",
        "users",
        "subscription_status IN ('free','trial','pro','expired','cancelled')",
    )

    # 3. subscription_events 테이블 신규
    op.create_table(
        "subscription_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True, server_default="USD"),
        sa.Column(
            "occurred_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("raw_payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # naming convention → ck_subscription_events_{name}
        sa.CheckConstraint(
            "event_type IN ('trial_started','trial_expired','purchased',"
            "'renewed','expired','cancelled','refunded')",
            name="event_type",
        ),
        sa.CheckConstraint(
            "source IN ('mock','revenuecat','admin','system')",
            name="source",
        ),
        sa.CheckConstraint(
            "plan IN ('monthly')",
            name="plan",
        ),
    )

    # 4. 인덱스
    op.create_index(
        "idx_sub_events_user_time",
        "subscription_events",
        ["user_id", "occurred_at"],
        postgresql_ops={"occurred_at": "DESC"},
    )
    op.create_index(
        "idx_sub_events_type_time",
        "subscription_events",
        ["event_type", "occurred_at"],
    )
    op.create_index("idx_sub_events_source", "subscription_events", ["source"])


def downgrade() -> None:
    op.drop_index("idx_sub_events_source")
    op.drop_index("idx_sub_events_type_time")
    op.drop_index("idx_sub_events_user_time")
    op.drop_table("subscription_events")
    op.drop_constraint("subscription_status", "users", type_="check")
    op.drop_column("users", "privacy_agreed_at")
    op.drop_column("users", "terms_agreed_at")
    op.drop_column("users", "timezone")
