"""구독 비즈니스 로직 서비스 레이어 — Phase 1a."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import InvalidPlanError, InvalidTargetStatusError, TermsNotAgreedError
from app.models.user import User
from app.repositories.subscription_event import SubscriptionEventRepository

VALID_STATUSES: frozenset[str] = frozenset({"free", "trial", "pro", "expired", "cancelled"})

_STATUS_EVENT_MAP: dict[str, str] = {
    "free": "expired",
    "trial": "trial_started",
    "pro": "purchased",
    "expired": "expired",
    "cancelled": "cancelled",
}


def _get_tz(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(user.timezone)
    except (ZoneInfoNotFoundError, KeyError):
        return ZoneInfo("UTC")


def compute_daily_quota(user: User) -> int:
    """일일 한도. -1=무제한(trial/pro), 1=제한(free/expired)."""
    if user.subscription_status in ("trial", "pro"):
        return -1
    if user.subscription_status == "cancelled" and user.pro_until is not None:
        if user.pro_until > datetime.utcnow():
            return -1
    return 1


def compute_daily_quota_resets_at(user: User) -> datetime:
    """사용자 로컬 다음 자정을 UTC naive datetime으로 반환."""
    tz = _get_tz(user)
    now_local = datetime.now(tz)
    tomorrow_midnight_local = (now_local + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return tomorrow_midnight_local.astimezone(UTC).replace(tzinfo=None)


def compute_banner_alert(user: User) -> str | None:
    """배너 알림 유형 계산."""
    if user.subscription_status == "trial" and user.trial_start_date is not None:
        trial_end = datetime.combine(user.trial_start_date + timedelta(days=7), time.min)
        delta = trial_end - datetime.utcnow()
        if delta <= timedelta(0):
            return "trial_expired"
        if delta <= timedelta(hours=1):
            return "trial_expiring_1h"
        if delta <= timedelta(hours=24):
            return "trial_expiring_24h"
        return None
    if user.subscription_status == "expired":
        return "subscription_expired"
    return None


async def apply_lazy_expiry(
    user: User,
    db: AsyncSession,
    event_repo: SubscriptionEventRepository,
) -> bool:
    """trial/pro 만료 lazy 체크. 만료 시 상태 변경 + event INSERT. True = 만료 발생."""
    now_utc = datetime.utcnow()

    if user.subscription_status == "trial" and user.trial_start_date is not None:
        trial_end_date = user.trial_start_date + timedelta(days=7)
        if trial_end_date <= date.today():
            user.subscription_status = "expired"
            user.is_pro = False
            user.pro_until = None
            await db.flush()
            await event_repo.create(
                user_id=user.id,
                event_type="trial_expired",
                source="system",
                plan="monthly",
            )
            return True

    elif user.subscription_status == "pro" and user.pro_until is not None:
        if user.pro_until <= now_utc:
            user.subscription_status = "expired"
            user.is_pro = False
            await db.flush()
            await event_repo.create(
                user_id=user.id,
                event_type="expired",
                source="system",
                plan="monthly",
            )
            return True

    return False


async def mock_purchase(
    user: User,
    db: AsyncSession,
    event_repo: SubscriptionEventRepository,
    plan: str,
) -> dict:
    """mock 구매 처리. 응답 dict 반환."""
    if plan != "monthly":
        raise InvalidPlanError()
    if user.terms_agreed_at is None or user.privacy_agreed_at is None:
        raise TermsNotAgreedError()

    now_utc = datetime.utcnow()

    # 멱등: 이미 활성 pro → 기존 상태 반환
    is_active_pro = (
        user.subscription_status == "pro"
        and user.pro_until is not None
        and user.pro_until > now_utc
    )
    if is_active_pro:
        events = await event_repo.list_by_user(user.id, limit=1)
        last_event = events[0] if events else None
        trial_start_iso = user.trial_start_date.isoformat() if user.trial_start_date else None
        return {
            "subscription_status": user.subscription_status,
            "trial_start_date": trial_start_iso,
            "pro_until": user.pro_until.isoformat(),
            "is_pro": user.is_pro,
            "event": {
                "id": str(last_event.id),
                "event_type": last_event.event_type,
                "source": last_event.source,
                "plan": last_event.plan,
                "amount_cents": last_event.amount_cents,
                "occurred_at": last_event.occurred_at.isoformat(),
            } if last_event else None,
            "idempotent": True,
        }

    # 정상 구매 (free/trial/expired → pro)
    pro_until = now_utc + timedelta(days=30)
    user.subscription_status = "pro"
    user.is_pro = True
    user.pro_until = pro_until
    await db.flush()

    event = await event_repo.create(
        user_id=user.id,
        event_type="purchased",
        source="mock",
        plan="monthly",
        amount_cents=199,
        currency="USD",
    )

    return {
        "subscription_status": user.subscription_status,
        "trial_start_date": user.trial_start_date.isoformat() if user.trial_start_date else None,
        "pro_until": user.pro_until.isoformat(),
        "is_pro": user.is_pro,
        "event": {
            "id": str(event.id),
            "event_type": event.event_type,
            "source": event.source,
            "plan": event.plan,
            "amount_cents": event.amount_cents,
            "occurred_at": event.occurred_at.isoformat(),
        },
        "idempotent": False,
    }


async def debug_set_status(
    target_user: User,
    target_status: str,
    source: str,
    note: str | None,
    db: AsyncSession,
    event_repo: SubscriptionEventRepository,
) -> dict:
    """debug: 구독 상태 강제 전환 (QA/스테이지 전용)."""
    if target_status not in VALID_STATUSES:
        raise InvalidTargetStatusError()

    previous_status = target_user.subscription_status
    now_utc = datetime.utcnow()

    if target_status == "trial":
        target_user.trial_start_date = date.today()
        target_user.pro_until = None
        target_user.is_pro = True
    elif target_status == "pro":
        target_user.pro_until = now_utc + timedelta(days=30)
        target_user.is_pro = True
    elif target_status in ("expired", "free"):
        target_user.pro_until = None
        target_user.is_pro = False
    elif target_status == "cancelled":
        target_user.is_pro = (
            target_user.pro_until is not None and target_user.pro_until > now_utc
        )

    target_user.subscription_status = target_status
    await db.flush()

    event_type = _STATUS_EVENT_MAP.get(target_status, "expired")
    raw_payload: dict | None = {"note": note} if note else None
    event = await event_repo.create(
        user_id=target_user.id,
        event_type=event_type,
        source=source,
        plan="monthly",
        raw_payload=raw_payload,
    )

    return {
        "user_id": str(target_user.id),
        "previous_status": previous_status,
        "new_status": target_status,
        "event": {
            "id": str(event.id),
            "event_type": event.event_type,
            "source": event.source,
            "occurred_at": event.occurred_at.isoformat(),
        },
    }
