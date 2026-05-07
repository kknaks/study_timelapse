"""GET /api/v1/users/me — pro 필드 포함 여부 테스트

요구사항:
=========
1. 목적: is_pro, pro_until 필드가 /me 응답에 포함되는지 확인 (T-016)
2. 기본값 is_pro=false, pro_until=null 반환
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.dependencies import get_current_user
from app.main import app
from app.models.user import User


def _make_fake_user(*, is_pro: bool = False, pro_until=None) -> User:
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.provider = "google"
    user.email = "test@example.com"
    user.name = "Test User"
    user.streak = 0
    user.longest_streak = 0
    user.total_focus_time = 0
    user.subscription_status = "free"
    user.trial_start_date = None
    user.is_pro = is_pro
    user.pro_until = pro_until
    user.timezone = "UTC"
    user.terms_agreed_at = None
    user.privacy_agreed_at = None
    user.created_at = datetime.now(tz=UTC).replace(tzinfo=None)
    user.updated_at = datetime.now(tz=UTC).replace(tzinfo=None)
    return user


class _FakeDb:
    async def flush(self) -> None:
        pass

    async def execute(self, stmt) -> MagicMock:
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        return result


@pytest.fixture
async def me_client():
    fake_user = _make_fake_user()
    fake_db = _FakeDb()

    async def override_user():
        return fake_user

    async def override_db():
        yield fake_db

    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_db] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


class TestGetMeProFields:
    """/me 응답에 pro 필드 포함 확인

    요구사항:
    =========
    1. 목적: T-016 — is_pro, pro_until 기본값 포함 여부
    2. is_pro 기본값 false
    3. pro_until 기본값 null
    """

    @pytest.mark.asyncio
    async def test_me_includes_is_pro_false_by_default(self, me_client: AsyncClient) -> None:
        """is_pro 기본값 false 반환

        Given: 일반 유저 (is_pro=False)
        When: GET /api/v1/users/me
        Then: 응답 data.is_pro == false
        """
        response = await me_client.get("/api/users/me")

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["is_pro"] is False

    @pytest.mark.asyncio
    async def test_me_includes_pro_until_null_by_default(self, me_client: AsyncClient) -> None:
        """pro_until 기본값 null 반환

        Given: 일반 유저 (pro_until=None)
        When: GET /api/v1/users/me
        Then: 응답 data.pro_until == null
        """
        response = await me_client.get("/api/users/me")

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["pro_until"] is None
