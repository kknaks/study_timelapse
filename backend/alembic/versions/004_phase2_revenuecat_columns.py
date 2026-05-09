"""Phase 2 — RevenueCat 연동: grace_until / event_id / transaction_id 컬럼 추가

Revision ID: e4f5a6b7c8d9
Revises: d1e2f3a4b5c6
Create Date: 2026-05-09
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. users.grace_until 추가 (adr-19 B — BILLING_ISSUE grace period)
    op.add_column("users", sa.Column("grace_until", sa.DateTime(), nullable=True))

    # 2. subscription_events 에 event_id / transaction_id 추가 (idempotency)
    op.add_column(
        "subscription_events",
        sa.Column("event_id", sa.String(100), nullable=True),
    )
    op.add_column(
        "subscription_events",
        sa.Column("transaction_id", sa.String(100), nullable=True),
    )

    # 3. Partial unique index — NULL 행 제외 (NULL 은 UNIQUE 대상에서 제외)
    op.create_index(
        "idx_sub_events_event_id",
        "subscription_events",
        ["event_id"],
        unique=True,
        postgresql_where=sa.text("event_id IS NOT NULL"),
    )
    op.create_index(
        "idx_sub_events_transaction_id",
        "subscription_events",
        ["transaction_id"],
        unique=True,
        postgresql_where=sa.text("transaction_id IS NOT NULL"),
    )

    # 4. event_type 체크 제약 업데이트 (cancel_scheduled / billing_issue / sync 추가)
    # naming_convention: "ck" → "ck_%(table_name)s_%(constraint_name)s"
    # op.drop_constraint 에 전달하는 이름은 constraint_name 부분만 — 나머지는 convention 이 붙임
    op.drop_constraint("event_type", "subscription_events", type_="check")
    op.create_check_constraint(
        "event_type",
        "subscription_events",
        "event_type IN ("
        "'trial_started','trial_expired','purchased','renewed',"
        "'expired','cancelled','refunded',"
        "'cancel_scheduled','billing_issue','sync'"
        ")",
    )


def downgrade() -> None:
    op.drop_constraint("event_type", "subscription_events", type_="check")
    op.create_check_constraint(
        "event_type",
        "subscription_events",
        "event_type IN ("
        "'trial_started','trial_expired','purchased','renewed',"
        "'expired','cancelled','refunded'"
        ")",
    )
    op.drop_index("idx_sub_events_transaction_id", table_name="subscription_events")
    op.drop_index("idx_sub_events_event_id", table_name="subscription_events")
    op.drop_column("subscription_events", "transaction_id")
    op.drop_column("subscription_events", "event_id")
    op.drop_column("users", "grace_until")
