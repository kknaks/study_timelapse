from __future__ import annotations

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings


def create_access_token(user_id: str) -> str:
    """Access token 생성 (1시간)."""
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> str:
    """Refresh token 생성 (30일)."""
    expire = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_token_pair(user_id: str) -> dict:
    """Access + Refresh 토큰 쌍 생성."""
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


def decode_token(token: str) -> dict:
    """토큰 디코드. 유효하지 않으면 예외."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}") from e


def verify_access_token(token: str) -> str:
    """Access token 검증 후 user_id 반환."""
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise ValueError("Not an access token")
    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Token missing sub claim")
    return user_id


def verify_refresh_token(token: str) -> str:
    """Refresh token 검증 후 user_id 반환."""
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise ValueError("Not a refresh token")
    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Token missing sub claim")
    return user_id
