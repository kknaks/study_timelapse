from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def set_subscription_status(
        self,
        user: User,
        status: str,
        pro_until: datetime | None = None,
        trial_start_date: date | None = None,
    ) -> User:
        """구독 상태 캐시 갱신 (is_pro 동기화 포함). T-008에서 호출."""
        user.subscription_status = status
        # spec-05 §2-3: is_pro 캐시 동기화
        if status in ("trial", "pro"):
            user.is_pro = True
        elif status == "cancelled":
            user.is_pro = pro_until is not None and pro_until > datetime.utcnow()
        else:
            user.is_pro = False

        if pro_until is not None:
            user.pro_until = pro_until
        if trial_start_date is not None:
            user.trial_start_date = trial_start_date

        await self._db.flush()
        return user
