"""유저 API 라우터."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.daily_focus import DailyFocus
from app.models.user import User
from app.repositories.subscription_event import SubscriptionEventRepository
from app.schemas.user import ProfileUpdateRequest, StreakUpdateRequest, UserResponseV2
from app.services import subscription as sub_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/me",
    summary="내 정보 조회",
    response_model=dict,
)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """현재 로그인된 유저의 정보를 반환한다 (구독 상태 + 일일 한도 + 배너 포함)."""
    event_repo = SubscriptionEventRepository(db)
    await sub_service.apply_lazy_expiry(current_user, db, event_repo)

    try:
        tz = ZoneInfo(current_user.timezone)
    except (ZoneInfoNotFoundError, KeyError):
        tz = ZoneInfo("UTC")
    today_local = datetime.now(tz).date()
    result = await db.execute(
        select(DailyFocus).where(
            DailyFocus.user_id == current_user.id,
            DailyFocus.date == today_local,
        )
    )
    daily = result.scalar_one_or_none()
    daily_session_count = daily.session_count if daily else 0

    return {
        "success": True,
        "data": UserResponseV2(
            id=str(current_user.id),
            provider=current_user.provider,
            email=current_user.email,
            name=current_user.name,
            streak=current_user.streak,
            longest_streak=current_user.longest_streak,
            total_focus_time=current_user.total_focus_time,
            subscription_status=current_user.subscription_status,
            trial_start_date=current_user.trial_start_date,
            is_pro=current_user.is_pro,
            pro_until=current_user.pro_until,
            timezone=current_user.timezone,
            terms_agreed_at=current_user.terms_agreed_at,
            privacy_agreed_at=current_user.privacy_agreed_at,
            daily_session_count=daily_session_count,
            daily_quota=sub_service.compute_daily_quota(current_user),
            daily_quota_resets_at=sub_service.compute_daily_quota_resets_at(current_user),
            banner_alert=sub_service.compute_banner_alert(current_user),
            created_at=current_user.created_at,
            updated_at=current_user.updated_at,
        ).model_dump(mode="json"),
    }


@router.put(
    "/me/profile",
    summary="프로필 업데이트 (닉네임)",
    response_model=dict,
)
async def update_profile(
    request: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """유저의 닉네임을 업데이트한다."""
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")
    current_user.name = name
    await db.flush()
    return {
        "success": True,
        "data": {"name": current_user.name},
    }


@router.put(
    "/me/streak",
    summary="스트릭 업데이트",
    response_model=dict,
)
async def update_streak(
    request: StreakUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """유저의 스트릭 정보를 업데이트한다."""
    current_user.streak = request.streak
    if request.longest_streak is not None:
        current_user.longest_streak = max(
            current_user.longest_streak, request.longest_streak
        )
    else:
        current_user.longest_streak = max(
            current_user.longest_streak, request.streak
        )
    await db.flush()

    return {
        "success": True,
        "data": {
            "streak": current_user.streak,
            "longest_streak": current_user.longest_streak,
        },
    }
