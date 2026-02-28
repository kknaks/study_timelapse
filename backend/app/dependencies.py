from __future__ import annotations

"""공통 의존성."""

import uuid

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User

# TODO: 로그인 구현 후 JWT 인증으로 교체
# 현재는 고정 테스트 유저로 인증을 우회합니다.
TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TEST_USER_PROVIDER = "test"
TEST_USER_PROVIDER_ID = "test_user"


async def get_current_user(
    db: AsyncSession = Depends(get_db),
) -> User:
    """고정 테스트 유저를 반환하는 의존성.

    TODO: 로그인 구현 후 JWT 인증으로 교체
    - HTTPBearer + verify_access_token 으로 복원
    """
    stmt = select(User).where(User.id == TEST_USER_ID)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # 테스트 유저가 없으면 자동 생성 (upsert)
        user = User(
            id=TEST_USER_ID,
            provider=TEST_USER_PROVIDER,
            provider_id=TEST_USER_PROVIDER_ID,
            name="Test User",
        )
        db.add(user)
        await db.flush()

    return user
