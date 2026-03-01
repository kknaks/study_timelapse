from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class DailyFocusResponse(BaseModel):
    """일별 포커스 통계 응답."""

    date: date
    total_seconds: int = 0
    session_count: int = 0


class WeeklyStatsResponse(BaseModel):
    """주간 통계 응답."""

    week_start: date
    week_end: date
    total_seconds: int = 0
    session_count: int = 0
    daily: list[DailyFocusResponse] = []
    streak: int = 0
    longest_streak: int = 0
