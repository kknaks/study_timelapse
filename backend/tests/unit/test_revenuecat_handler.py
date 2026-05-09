"""RevenueCat webhook / verify / sync 핸들러 단위 테스트 (mock DB 사용)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.user import User
from app.schemas.subscription import RevenueCatWebhookEvent
from app.services.subscription_handler import (
    RevenueCatFetchError,
    RevenueCatNotConfiguredError,
    RevenueCatVerificationError,
    SyncRateLimitError,
    UserMismatchError,
    _sync_cooldown,
    handle_sync,
    handle_verify,
    handle_webhook_event,
)


def _make_user(
    *,
    subscription_status: str = "pro",
    pro_until: datetime | None = None,
    grace_until: datetime | None = None,
    is_pro: bool = True,
) -> User:
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.subscription_status = subscription_status
    user.pro_until = pro_until or datetime.utcnow() + timedelta(days=30)
    user.grace_until = grace_until
    user.is_pro = is_pro
    return user


def _make_event(
    event_type: str = "INITIAL_PURCHASE",
    *,
    event_id: str | None = None,
    app_user_id: str | None = None,
    transaction_id: str | None = None,
    expiration_at_ms: int | None = None,
    grace_period_expiration_at_ms: int | None = None,
) -> RevenueCatWebhookEvent:
    user_id = app_user_id or str(uuid.uuid4())
    exp_ms = expiration_at_ms or int((datetime.utcnow() + timedelta(days=30)).timestamp() * 1000)
    return RevenueCatWebhookEvent(
        type=event_type,
        app_user_id=user_id,
        id=event_id or str(uuid.uuid4()),
        transaction_id=transaction_id or str(uuid.uuid4()),
        expiration_at_ms=exp_ms,
        grace_period_expiration_at_ms=grace_period_expiration_at_ms,
    )


# --- webhook handler ---


def _mock_db_with_user(user) -> AsyncMock:
    """DB mock: execute → result.scalar_one_or_none() 가 user 반환."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result
    return mock_db


class TestWebhookIdempotency:
    @pytest.mark.asyncio
    async def test_duplicate_event_id_returns_idempotent_true(self) -> None:
        """동일 event.id 재호출 → idempotent:true, INSERT 없음."""
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.exists_by_event_id.return_value = True

        event = _make_event()
        result = await handle_webhook_event(event, mock_db, mock_repo)

        assert result["idempotent"] is True
        mock_repo.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_new_event_id_processes_and_inserts(self) -> None:
        """신규 event.id → INSERT 1회 발생."""
        user = _make_user()
        mock_db = _mock_db_with_user(user)
        mock_repo = AsyncMock()
        mock_repo.exists_by_event_id.return_value = False

        event = _make_event("INITIAL_PURCHASE")
        result = await handle_webhook_event(event, mock_db, mock_repo)

        assert result["idempotent"] is False
        mock_repo.create.assert_called_once()


class TestWebhookEventBranches:
    async def _run(self, event_type: str, **kwargs):
        user = _make_user()
        mock_db = _mock_db_with_user(user)
        mock_repo = AsyncMock()
        mock_repo.exists_by_event_id.return_value = False

        event = _make_event(event_type, **kwargs)
        await handle_webhook_event(event, mock_db, mock_repo)
        return user, mock_repo

    @pytest.mark.asyncio
    async def test_initial_purchase_sets_pro(self) -> None:
        user, repo = await self._run("INITIAL_PURCHASE")
        assert user.subscription_status == "pro"
        assert user.is_pro is True
        assert user.grace_until is None
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "purchased"
        assert call_kwargs["source"] == "revenuecat"

    @pytest.mark.asyncio
    async def test_renewal_sets_renewed(self) -> None:
        user, repo = await self._run("RENEWAL")
        assert user.subscription_status == "pro"
        assert user.is_pro is True
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "renewed"

    @pytest.mark.asyncio
    async def test_cancellation_sets_cancelled(self) -> None:
        user, repo = await self._run("CANCELLATION")
        assert user.subscription_status == "cancelled"
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "cancel_scheduled"

    @pytest.mark.asyncio
    async def test_expiration_sets_expired(self) -> None:
        user, repo = await self._run("EXPIRATION")
        assert user.subscription_status == "expired"
        assert user.is_pro is False
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "expired"

    @pytest.mark.asyncio
    async def test_billing_issue_sets_grace_until(self) -> None:
        grace_ms = int((datetime.utcnow() + timedelta(days=16)).timestamp() * 1000)
        user, repo = await self._run("BILLING_ISSUE", grace_period_expiration_at_ms=grace_ms)
        assert user.grace_until is not None
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "billing_issue"

    @pytest.mark.asyncio
    async def test_refund_sets_cancelled_and_pro_until_now(self) -> None:
        """REFUND → cancelled + pro_until = now(), grace_until = None, is_pro = False."""
        user, repo = await self._run("REFUND")
        assert user.subscription_status == "cancelled"
        assert user.is_pro is False
        assert user.grace_until is None
        # pro_until 이 현재 시각에 근접한지 확인
        assert user.pro_until <= datetime.utcnow() + timedelta(seconds=2)
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "refunded"

    @pytest.mark.asyncio
    async def test_unknown_event_type_skips_and_returns_false(self) -> None:
        """알 수 없는 event_type → INSERT 없이 idempotent:False."""
        user = _make_user()
        mock_db = AsyncMock()
        mock_db.execute.return_value.scalar_one_or_none.return_value = user
        mock_repo = AsyncMock()
        mock_repo.exists_by_event_id.return_value = False

        event = _make_event("PRODUCT_CHANGE")
        result = await handle_webhook_event(event, mock_db, mock_repo)

        assert result["idempotent"] is False
        mock_repo.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_app_user_id_returns_false_without_insert(self) -> None:
        """존재하지 않는 app_user_id → INSERT 없이 200."""
        mock_db = _mock_db_with_user(None)
        mock_repo = AsyncMock()
        mock_repo.exists_by_event_id.return_value = False

        event = _make_event("INITIAL_PURCHASE")
        result = await handle_webhook_event(event, mock_db, mock_repo)

        assert result["idempotent"] is False
        mock_repo.create.assert_not_called()


# --- verify handler ---


class TestVerifyHandler:
    def _make_customer_info(self, *, active: bool = True):
        mock = MagicMock()
        mock.entitlements_active = active
        mock.expiration_at = datetime.utcnow() + timedelta(days=30)
        mock.raw = {"subscriber": {}}
        return mock

    @pytest.mark.asyncio
    async def test_user_mismatch_raises(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        with pytest.raises(UserMismatchError):
            await handle_verify(user, "other-user-id", "txn-123", "product", mock_db, mock_repo)

    @pytest.mark.asyncio
    async def test_env_not_set_raises_503(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        with patch(
            "app.services.subscription_handler.settings",
            new=MagicMock(revenuecat_api_key=""),
        ):
            with pytest.raises(RevenueCatNotConfiguredError):
                await handle_verify(
                    user, str(user.id), "txn-123", "product", mock_db, mock_repo
                )

    @pytest.mark.asyncio
    async def test_duplicate_transaction_id_returns_idempotent(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.exists_by_transaction_id.return_value = True

        with patch(
            "app.services.subscription_handler.settings",
            new=MagicMock(revenuecat_api_key="test-key"),
        ):
            result = await handle_verify(
                user, str(user.id), "txn-dup", "product", mock_db, mock_repo
            )

        assert result["idempotent"] is True
        mock_repo.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_active_entitlement_raises_422(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.exists_by_transaction_id.return_value = False

        customer_info = self._make_customer_info(active=False)
        with (
            patch(
                "app.services.subscription_handler.settings",
                new=MagicMock(revenuecat_api_key="test-key"),
            ),
            patch(
                "app.services.subscription_handler.get_customer_info",
                AsyncMock(return_value=customer_info),
            ),
        ):
            with pytest.raises(RevenueCatVerificationError):
                await handle_verify(
                    user, str(user.id), "txn-123", "product", mock_db, mock_repo
                )

    @pytest.mark.asyncio
    async def test_successful_verify_sets_pro(self) -> None:
        user = _make_user(subscription_status="free", is_pro=False)
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.exists_by_transaction_id.return_value = False

        customer_info = self._make_customer_info(active=True)
        with (
            patch(
                "app.services.subscription_handler.settings",
                new=MagicMock(revenuecat_api_key="test-key"),
            ),
            patch(
                "app.services.subscription_handler.get_customer_info",
                AsyncMock(return_value=customer_info),
            ),
        ):
            result = await handle_verify(
                user, str(user.id), "txn-new", "product", mock_db, mock_repo
            )

        assert result["idempotent"] is False
        assert user.subscription_status == "pro"
        assert user.is_pro is True
        assert user.grace_until is None
        mock_repo.create.assert_called_once()
        call_kwargs = mock_repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "purchased"
        assert call_kwargs["transaction_id"] == "txn-new"

    @pytest.mark.asyncio
    async def test_revenuecat_fetch_failure_raises_422(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        mock_repo.exists_by_transaction_id.return_value = False

        with (
            patch(
                "app.services.subscription_handler.settings",
                new=MagicMock(revenuecat_api_key="test-key"),
            ),
            patch(
                "app.services.subscription_handler.get_customer_info",
                AsyncMock(side_effect=Exception("network error")),
            ),
        ):
            with pytest.raises(RevenueCatFetchError):
                await handle_verify(
                    user, str(user.id), "txn-err", "product", mock_db, mock_repo
                )


# --- sync handler ---


class TestSyncHandler:
    def setup_method(self):
        _sync_cooldown.clear()

    def _make_customer_info(self, *, active: bool = True):
        mock = MagicMock()
        mock.entitlements_active = active
        mock.expiration_at = datetime.utcnow() + timedelta(days=30)
        mock.raw = {"subscriber": {}}
        return mock

    @pytest.mark.asyncio
    async def test_env_not_set_raises_503(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        with patch(
            "app.services.subscription_handler.settings",
            new=MagicMock(revenuecat_api_key=""),
        ):
            with pytest.raises(RevenueCatNotConfiguredError):
                await handle_sync(user, mock_db, mock_repo)

    @pytest.mark.asyncio
    async def test_cooldown_raises_429_on_second_call(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        customer_info = self._make_customer_info()

        with (
            patch(
                "app.services.subscription_handler.settings",
                new=MagicMock(revenuecat_api_key="test-key"),
            ),
            patch(
                "app.services.subscription_handler.get_customer_info",
                AsyncMock(return_value=customer_info),
            ),
        ):
            # 첫 번째 sync 성공
            await handle_sync(user, mock_db, mock_repo)
            # 즉시 두 번째 요청 → 쿨다운
            with pytest.raises(SyncRateLimitError):
                await handle_sync(user, mock_db, mock_repo)

    @pytest.mark.asyncio
    async def test_successful_sync_with_active_entitlement(self) -> None:
        user = _make_user(subscription_status="free", is_pro=False)
        mock_db = AsyncMock()
        mock_repo = AsyncMock()
        customer_info = self._make_customer_info(active=True)

        with (
            patch(
                "app.services.subscription_handler.settings",
                new=MagicMock(revenuecat_api_key="test-key"),
            ),
            patch(
                "app.services.subscription_handler.get_customer_info",
                AsyncMock(return_value=customer_info),
            ),
        ):
            result = await handle_sync(user, mock_db, mock_repo)

        assert user.subscription_status == "pro"
        assert user.is_pro is True
        mock_repo.create.assert_called_once()
        call_kwargs = mock_repo.create.call_args.kwargs
        assert call_kwargs["event_type"] == "sync"
        assert call_kwargs["source"] == "revenuecat"
        assert result["idempotent"] is False

    @pytest.mark.asyncio
    async def test_sync_fetch_failure_raises_422(self) -> None:
        user = _make_user()
        mock_db = AsyncMock()
        mock_repo = AsyncMock()

        with (
            patch(
                "app.services.subscription_handler.settings",
                new=MagicMock(revenuecat_api_key="test-key"),
            ),
            patch(
                "app.services.subscription_handler.get_customer_info",
                AsyncMock(side_effect=Exception("timeout")),
            ),
        ):
            with pytest.raises(RevenueCatFetchError):
                await handle_sync(user, mock_db, mock_repo)
