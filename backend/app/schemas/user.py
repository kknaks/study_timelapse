from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    """유저 정보 응답."""

    id: str
    provider: str
    email: str | None = None
    name: str | None = None
    streak: int = 0
    longest_streak: int = 0
    total_focus_time: int = 0
    subscription_status: str = "free"
    trial_start_date: date | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StreakUpdateRequest(BaseModel):
    """스트릭 업데이트 요청."""

    streak: int
    longest_streak: int | None = None
