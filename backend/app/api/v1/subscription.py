"""구독 API 라우터 — mock-purchase."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.repositories.subscription_event import SubscriptionEventRepository
from app.services import subscription as sub_service

router = APIRouter(prefix="/subscription", tags=["Subscription"])


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
