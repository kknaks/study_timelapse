from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import (
    AppleLoginRequest,
    GoogleLoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserInfoResponse,
)
from app.services import auth_service
from app.services.jwt_service import create_token_pair, verify_refresh_token

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/google",
    summary="Google 소셜 로그인",
    response_model=dict,
)
async def login_google(
    request: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Google id_token을 검증하고 JWT를 발급한다."""
    try:
        result = await auth_service.login_with_google(db, request.id_token)
        return {
            "success": True,
            "data": {
                "tokens": result["tokens"],
                "user": result["user"],
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.post(
    "/apple",
    summary="Apple 소셜 로그인",
    response_model=dict,
)
async def login_apple(
    request: AppleLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apple identity_token을 검증하고 JWT를 발급한다."""
    try:
        result = await auth_service.login_with_apple(db, request.identity_token, request.name)
        return {
            "success": True,
            "data": {
                "tokens": result["tokens"],
                "user": result["user"],
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.post(
    "/refresh",
    summary="토큰 갱신",
    response_model=dict,
)
async def refresh_token(request: RefreshTokenRequest) -> dict:
    """Refresh token으로 새 JWT 쌍을 발급한다."""
    try:
        user_id = verify_refresh_token(request.refresh_token)
        tokens = create_token_pair(user_id)
        return {
            "success": True,
            "data": tokens,
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
