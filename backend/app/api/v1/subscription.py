"""구독 API 라우터 — Phase 1 mock-purchase + Phase 2 RevenueCat."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.repositories.subscription_event import SubscriptionEventRepository
from app.schemas.subscription import RevenueCatVerifyRequest, RevenueCatWebhookPayload
from app.services import subscription as sub_service
from app.services.subscription_handler import (
    WebhookAuthError,
    handle_sync,
    handle_verify,
    handle_webhook_event,
)

router = APIRouter(prefix="/subscription", tags=["Subscription"])
webhook_router = APIRouter(prefix="/subscription", tags=["Subscription"])


class MockPurchaseRequest(BaseModel):
    plan: str


@router.post(
    "/mock-purchase",
    summary="Mock 구독 구매 (Phase 1)",
    response_model=dict,
)
async def mock_purchase(
    request: MockPurchaseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """paywall '구매' 버튼 → Pro 전환. Phase 2에서 RevenueCat으로 내부 교체 예정."""
    event_repo = SubscriptionEventRepository(db)
    await sub_service.apply_lazy_expiry(current_user, db, event_repo)
    data = await sub_service.mock_purchase(current_user, db, event_repo, request.plan)
    return {"success": True, "data": data}


@router.post(
    "/verify",
    summary="RevenueCat 영수증 검증 (Phase 2)",
    response_model=dict,
)
async def verify_receipt(
    request: RevenueCatVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """구매 직후 RevenueCat customer info 검증 → subscription_status 즉시 갱신."""
    event_repo = SubscriptionEventRepository(db)
    data = await handle_verify(
        current_user,
        request.app_user_id,
        request.transaction_id,
        request.product_identifier,
        db,
        event_repo,
    )
    return {"success": True, "data": data}


@router.post(
    "/sync",
    summary="RevenueCat 구독 상태 강제 동기화 (Phase 2)",
    response_model=dict,
)
async def sync_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """RevenueCat customer info 직접 조회 → backend 강제 갱신. 30초 쿨다운."""
    event_repo = SubscriptionEventRepository(db)
    data = await handle_sync(current_user, db, event_repo)
    return {"success": True, "data": data}


@webhook_router.post(
    "/webhook",
    summary="RevenueCat webhook 수신 (Phase 2)",
    response_model=dict,
)
async def receive_webhook(
    payload: RevenueCatWebhookPayload,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """RevenueCat 라이프사이클 이벤트 수신. Bearer 토큰 인증 필수."""
    expected = f"Bearer {settings.revenuecat_webhook_auth_token}"
    if not authorization or authorization != expected:
        raise WebhookAuthError()

    event_repo = SubscriptionEventRepository(db)
    data = await handle_webhook_event(payload.event, db, event_repo)
    return {"success": True, "data": data}
