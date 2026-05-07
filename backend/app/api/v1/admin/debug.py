"""Debug API 라우터 — ENV 가드 (ALLOW_DEBUG_SUBSCRIPTION=1 시만 등록)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import NotFoundError
from app.models.user import User
from app.repositories.subscription_event import SubscriptionEventRepository
from app.services import subscription as sub_service

router = APIRouter(prefix="/admin/debug", tags=["Debug"])


class DebugSubscriptionRequest(BaseModel):
    user_id: uuid.UUID
    target_status: str
    note: str | None = None


@router.post(
    "/subscription",
    summary="구독 상태 강제 전환 (debug, ALLOW_DEBUG_SUBSCRIPTION=1 필요)",
    response_model=dict,
)
async def debug_set_subscription(
    request: DebugSubscriptionRequest,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """개발/QA 전용: 구독 상태 강제 전환. 프로덕션에서는 이 라우터가 등록되지 않음."""
    result = await db.execute(select(User).where(User.id == request.user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise NotFoundError("User", str(request.user_id))

    event_repo = SubscriptionEventRepository(db)
    data = await sub_service.debug_set_status(
        target_user=target_user,
        target_status=request.target_status,
        source="admin",
        note=request.note,
        db=db,
        event_repo=event_repo,
    )
    return {"success": True, "data": data}
