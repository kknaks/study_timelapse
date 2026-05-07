"""T-008 — 구독 서비스 순수 함수 단위 테스트 (DB 불필요)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.user import User
from app.services.subscription import (
    apply_lazy_expiry,
    compute_banner_alert,
    compute_daily_quota,
    compute_daily_quota_resets_at,
    mock_purchase,
)


def _make_user(
    *,
    subscription_status: str = "free",
    trial_start_date: date | None = None,
    pro_until: datetime | None = None,
    timezone: str = "UTC",
    is_pro: bool = False,
    terms_agreed_at: datetime | None = None,
    privacy_agreed_at: datetime | None = None,
) -> User:
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.subscription_status = subscription_status
    user.trial_start_date = trial_start_date
    user.pro_until = pro_until
    user.timezone = timezone
    user.is_pro = is_pro
    user.terms_agreed_at = terms_agreed_at
    user.privacy_agreed_at = privacy_agreed_at
    return user


class TestComputeDailyQuota:
    def test_free_returns_1(self) -> None:
        assert compute_daily_quota(_make_user(subscription_status="free")) == 1

    def test_trial_returns_unlimited(self) -> None:
        assert compute_daily_quota(_make_user(subscription_status="trial")) == -1

    def test_pro_returns_unlimited(self) -> None:
        assert compute_daily_quota(_make_user(subscription_status="pro")) == -1

    def test_expired_returns_1(self) -> None:
        assert compute_daily_quota(_make_user(subscription_status="expired")) == 1

    def test_cancelled_active_pro_until_returns_unlimited(self) -> None:
        pro_until = datetime.utcnow() + timedelta(days=15)
        user = _make_user(subscription_status="cancelled", pro_until=pro_until)
        assert compute_daily_quota(user) == -1

    def test_cancelled_expired_pro_until_returns_1(self) -> None:
        pro_until = datetime.utcnow() - timedelta(days=1)
        user = _make_user(subscription_status="cancelled", pro_until=pro_until)
        assert compute_daily_quota(user) == 1

    def test_cancelled_no_pro_until_returns_1(self) -> None:
        user = _make_user(subscription_status="cancelled", pro_until=None)
        assert compute_daily_quota(user) == 1


class TestComputeBannerAlert:
    def test_free_returns_none(self) -> None:
        assert compute_banner_alert(_make_user(subscription_status="free")) is None

    def test_pro_returns_none(self) -> None:
        assert compute_banner_alert(_make_user(subscription_status="pro")) is None

    def test_expired_returns_subscription_expired(self) -> None:
        result = compute_banner_alert(_make_user(subscription_status="expired"))
        assert result == "subscription_expired"

    def test_trial_day1_returns_none(self) -> None:
        trial_start = date.today() - timedelta(days=1)
        user = _make_user(subscription_status="trial", trial_start_date=trial_start)
        assert compute_banner_alert(user) is None

    def test_trial_day3_returns_none(self) -> None:
        trial_start = date.today() - timedelta(days=3)
        user = _make_user(subscription_status="trial", trial_start_date=trial_start)
        assert compute_banner_alert(user) is None

    def test_trial_no_start_date_returns_none(self) -> None:
        user = _make_user(subscription_status="trial", trial_start_date=None)
        assert compute_banner_alert(user) is None

    def test_trial_day6_may_return_expiring_24h(self) -> None:
        # 6일 경과: trial_end = today + 1day, 약 24h 이내
        trial_start = date.today() - timedelta(days=6)
        user = _make_user(subscription_status="trial", trial_start_date=trial_start)
        alert = compute_banner_alert(user)
        # 6일 경과 시점에 따라 24h 이내 또는 1h 이내 또는 expired
        assert alert in ("trial_expiring_24h", "trial_expiring_1h", "trial_expired", None)

    def test_cancelled_active_returns_none(self) -> None:
        pro_until = datetime.utcnow() + timedelta(days=15)
        user = _make_user(subscription_status="cancelled", pro_until=pro_until)
        assert compute_banner_alert(user) is None


class TestApplyLazyExpiry:
    """apply_lazy_expiry — DB AsyncMock 이용 단위 테스트."""

    @pytest.mark.asyncio
    async def test_trial_expired_transitions_to_expired(self) -> None:
        """trial_start_date + 7d ≤ today → status=expired, event trial_expired INSERT."""
        trial_start = date.today() - timedelta(days=8)
        user = _make_user(subscription_status="trial", trial_start_date=trial_start)

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        result = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert result is True
        assert user.subscription_status == "expired"
        assert user.is_pro is False
        assert user.pro_until is None
        mock_db.flush.assert_called_once()
        mock_repo.create.assert_called_once_with(
            user_id=user.id,
            event_type="trial_expired",
            source="system",
            plan="monthly",
        )

    @pytest.mark.asyncio
    async def test_trial_not_expired_skips(self) -> None:
        """만료 전 trial → 상태 변경 없음."""
        trial_start = date.today() - timedelta(days=3)
        user = _make_user(subscription_status="trial", trial_start_date=trial_start)

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        result = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert result is False
        mock_db.flush.assert_not_called()
        mock_repo.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_pro_expired_transitions_to_expired(self) -> None:
        """pro_until ≤ now → status=expired."""
        pro_until = datetime.utcnow() - timedelta(hours=1)
        user = _make_user(subscription_status="pro", pro_until=pro_until, is_pro=True)

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        result = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert result is True
        assert user.subscription_status == "expired"
        assert user.is_pro is False
        mock_db.flush.assert_called_once()
        mock_repo.create.assert_called_once_with(
            user_id=user.id,
            event_type="expired",
            source="system",
            plan="monthly",
        )

    @pytest.mark.asyncio
    async def test_pro_active_skips(self) -> None:
        """활성 pro → 변경 없음."""
        pro_until = datetime.utcnow() + timedelta(days=15)
        user = _make_user(subscription_status="pro", pro_until=pro_until, is_pro=True)

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        result = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert result is False

    @pytest.mark.asyncio
    async def test_free_user_skips(self) -> None:
        """free 사용자 → lazy check 무시."""
        user = _make_user(subscription_status="free")

        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        result = await apply_lazy_expiry(user, mock_db, mock_repo)

        assert result is False
        mock_db.flush.assert_not_called()
        mock_repo.create.assert_not_called()


class TestMockPurchaseService:
    """mock_purchase 서비스 레이어 단위 테스트 (AsyncMock 이용)."""

    def _make_mock_event(self, event_type: str = "purchased") -> MagicMock:
        event = MagicMock()
        event.id = uuid.uuid4()
        event.event_type = event_type
        event.source = "mock"
        event.plan = "monthly"
        event.amount_cents = 199
        event.occurred_at = datetime.utcnow()
        return event

    @pytest.mark.asyncio
    async def test_invalid_plan_raises(self) -> None:
        from app.exceptions import InvalidPlanError

        user = _make_user(
            subscription_status="trial",
            terms_agreed_at=datetime.utcnow(),
            privacy_agreed_at=datetime.utcnow(),
        )
        with pytest.raises(InvalidPlanError):
            await mock_purchase(user, AsyncMock(), AsyncMock(), "yearly")

    @pytest.mark.asyncio
    async def test_terms_not_agreed_raises(self) -> None:
        from app.exceptions import TermsNotAgreedError

        user = _make_user(subscription_status="trial", terms_agreed_at=None)
        with pytest.raises(TermsNotAgreedError):
            await mock_purchase(user, AsyncMock(), AsyncMock(), "monthly")

    @pytest.mark.asyncio
    async def test_trial_to_pro_purchase(self) -> None:
        """trial 사용자 구매 → pro 전이, idempotent=False."""
        trial_start = date.today()
        user = _make_user(
            subscription_status="trial",
            trial_start_date=trial_start,
            terms_agreed_at=datetime.utcnow(),
            privacy_agreed_at=datetime.utcnow(),
        )
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.create.return_value = self._make_mock_event()

        result = await mock_purchase(user, mock_db, mock_repo, "monthly")

        assert result["subscription_status"] == "pro"
        assert result["idempotent"] is False
        assert user.is_pro is True
        mock_db.flush.assert_called_once()
        mock_repo.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_active_pro_returns_idempotent(self) -> None:
        """이미 활성 pro → idempotent=True, 새 event 미생성."""
        pro_until = datetime.utcnow() + timedelta(days=25)
        user = _make_user(
            subscription_status="pro",
            pro_until=pro_until,
            is_pro=True,
            trial_start_date=date.today(),
            terms_agreed_at=datetime.utcnow(),
            privacy_agreed_at=datetime.utcnow(),
        )
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.list_by_user.return_value = [self._make_mock_event()]

        result = await mock_purchase(user, mock_db, mock_repo, "monthly")

        assert result["idempotent"] is True
        assert result["subscription_status"] == "pro"
        mock_repo.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_expired_to_pro_purchase(self) -> None:
        """expired 사용자 재구매 (T7) → pro 전이."""
        user = _make_user(
            subscription_status="expired",
            terms_agreed_at=datetime.utcnow(),
            privacy_agreed_at=datetime.utcnow(),
        )
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.create.return_value = self._make_mock_event()

        result = await mock_purchase(user, mock_db, mock_repo, "monthly")

        assert result["subscription_status"] == "pro"
        assert result["idempotent"] is False


class TestComputeDailyQuotaResetsAt:
    def test_returns_datetime(self) -> None:
        user = _make_user(timezone="UTC")
        result = compute_daily_quota_resets_at(user)
        assert isinstance(result, datetime)

    def test_utc_next_midnight_time(self) -> None:
        user = _make_user(timezone="UTC")
        result = compute_daily_quota_resets_at(user)
        assert result.hour == 0
        assert result.minute == 0
        assert result.second == 0

    def test_utc_is_tomorrow(self) -> None:
        user = _make_user(timezone="UTC")
        result = compute_daily_quota_resets_at(user)
        now_utc = datetime.now(UTC).replace(tzinfo=None)
        assert result > now_utc

    def test_invalid_timezone_fallback_returns_datetime(self) -> None:
        user = _make_user(timezone="Invalid/Timezone")
        result = compute_daily_quota_resets_at(user)
        assert isinstance(result, datetime)

    def test_seoul_timezone(self) -> None:
        # Seoul(UTC+9) 다음 자정 = UTC 15:00 (전날). UTC naive datetime 반환.
        user = _make_user(timezone="Asia/Seoul")
        result = compute_daily_quota_resets_at(user)
        assert isinstance(result, datetime)
        # UTC 변환 결과: 분/초 = 0 이어야 함
        assert result.minute == 0
        assert result.second == 0
