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


def _make_fake_user() -> User:
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.total_focus_time = 0
    user.streak = 0
    user.longest_streak = 0
    return user


class _FakeDb:
    """DB mock: add/flush 를 추적해 created_at 을 자동 주입한다."""

    def __init__(self) -> None:
        self._pending: list = []

    def add(self, obj: object) -> None:
        self._pending.append(obj)

    async def flush(self) -> None:
        for obj in self._pending:
            if hasattr(obj, "created_at") and obj.created_at is None:
                obj.created_at = datetime.now(tz=UTC).replace(tzinfo=None)
        self._pending.clear()


@pytest.fixture
async def session_client():
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


class TestCreateSessionAspectRatio:
    """POST /api/v1/sessions — aspect_ratio 검증

    요구사항:
    =========
    1. 목적: 모바일 UI 비율(4:5) 과 백엔드 허용 비율 일치 확인 (D-PLAN-2)
    2. 4:5 는 허용 → 201 Created
    3. 4:3 은 제거됨 → 422 + detail 메시지 포함
    """

    @pytest.mark.asyncio
    async def test_should_accept_4_5_aspect_ratio(self, session_client: AsyncClient) -> None:
        """4:5 비율 세션 생성 성공

        Given: aspect_ratio = "4:5"
        When: POST /api/v1/sessions
        Then: 201 반환
        """
        payload = {
            "start_time": "2026-05-04T10:00:00",
            "output_seconds": 15,
            "aspect_ratio": "4:5",
            "overlay_style": "stopwatch",
        }

        response = await session_client.post("/api/sessions", json=payload)

        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_should_reject_4_3_aspect_ratio(self, session_client: AsyncClient) -> None:
        """4:3 비율 세션 생성 거부 (제거된 비율)

        Given: aspect_ratio = "4:3"
        When: POST /api/sessions
        Then: 422 반환 + detail 메시지에 "4:5" 포함
        """
        payload = {
            "start_time": "2026-05-04T10:00:00",
            "output_seconds": 15,
            "aspect_ratio": "4:3",
            "overlay_style": "stopwatch",
        }

        response = await session_client.post("/api/sessions", json=payload)

        assert response.status_code == 422
        detail = response.json().get("detail", "")
        assert "4:5" in detail
