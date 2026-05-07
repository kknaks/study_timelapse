"""GET /api/v1/users/me — pro 필드 포함 여부 테스트
PUT /api/v1/users/me/terms-agree — 약관 동의 endpoint 테스트

요구사항:
=========
1. 목적: is_pro, pro_until 필드가 /me 응답에 포함되는지 확인 (T-016)
2. 기본값 is_pro=false, pro_until=null 반환
3. PUT /me/terms-agree — 약관 동의 시각 설정 (T-015)
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

    async def refresh(self, obj) -> None:
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


@pytest.fixture
async def terms_client():
    """PUT /me/terms-agree 테스트용 client + fake_user."""
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
        yield c, fake_user

    app.dependency_overrides.clear()


@pytest.fixture
async def unauthed_client():
    """Authorization 헤더 없는 client — 401 확인 전용."""
    fake_db = _FakeDb()

    async def override_db():
        yield fake_db

    app.dependency_overrides[get_db] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


class TestTermsAgreeEndpoint:
    """PUT /me/terms-agree 시나리오 테스트.

    요구사항:
    =========
    1. 둘 다 true → 200, terms_agreed_at / privacy_agreed_at 비null
    2. terms_agreed=false → 400 INVALID_AGREEMENT
    3. privacy_agreed=false → 400 INVALID_AGREEMENT
    4. 인증 없음 → 401
    5. 이미 동의한 사용자 재호출 → 200 (멱등, 시각 갱신)
    """

    @pytest.mark.asyncio
    async def test_both_true_sets_timestamps(self, terms_client) -> None:
        """둘 다 true → 200, timestamps 비null.

        Given: 약관 미동의 유저
        When: PUT /me/terms-agree { terms_agreed: true, privacy_agreed: true }
        Then: 200, data.terms_agreed_at != null, data.privacy_agreed_at != null
        """
        client, _ = terms_client
        resp = await client.put(
            "/api/users/me/terms-agree",
            json={"terms_agreed": True, "privacy_agreed": True},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["terms_agreed_at"] is not None
        assert data["privacy_agreed_at"] is not None

    @pytest.mark.asyncio
    async def test_terms_false_returns_400(self, terms_client) -> None:
        """terms_agreed=false → 400 INVALID_AGREEMENT.

        Given: 유저
        When: PUT /me/terms-agree { terms_agreed: false, privacy_agreed: true }
        Then: 400, error_code == INVALID_AGREEMENT
        """
        client, _ = terms_client
        resp = await client.put(
            "/api/users/me/terms-agree",
            json={"terms_agreed": False, "privacy_agreed": True},
        )
        assert resp.status_code == 400
        assert resp.json()["error_code"] == "INVALID_AGREEMENT"

    @pytest.mark.asyncio
    async def test_privacy_false_returns_400(self, terms_client) -> None:
        """privacy_agreed=false → 400 INVALID_AGREEMENT.

        Given: 유저
        When: PUT /me/terms-agree { terms_agreed: true, privacy_agreed: false }
        Then: 400, error_code == INVALID_AGREEMENT
        """
        client, _ = terms_client
        resp = await client.put(
            "/api/users/me/terms-agree",
            json={"terms_agreed": True, "privacy_agreed": False},
        )
        assert resp.status_code == 400
        assert resp.json()["error_code"] == "INVALID_AGREEMENT"

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, unauthed_client) -> None:
        """인증 없음 → 401.

        Given: Authorization 헤더 없음
        When: PUT /me/terms-agree
        Then: 401
        """
        resp = await unauthed_client.put(
            "/api/users/me/terms-agree",
            json={"terms_agreed": True, "privacy_agreed": True},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_already_agreed_returns_200_and_updates(self, terms_client) -> None:
        """이미 동의한 사용자 재호출 → 200 (멱등, 시각 재설정).

        Given: 이미 terms_agreed_at이 set된 유저
        When: PUT /me/terms-agree { terms_agreed: true, privacy_agreed: true }
        Then: 200, data.terms_agreed_at != null
        """
        client, _ = terms_client
        # 첫 번째 동의
        r1 = await client.put(
            "/api/users/me/terms-agree",
            json={"terms_agreed": True, "privacy_agreed": True},
        )
        assert r1.status_code == 200
        # 재호출
        r2 = await client.put(
            "/api/users/me/terms-agree",
            json={"terms_agreed": True, "privacy_agreed": True},
        )
        assert r2.status_code == 200
        assert r2.json()["data"]["terms_agreed_at"] is not None


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
