from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SessionCreateRequest(BaseModel):
    """세션 생성 요청."""

    start_time: datetime
    output_seconds: int
    aspect_ratio: str = "9:16"
    overlay_style: str = "stopwatch"


class SessionUpdateRequest(BaseModel):
    """세션 업데이트 (종료) 요청."""

    end_time: datetime | None = None
    duration: int | None = None
    status: str | None = None
    file_id: str | None = None
    task_id: str | None = None


class SessionResponse(BaseModel):
    """세션 응답."""

    id: str
    user_id: str
    start_time: datetime
    end_time: datetime | None = None
    duration: int | None = None
    output_seconds: int
    aspect_ratio: str = "9:16"
    overlay_style: str = "stopwatch"
    status: str = "recording"
    file_id: str | None = None
    task_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
