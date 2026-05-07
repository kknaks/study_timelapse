"""T-007 — 구독 모델 정의 단위 테스트 (DB 불필요)."""

from __future__ import annotations

import uuid

from app.models.subscription_event import SubscriptionEvent
from app.models.user import User


class TestUserModelSubscriptionColumns:
    """User 모델 신규 컬럼 + Check Constraint 존재 확인."""

    def test_has_timezone_column(self) -> None:
        cols = {c.name: c for c in User.__table__.columns}
        assert "timezone" in cols
        assert cols["timezone"].nullable is False

    def test_has_terms_agreed_at_column(self) -> None:
        cols = {c.name: c for c in User.__table__.columns}
        assert "terms_agreed_at" in cols
        assert cols["terms_agreed_at"].nullable is True

    def test_has_privacy_agreed_at_column(self) -> None:
        cols = {c.name: c for c in User.__table__.columns}
        assert "privacy_agreed_at" in cols
        assert cols["privacy_agreed_at"].nullable is True

    def test_subscription_status_check_constraint_registered(self) -> None:
        # convention: ck_%(table_name)s_%(constraint_name)s → ck_users_subscription_status
        names = {c.name for c in User.__table__.constraints}
        assert "ck_users_subscription_status" in names, f"Actual: {names}"

    def test_existing_columns_preserved(self) -> None:
        cols = {c.name for c in User.__table__.columns}
        for col in ("is_pro", "pro_until", "trial_start_date", "subscription_status"):
            assert col in cols


class TestSubscriptionEventModel:
    """SubscriptionEvent 모델 정의 확인."""

    def test_tablename(self) -> None:
        assert SubscriptionEvent.__tablename__ == "subscription_events"

    def test_required_columns_exist(self) -> None:
        cols = {c.name for c in SubscriptionEvent.__table__.columns}
        required = {
            "id",
            "user_id",
            "event_type",
            "source",
            "plan",
            "amount_cents",
            "currency",
            "occurred_at",
            "raw_payload",
            "created_at",
        }
        assert required.issubset(cols)

    def test_check_constraints_registered(self) -> None:
        # convention: ck_%(table_name)s_%(constraint_name)s
        names = {c.name for c in SubscriptionEvent.__table__.constraints}
        assert "ck_subscription_events_event_type" in names, f"Actual: {names}"
        assert "ck_subscription_events_source" in names
        assert "ck_subscription_events_plan" in names

    def test_amount_cents_nullable(self) -> None:
        cols = {c.name: c for c in SubscriptionEvent.__table__.columns}
        assert cols["amount_cents"].nullable is True

    def test_model_instantiation(self) -> None:
        """모델 round-trip: 객체 생성 + 필드 읽기."""
        event = SubscriptionEvent(
            user_id=uuid.uuid4(),
            event_type="trial_started",
            source="system",
            plan="monthly",
        )
        assert event.event_type == "trial_started"
        assert event.source == "system"
        assert event.plan == "monthly"
        assert event.amount_cents is None
