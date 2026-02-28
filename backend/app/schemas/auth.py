from __future__ import annotations

from pydantic import BaseModel


class GoogleLoginRequest(BaseModel):
    """Google 로그인 요청."""

    id_token: str


class AppleLoginRequest(BaseModel):
    """Apple 로그인 요청."""

    identity_token: str
    name: str | None = None  # Apple은 첫 로그인 시만 이름 제공


class RefreshTokenRequest(BaseModel):
    """토큰 갱신 요청."""

    refresh_token: str


class TokenResponse(BaseModel):
    """JWT 토큰 응답."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserInfoResponse(BaseModel):
    """로그인 시 반환되는 유저 정보."""

    id: str
    provider: str
    email: str | None = None
    name: str | None = None
    is_new: bool = False
