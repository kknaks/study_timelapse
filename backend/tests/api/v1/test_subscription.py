"""구독 API 엔드포인트 테스트 — Phase 1 회귀 + Phase 2 verify/sync/webhook."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.dependencies import get_current_user
from app.main import app
from app.models.user import User


def _make_fake_user(
    *,
    subscription_status: str = "free",
    is_pro: bool = False,
    pro_until=None,
    grace_until=None,
    terms_agreed_at=None,
    privacy_agreed_at=None,
) -> User:
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.provider = "google"
    user.email = "test@example.com"
    user.name = "Test User"
    user.streak = 0
    user.longest_streak = 0
    user.total_focus_time = 0
    user.subscription_status = subscription_status
    user.trial_start_date = None
    user.is_pro = is_pro
    user.pro_until = pro_until
    user.grace_until = grace_until
    user.timezone = "UTC"
    user.terms_agreed_at = terms_agreed_at
    user.privacy_agreed_at = privacy_agreed_at
    user.created_at = datetime.now(tz=UTC).replace(tzinfo=None)
    user.updated_at = datetime.now(tz=UTC).replace(tzinfo=None)
    return user


class _FakeDb:
    async def flush(self) -> None:
        pass

    async def refresh(self, obj) -> None:
        pass

    async def execute(self, stmt) -> MagicMock:
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        return result


def _make_sub_client(fake_user, fake_db=None):
    if fake_db is None:
        fake_db = _FakeDb()

    async def override_user():
        return fake_user

    async def override_db():
        yield fake_db

    return override_user, override_db


# --- Phase 1 회귀 테스트 ---


class TestMockPurchaseRegression:
    @pytest.mark.asyncio
    async def test_mock_purchase_requires_auth(self) -> None:
        """인증 없음 → 401."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post(
                "/api/subscription/mock-purchase", json={"plan": "monthly"}
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_mock_purchase_invalid_plan_returns_400(self) -> None:
        """잘못된 plan → 400 INVALID_PLAN."""
        fake_user = _make_fake_user(
            subscription_status="trial",
            terms_agreed_at=datetime.utcnow(),
            privacy_agreed_at=datetime.utcnow(),
        )
        fake_db = _FakeDb()
        override_user, override_db = _make_sub_client(fake_user, fake_db)

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db] = override_db
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                resp = await c.post(
                    "/api/subscription/mock-purchase", json={"plan": "yearly"}
                )
            assert resp.status_code == 400
            assert resp.json()["error_code"] == "INVALID_PLAN"
        finally:
            app.dependency_overrides.clear()


# --- GET /users/me grace_until 포함 확인 ---


class TestGetMeGraceUntil:
    @pytest.mark.asyncio
    async def test_grace_until_null_by_default(self) -> None:
        """grace_until 기본값 null 반환."""
        fake_user = _make_fake_user(grace_until=None)
        fake_db = _FakeDb()
        override_user, override_db = _make_sub_client(fake_user, fake_db)

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db] = override_db
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                resp = await c.get("/api/users/me")
            assert resp.status_code == 200
            assert resp.json()["data"]["grace_until"] is None
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_grace_until_included_when_set(self) -> None:
        """grace_until 값이 있으면 응답에 포함."""
        grace = datetime.utcnow() + timedelta(days=16)
        fake_user = _make_fake_user(grace_until=grace)
        fake_db = _FakeDb()
        override_user, override_db = _make_sub_client(fake_user, fake_db)

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db] = override_db
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                resp = await c.get("/api/users/me")
            assert resp.status_code == 200
            assert resp.json()["data"]["grace_until"] is not None
        finally:
            app.dependency_overrides.clear()


# --- verify endpoint ---


class TestVerifyEndpoint:
    @pytest.mark.asyncio
    async def test_verify_requires_auth(self) -> None:
        """인증 없음 → 401."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post(
                "/api/subscription/verify",
                json={
                    "app_user_id": "some-id",
                    "transaction_id": "txn-1",
                    "product_identifier": "monthly",
                },
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_verify_env_not_set_returns_503(self) -> None:
        """REVENUECAT_API_KEY 미설정 → 503 REVENUECAT_NOT_CONFIGURED."""
        fake_user = _make_fake_user()
        fake_db = _FakeDb()
        override_user, override_db = _make_sub_client(fake_user, fake_db)

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db] = override_db
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                resp = await c.post(
                    "/api/subscription/verify",
                    json={
                        "app_user_id": str(fake_user.id),
                        "transaction_id": "txn-1",
                        "product_identifier": "monthly",
                    },
                )
            assert resp.status_code == 503
            assert resp.json()["error_code"] == "REVENUECAT_NOT_CONFIGURED"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_verify_user_mismatch_returns_403(self) -> None:
        """JWT user_id ≠ app_user_id → 403 USER_MISMATCH."""
        fake_user = _make_fake_user()
        fake_db = _FakeDb()
        override_user, override_db = _make_sub_client(fake_user, fake_db)

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db] = override_db
        try:
            with patch(
                "app.services.subscription_handler.settings",
                new=MagicMock(revenuecat_api_key="test-key"),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as c:
                    resp = await c.post(
                        "/api/subscription/verify",
                        json={
                            "app_user_id": "wrong-user-id",
                            "transaction_id": "txn-1",
                            "product_identifier": "monthly",
                        },
                    )
            assert resp.status_code == 403
            assert resp.json()["error_code"] == "USER_MISMATCH"
        finally:
            app.dependency_overrides.clear()


# --- sync endpoint ---


class TestSyncEndpoint:
    def setup_method(self):
        from app.services.subscription_handler import _sync_cooldown

        _sync_cooldown.clear()

    @pytest.mark.asyncio
    async def test_sync_requires_auth(self) -> None:
        """인증 없음 → 401."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post("/api/subscription/sync")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_sync_env_not_set_returns_503(self) -> None:
        """REVENUECAT_API_KEY 미설정 → 503."""
        fake_user = _make_fake_user()
        fake_db = _FakeDb()
        override_user, override_db = _make_sub_client(fake_user, fake_db)

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db] = override_db
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                resp = await c.post("/api/subscription/sync")
            assert resp.status_code == 503
            assert resp.json()["error_code"] == "REVENUECAT_NOT_CONFIGURED"
        finally:
            app.dependency_overrides.clear()


# --- webhook endpoint (ENV 미설정 시 404) ---


class TestWebhookEndpointNoEnv:
    @pytest.mark.asyncio
    async def test_webhook_returns_404_when_env_not_set(self) -> None:
        """REVENUECAT_WEBHOOK_AUTH_TOKEN 미설정 시 webhook 라우터 미등록 → 404."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post(
                "/api/subscription/webhook",
                json={
                    "event": {
                        "type": "INITIAL_PURCHASE",
                        "app_user_id": "user-id",
                        "id": "event-id",
                    }
                },
            )
        assert resp.status_code == 404
