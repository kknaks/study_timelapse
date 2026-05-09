from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    """유저 정보 응답 (현행 — T-008 이전)."""

    id: str
    provider: str
    email: str | None = None
    name: str | None = None
    streak: int = 0
    longest_streak: int = 0
    total_focus_time: int = 0
    subscription_status: str = "free"
    trial_start_date: date | None = None
    is_pro: bool = False
    pro_until: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserResponseV2(BaseModel):
    """구독 필드 + 일일 한도 + 배너 포함 확장 응답 — GET /users/me."""

    id: str
    provider: str
    email: str | None = None
    name: str | None = None
    streak: int = 0
    longest_streak: int = 0
    total_focus_time: int = 0
    subscription_status: str = "free"
    trial_start_date: date | None = None
    is_pro: bool = False
    pro_until: datetime | None = None
    grace_until: datetime | None = None
    timezone: str = "UTC"
    terms_agreed_at: datetime | None = None
    privacy_agreed_at: datetime | None = None
    daily_session_count: int = 0
    daily_quota: int = 1
    daily_quota_resets_at: datetime
    banner_alert: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StreakUpdateRequest(BaseModel):
    """스트릭 업데이트 요청."""

    streak: int
    longest_streak: int | None = None


class ProfileUpdateRequest(BaseModel):
    """프로필 업데이트 요청."""

    name: str


class TermsAgreeRequest(BaseModel):
    """약관 동의 요청."""

    terms_agreed: bool
    privacy_agreed: bool
