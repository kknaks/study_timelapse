from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.daily_focus import DailyFocus
from app.models.user import User
from app.schemas.stats import DailyFocusResponse, WeeklyStatsResponse

router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get(
    "/daily",
    summary="일별 포커스 통계",
    response_model=dict,
)
async def get_daily_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    start_date: date = Query(default=None, description="시작 날짜 (YYYY-MM-DD)"),
    end_date: date = Query(default=None, description="종료 날짜 (YYYY-MM-DD)"),
) -> dict:
    """일별 포커스 통계를 조회한다."""
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)

    stmt = (
        select(DailyFocus)
        .where(
            DailyFocus.user_id == current_user.id,
            DailyFocus.date >= start_date,
            DailyFocus.date <= end_date,
        )
        .order_by(DailyFocus.date.asc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    return {
        "success": True,
        "data": [
            DailyFocusResponse(
                date=r.date,
                total_seconds=r.total_seconds,
                session_count=r.session_count,
            ).model_dump(mode="json")
            for r in records
        ],
    }


@router.get(
    "/weekly",
    summary="주간 포커스 통계",
    response_model=dict,
)
async def get_weekly_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    target_date: date = Query(default=None, description="기준 날짜 (해당 주 통계)"),
) -> dict:
    """주간 포커스 통계를 조회한다."""
    if not target_date:
        target_date = date.today()

    # 월요일 시작 기준
    week_start = target_date - timedelta(days=target_date.weekday())
    week_end = week_start + timedelta(days=6)

    stmt = (
        select(DailyFocus)
        .where(
            DailyFocus.user_id == current_user.id,
            DailyFocus.date >= week_start,
            DailyFocus.date <= week_end,
        )
        .order_by(DailyFocus.date.asc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    total_seconds = sum(r.total_seconds for r in records)
    session_count = sum(r.session_count for r in records)

    return {
        "success": True,
        "data": WeeklyStatsResponse(
            week_start=week_start,
            week_end=week_end,
            total_seconds=total_seconds,
            session_count=session_count,
            daily=[
                DailyFocusResponse(
                    date=r.date,
                    total_seconds=r.total_seconds,
                    session_count=r.session_count,
                )
                for r in records
            ],
            streak=current_user.streak,
            longest_streak=current_user.longest_streak,
        ).model_dump(mode="json"),
    }
