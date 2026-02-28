from __future__ import annotations

import logging
import uuid

import httpx
import jwt as pyjwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.services.jwt_service import create_token_pair

logger = logging.getLogger(__name__)

# Apple 공개키 캐시
_apple_public_keys: list[dict] | None = None


async def _fetch_apple_public_keys() -> list[dict]:
    """Apple의 공개키를 fetch."""
    global _apple_public_keys
    if _apple_public_keys:
        return _apple_public_keys

    async with httpx.AsyncClient() as client:
        resp = await client.get("https://appleid.apple.com/auth/keys")
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
        _apple_public_keys = keys
        return keys


def _invalidate_apple_keys_cache() -> None:
    """Apple 공개키 캐시 무효화."""
    global _apple_public_keys
    _apple_public_keys = None


async def verify_google_token(token: str) -> dict:
    """Google id_token 검증 → 유저 정보 반환."""
    try:
        idinfo = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id,
        )
        return {
            "provider": "google",
            "provider_id": idinfo["sub"],
            "email": idinfo.get("email"),
            "name": idinfo.get("name"),
        }
    except Exception as e:
        logger.error(f"Google token verification failed: {e}")
        raise ValueError(f"Invalid Google token: {e}") from e


async def verify_apple_token(token: str) -> dict:
    """Apple identity_token 검증 → 유저 정보 반환."""
    try:
        # 헤더에서 kid 추출
        header = pyjwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise ValueError("Missing kid in token header")

        # Apple 공개키 fetch
        keys = await _fetch_apple_public_keys()
        matching_key = None
        for key in keys:
            if key.get("kid") == kid:
                matching_key = key
                break

        if not matching_key:
            # 캐시 무효화 후 재시도
            _invalidate_apple_keys_cache()
            keys = await _fetch_apple_public_keys()
            for key in keys:
                if key.get("kid") == kid:
                    matching_key = key
                    break

        if not matching_key:
            raise ValueError(f"No matching Apple public key for kid={kid}")

        # 공개키로 검증
        public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(matching_key)
        payload = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer="https://appleid.apple.com",
        )

        return {
            "provider": "apple",
            "provider_id": payload["sub"],
            "email": payload.get("email"),
            "name": None,  # Apple은 첫 로그인 시만 이름 제공 (별도 파라미터)
        }
    except pyjwt.ExpiredSignatureError:
        raise ValueError("Apple token expired")
    except Exception as e:
        logger.error(f"Apple token verification failed: {e}")
        raise ValueError(f"Invalid Apple token: {e}") from e


async def get_or_create_user(
    db: AsyncSession,
    provider: str,
    provider_id: str,
    email: str | None = None,
    name: str | None = None,
) -> tuple[User, bool]:
    """provider_id로 유저 조회 또는 생성. (user, is_new) 반환."""
    stmt = select(User).where(User.provider_id == provider_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        # 기존 유저: 이메일/이름 업데이트 (있으면)
        if email and not user.email:
            user.email = email
        if name and not user.name:
            user.name = name
        return user, False

    # 새 유저 생성
    user = User(
        id=uuid.uuid4(),
        provider=provider,
        provider_id=provider_id,
        email=email,
        name=name,
    )
    db.add(user)
    await db.flush()
    return user, True


async def login_with_google(db: AsyncSession, id_token_str: str) -> dict:
    """Google 로그인 처리."""
    user_info = await verify_google_token(id_token_str)
    user, is_new = await get_or_create_user(
        db,
        provider=user_info["provider"],
        provider_id=user_info["provider_id"],
        email=user_info["email"],
        name=user_info["name"],
    )
    tokens = create_token_pair(str(user.id))
    return {
        "tokens": tokens,
        "user": {
            "id": str(user.id),
            "provider": user.provider,
            "email": user.email,
            "name": user.name,
            "is_new": is_new,
        },
    }


async def login_with_apple(
    db: AsyncSession, identity_token: str, name: str | None = None
) -> dict:
    """Apple 로그인 처리."""
    user_info = await verify_apple_token(identity_token)
    user, is_new = await get_or_create_user(
        db,
        provider=user_info["provider"],
        provider_id=user_info["provider_id"],
        email=user_info["email"],
        name=name or user_info["name"],
    )
    tokens = create_token_pair(str(user.id))
    return {
        "tokens": tokens,
        "user": {
            "id": str(user.id),
            "provider": user.provider,
            "email": user.email,
            "name": user.name,
            "is_new": is_new,
        },
    }
