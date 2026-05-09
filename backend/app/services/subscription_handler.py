"""RevenueCat 구독 이벤트 처리 서비스 — Phase 2."""

from __future__ import annotations

import logging
import uuid as uuid_mod
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import AppError
from app.integrations.revenuecat import get_customer_info
from app.models.user import User
from app.repositories.subscription_event import SubscriptionEventRepository
from app.schemas.subscription import RevenueCatWebhookEvent

logger = logging.getLogger(__name__)

# 동일 사용자 sync 쿨다운 (30초) — 인메모리, 서버 재시작 시 초기화됨
_sync_cooldown: dict[str, datetime] = {}
_SYNC_COOLDOWN_SECS = 30


class RevenueCatVerificationError(AppError):
    def __init__(self) -> None:
        super().__init__(
            422, "REVENUECAT_VERIFICATION_FAILED", "RevenueCat 검증 실패 또는 활성 구독 없음"
        )


class RevenueCatFetchError(AppError):
    def __init__(self) -> None:
        super().__init__(422, "REVENUECAT_FETCH_FAILED", "RevenueCat API 일시 장애")


class RevenueCatNotConfiguredError(AppError):
    def __init__(self) -> None:
        super().__init__(503, "REVENUECAT_NOT_CONFIGURED", "RevenueCat 연동이 설정되지 않았습니다")


class UserMismatchError(AppError):
    def __init__(self) -> None:
        super().__init__(403, "USER_MISMATCH", "JWT user_id 와 app_user_id 불일치")


class SyncRateLimitError(AppError):
    def __init__(self) -> None:
        super().__init__(
            429, "RATE_LIMITED", "동일 사용자 sync 요청 간격이 너무 짧습니다 (30초 쿨다운)"
        )


class WebhookAuthError(AppError):
    def __init__(self) -> None:
        super().__init__(401, "INVALID_AUTH", "webhook Bearer 토큰 인증 실패")


def _parse_ms(ms: int | None) -> datetime | None:
    if ms is None:
        return None
    return datetime.utcfromtimestamp(ms / 1000)


def _extract_amount_cents(event_data: dict) -> int | None:
    price = event_data.get("price")
    if price is not None:
        return int(round(float(price) * 100))
    return None


def _build_subscription_response(user: User, *, idempotent: bool) -> dict:
    return {
        "subscription_status": user.subscription_status,
        "pro_until": user.pro_until.isoformat() if user.pro_until else None,
        "is_pro": user.is_pro,
        "grace_until": user.grace_until.isoformat() if user.grace_until else None,
        "idempotent": idempotent,
    }


async def handle_verify(
    user: User,
    app_user_id: str,
    transaction_id: str,
    product_identifier: str,
    db: AsyncSession,
    event_repo: SubscriptionEventRepository,
) -> dict:
    """verify endpoint 처리: idempotency → RevenueCat 조회 → 상태 갱신."""
    if str(user.id) != app_user_id:
        raise UserMismatchError()

    if not settings.revenuecat_api_key:
        raise RevenueCatNotConfiguredError()

    # idempotency 체크 (transaction_id 기반)
    if await event_repo.exists_by_transaction_id(transaction_id):
        return _build_subscription_response(user, idempotent=True)

    # RevenueCat customer info 조회 (위조 방어 — adr-15)
    try:
        customer_info = await get_customer_info(app_user_id)
    except Exception:
        raise RevenueCatFetchError() from None

    if not customer_info.entitlements_active:
        raise RevenueCatVerificationError()

    # 상태 갱신 (INITIAL_PURCHASE 로직 동일)
    user.subscription_status = "pro"
    user.pro_until = customer_info.expiration_at
    user.grace_until = None
    user.is_pro = True
    await db.flush()

    await event_repo.create(
        user_id=user.id,
        event_type="purchased",
        source="revenuecat",
        plan="monthly",
        transaction_id=transaction_id,
        raw_payload=customer_info.raw,
    )
    await db.flush()
    await db.refresh(user)

    return _build_subscription_response(user, idempotent=False)


async def handle_webhook_event(
    event: RevenueCatWebhookEvent,
    db: AsyncSession,
    event_repo: SubscriptionEventRepository,
) -> dict:
    """webhook endpoint 처리: idempotency → 사용자 조회 → 이벤트 분기 → 상태 갱신."""
    # 1. idempotency 체크 (event.id 기반)
    if await event_repo.exists_by_event_id(event.id):
        return {"idempotent": True}

    # 2. 사용자 조회
    try:
        user_uuid = uuid_mod.UUID(str(event.app_user_id))
    except (ValueError, AttributeError):
        logger.warning("Webhook: invalid app_user_id format: %s", event.app_user_id)
        return {"idempotent": False}

    stmt = select(User).where(User.id == user_uuid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("Webhook: unknown app_user_id %s", event.app_user_id)
        return {"idempotent": False}

    now_utc = datetime.utcnow()
    event_type = event.type

    # 3. 이벤트 분기 (spec-06 §4 매핑 표 / spec-07 §2 의사코드)
    if event_type in ("INITIAL_PURCHASE", "RENEWAL"):
        user.subscription_status = "pro"
        user.pro_until = _parse_ms(event.expiration_at_ms)
        user.grace_until = None
        user.is_pro = True
        sub_event_type = "purchased" if event_type == "INITIAL_PURCHASE" else "renewed"

    elif event_type == "CANCELLATION":
        user.subscription_status = "cancelled"
        user.is_pro = user.pro_until is not None and user.pro_until > now_utc
        sub_event_type = "cancel_scheduled"

    elif event_type == "EXPIRATION":
        user.subscription_status = "expired"
        user.is_pro = False
        sub_event_type = "expired"

    elif event_type == "BILLING_ISSUE":
        user.grace_until = _parse_ms(event.grace_period_expiration_at_ms)
        sub_event_type = "billing_issue"

    elif event_type == "REFUND":
        user.subscription_status = "cancelled"
        user.pro_until = now_utc
        user.grace_until = None
        user.is_pro = False
        sub_event_type = "refunded"

    else:
        logger.info("Webhook: unhandled event type: %s", event_type)
        return {"idempotent": False}

    await db.flush()

    await event_repo.create(
        user_id=user.id,
        event_type=sub_event_type,
        source="revenuecat",
        plan="monthly",
        amount_cents=_extract_amount_cents(event.model_dump()),
        occurred_at=_parse_ms(event.purchased_at_ms) or now_utc,
        event_id=event.id,
        transaction_id=event.transaction_id,
        raw_payload=event.model_dump(),
    )

    return {"idempotent": False}


async def handle_sync(
    user: User,
    db: AsyncSession,
    event_repo: SubscriptionEventRepository,
) -> dict:
    """sync endpoint 처리: 쿨다운 → RevenueCat 조회 → 강제 상태 갱신."""
    if not settings.revenuecat_api_key:
        raise RevenueCatNotConfiguredError()

    # 30초 쿨다운 체크 (사용자별 인메모리)
    user_id_str = str(user.id)
    now_utc = datetime.utcnow()
    last_sync = _sync_cooldown.get(user_id_str)
    if last_sync and (now_utc - last_sync).total_seconds() < _SYNC_COOLDOWN_SECS:
        raise SyncRateLimitError()
    _sync_cooldown[user_id_str] = now_utc

    try:
        customer_info = await get_customer_info(user_id_str)
    except Exception:
        raise RevenueCatFetchError() from None

    # 활성 구독이면 상태 갱신, 없으면 현재 상태 유지 (webhook 이 다운그레이드 처리)
    if customer_info.entitlements_active:
        user.subscription_status = "pro"
        user.pro_until = customer_info.expiration_at
        user.grace_until = None
        user.is_pro = True
        await db.flush()

    await event_repo.create(
        user_id=user.id,
        event_type="sync",
        source="revenuecat",
        plan="monthly",
        raw_payload=customer_info.raw,
    )
    await db.flush()
    await db.refresh(user)

    return _build_subscription_response(user, idempotent=False)
