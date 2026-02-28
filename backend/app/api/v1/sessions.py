from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.daily_focus import DailyFocus
from app.models.session import FocusSession
from app.models.user import User
from app.schemas.session import SessionCreateRequest, SessionResponse, SessionUpdateRequest

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post(
    "",
    summary="세션 시작",
    response_model=dict,
    status_code=201,
)
async def create_session(
    request: SessionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """새로운 포커스 세션을 시작한다."""
    session = FocusSession(
        id=uuid.uuid4(),
        user_id=current_user.id,
        start_time=request.start_time,
        output_seconds=request.output_seconds,
        aspect_ratio=request.aspect_ratio,
        overlay_style=request.overlay_style,
        status="recording",
    )
    db.add(session)
    await db.flush()

    return {
        "success": True,
        "data": SessionResponse(
            id=str(session.id),
            user_id=str(session.user_id),
            start_time=session.start_time,
            end_time=session.end_time,
            duration=session.duration,
            output_seconds=session.output_seconds,
            aspect_ratio=session.aspect_ratio,
            overlay_style=session.overlay_style,
            status=session.status,
            file_id=session.file_id,
            task_id=session.task_id,
            created_at=session.created_at,
        ).model_dump(mode="json"),
    }


@router.put(
    "/{session_id}",
    summary="세션 업데이트 (종료)",
    response_model=dict,
)
async def update_session(
    session_id: str,
    request: SessionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """세션 정보를 업데이트한다 (종료 시)."""
    stmt = select(FocusSession).where(
        FocusSession.id == uuid.UUID(session_id),
        FocusSession.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if request.end_time is not None:
        session.end_time = request.end_time
    if request.duration is not None:
        session.duration = request.duration
    if request.status is not None:
        session.status = request.status
    if request.file_id is not None:
        session.file_id = request.file_id
    if request.task_id is not None:
        session.task_id = request.task_id

    # 세션 완료 시 daily_focus 업데이트 & 유저 총 포커스 시간 갱신
    if request.status == "completed" and request.duration:
        await _update_daily_focus(db, current_user.id, request.duration)
        current_user.total_focus_time += request.duration

    await db.flush()

    return {
        "success": True,
        "data": SessionResponse(
            id=str(session.id),
            user_id=str(session.user_id),
            start_time=session.start_time,
            end_time=session.end_time,
            duration=session.duration,
            output_seconds=session.output_seconds,
            aspect_ratio=session.aspect_ratio,
            overlay_style=session.overlay_style,
            status=session.status,
            file_id=session.file_id,
            task_id=session.task_id,
            created_at=session.created_at,
        ).model_dump(mode="json"),
    }


@router.get(
    "",
    summary="내 세션 목록",
    response_model=dict,
)
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """현재 유저의 세션 목록을 반환한다."""
    stmt = (
        select(FocusSession)
        .where(FocusSession.user_id == current_user.id)
        .order_by(FocusSession.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    return {
        "success": True,
        "data": [
            SessionResponse(
                id=str(s.id),
                user_id=str(s.user_id),
                start_time=s.start_time,
                end_time=s.end_time,
                duration=s.duration,
                output_seconds=s.output_seconds,
                aspect_ratio=s.aspect_ratio,
                overlay_style=s.overlay_style,
                status=s.status,
                file_id=s.file_id,
                task_id=s.task_id,
                created_at=s.created_at,
            ).model_dump(mode="json")
            for s in sessions
        ],
    }


async def _update_daily_focus(
    db: AsyncSession, user_id: uuid.UUID, duration: int
) -> None:
    """일별 포커스 통계를 업데이트한다."""
    today = date.today()
    stmt = select(DailyFocus).where(
        DailyFocus.user_id == user_id,
        DailyFocus.date == today,
    )
    result = await db.execute(stmt)
    daily = result.scalar_one_or_none()

    if daily:
        daily.total_seconds += duration
        daily.session_count += 1
    else:
        daily = DailyFocus(
            id=uuid.uuid4(),
            user_id=user_id,
            date=today,
            total_seconds=duration,
            session_count=1,
        )
        db.add(daily)
