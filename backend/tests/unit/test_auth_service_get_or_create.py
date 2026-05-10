"""PLAN-004-T-009 — get_or_create_user Phase 2 단위 테스트.

Phase 2 신규 가입: subscription_status='free', trial_start_date=None, is_pro=False.
trial_started event INSERT 없음.
Phase 1 기존 사용자 (trial_start_date 박힘) 분기 보존 — apply_lazy_expiry 정상 동작.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.user import User
from app.services.auth_service import get_or_create_user


def _make_db_new_user() -> AsyncMock:
    """신규 사용자 조회 시 None 반환하는 DB mock."""
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute.return_value = result_mock
    return db


def _make_db_existing_user(user: MagicMock) -> AsyncMock:
    """기존 사용자 조회 시 user 반환하는 DB mock."""
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute.return_value = result_mock
    return db


class TestGetOrCreateUserPhase2:
    """Phase 2 — 신규 가입자는 free 상태로 시작."""

    @pytest.mark.asyncio
    async def test_new_user_subscription_status_is_free(self) -> None:
        """신규 가입 → subscription_status='free'.

        Given: provider_id가 DB에 없는 신규 사용자
        When: get_or_create_user 호출
        Then: user.subscription_status == 'free'
        """
        db = _make_db_new_user()

        user, is_new = await get_or_create_user(
            db,
            provider="google",
            provider_id="gid_new_001",
            email="new@example.com",
            name="New User",
        )

        assert is_new is True
        assert user.subscription_status == "free"

    @pytest.mark.asyncio
    async def test_new_user_trial_start_date_is_none(self) -> None:
        """신규 가입 → trial_start_date IS NULL.

        Given: 신규 사용자
        When: get_or_create_user 호출
        Then: user.trial_start_date is None
        """
        db = _make_db_new_user()

        user, is_new = await get_or_create_user(
            db,
            provider="google",
            provider_id="gid_new_002",
            email="new2@example.com",
        )

        assert is_new is True
        assert user.trial_start_date is None

    @pytest.mark.asyncio
    async def test_new_user_is_pro_false(self) -> None:
        """신규 가입 → is_pro=False.

        Given: 신규 사용자
        When: get_or_create_user 호출
        Then: user.is_pro is False
        """
        db = _make_db_new_user()

        user, is_new = await get_or_create_user(
            db,
            provider="apple",
            provider_id="aid_new_001",
        )

        assert is_new is True
        assert user.is_pro is False

    @pytest.mark.asyncio
    async def test_new_user_no_trial_started_event(self) -> None:
        """신규 가입 → subscription_events에 trial_started row INSERT 없음.

        Given: 신규 사용자
        When: get_or_create_user 호출
        Then: SubscriptionEventRepository.create 미호출
        """
        db = _make_db_new_user()

        with patch("app.services.auth_service.SubscriptionEventRepository") as mock_repo_cls:
            await get_or_create_user(
                db,
                provider="google",
                provider_id="gid_new_003",
                email="new3@example.com",
            )
            # get_or_create_user 내부에서 SubscriptionEventRepository 미사용
            mock_repo_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_existing_user_returns_is_new_false(self) -> None:
        """기존 사용자 조회 → is_new=False, 객체 그대로 반환.

        Given: provider_id가 이미 DB에 존재하는 사용자
        When: get_or_create_user 호출
        Then: (same_user, False) 반환
        """
        existing = MagicMock(spec=User)
        existing.id = uuid.uuid4()
        existing.email = "existing@example.com"
        existing.name = "Existing"

        db = _make_db_existing_user(existing)

        user, is_new = await get_or_create_user(
            db,
            provider="google",
            provider_id="gid_existing",
            email="existing@example.com",
        )

        assert is_new is False
        assert user is existing


class TestPhase1ExistingUserRegression:
    """Phase 1 기존 사용자 (trial_start_date 박힘) 회귀 확인.

    신규 코드 변경 후에도 trial_start_date가 있는 기존 사용자에
    apply_lazy_expiry 가 정상 동작해야 한다.
    """

    @pytest.mark.asyncio
    async def test_apply_lazy_expiry_phase1_expired_trial(self) -> None:
        """Phase 1 trial 만료 사용자 → expired 전이.

        Given: trial_start_date 8일 전, subscription_status='trial'
        When: apply_lazy_expiry 호출
        Then: subscription_status='expired', event trial_expired INSERT
        """
        from app.services.subscription import apply_lazy_expiry

        user = MagicMock(spec=User)
        user.id = uuid.uuid4()
        user.subscription_status = "trial"
        user.trial_start_date = date.today() - timedelta(days=8)
        user.is_pro = True
        user.pro_until = None

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        expired = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert expired is True
        assert user.subscription_status == "expired"
        assert user.is_pro is False
        mock_repo.create.assert_called_once_with(
            user_id=user.id,
            event_type="trial_expired",
            source="system",
            plan="monthly",
        )

    @pytest.mark.asyncio
    async def test_apply_lazy_expiry_phase2_free_user_skips(self) -> None:
        """Phase 2 신규 가입 free 사용자 → lazy expiry 스킵.

        Given: subscription_status='free', trial_start_date=None
        When: apply_lazy_expiry 호출
        Then: 상태 변경 없음, event INSERT 없음
        """
        from app.services.subscription import apply_lazy_expiry

        user = MagicMock(spec=User)
        user.id = uuid.uuid4()
        user.subscription_status = "free"
        user.trial_start_date = None
        user.is_pro = False
        user.pro_until = None

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        expired = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert expired is False
        mock_db.flush.assert_not_called()
        mock_repo.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_apply_lazy_expiry_trial_null_start_date_skips(self) -> None:
        """trial status + trial_start_date IS NULL → expiry 체크 스킵.

        NULL 분기: 가입 flow 외부에서 trial로 설정됐지만 start_date 없는 edge case.
        """
        from app.services.subscription import apply_lazy_expiry

        user = MagicMock(spec=User)
        user.id = uuid.uuid4()
        user.subscription_status = "trial"
        user.trial_start_date = None
        user.is_pro = True
        user.pro_until = None

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        expired = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert expired is False
        mock_repo.create.assert_not_called()


class TestFreeUserDailyQuota:
    """Phase 2 신규 가입자 free 한도 동작 확인."""

    def test_free_user_quota_is_one(self) -> None:
        """free 사용자 일일 한도 = 1.

        Given: subscription_status='free'
        Then: compute_daily_quota == 1
        """
        from app.services.subscription import compute_daily_quota

        user = MagicMock(spec=User)
        user.subscription_status = "free"
        user.pro_until = None

        assert compute_daily_quota(user) == 1

    def test_free_user_banner_alert_is_none(self) -> None:
        """free 사용자 배너 알림 없음.

        Given: subscription_status='free', trial_start_date=None
        Then: compute_banner_alert returns None
        """
        from app.services.subscription import compute_banner_alert

        user = MagicMock(spec=User)
        user.subscription_status = "free"
        user.trial_start_date = None
        user.pro_until = None

        assert compute_banner_alert(user) is None
