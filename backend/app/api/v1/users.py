from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import StreakUpdateRequest, UserResponse

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/me",
    summary="내 정보 조회",
    response_model=dict,
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> dict:
    """현재 로그인된 유저의 정보를 반환한다."""
    return {
        "success": True,
        "data": UserResponse(
            id=str(current_user.id),
            provider=current_user.provider,
            email=current_user.email,
            name=current_user.name,
            streak=current_user.streak,
            longest_streak=current_user.longest_streak,
            total_focus_time=current_user.total_focus_time,
            subscription_status=current_user.subscription_status,
            trial_start_date=current_user.trial_start_date,
            created_at=current_user.created_at,
            updated_at=current_user.updated_at,
        ).model_dump(mode="json"),
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
