from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription_event import SubscriptionEvent


class SubscriptionEventRepository:
    """append-only — create/list 만 제공. update/delete 메서드 없음."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(
        self,
        user_id: uuid.UUID,
        event_type: str,
        source: str,
        plan: str,
        amount_cents: int | None = None,
        currency: str | None = "USD",
        raw_payload: dict | None = None,
    ) -> SubscriptionEvent:
        event = SubscriptionEvent(
            user_id=user_id,
            event_type=event_type,
            source=source,
            plan=plan,
            amount_cents=amount_cents,
            currency=currency,
            raw_payload=raw_payload,
        )
        self._db.add(event)
        await self._db.flush()
        return event

    async def list_by_user(
        self, user_id: uuid.UUID, limit: int = 50
    ) -> list[SubscriptionEvent]:
        stmt = (
            select(SubscriptionEvent)
            .where(SubscriptionEvent.user_id == user_id)
            .order_by(SubscriptionEvent.occurred_at.desc())
            .limit(limit)
        )
        result = await self._db.execute(stmt)
        return list(result.scalars().all())
