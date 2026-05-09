from __future__ import annotations

import uuid
from datetime import datetime

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
        event_id: str | None = None,
        transaction_id: str | None = None,
        occurred_at: datetime | None = None,
    ) -> SubscriptionEvent:
        event = SubscriptionEvent(
            user_id=user_id,
            event_type=event_type,
            source=source,
            plan=plan,
            amount_cents=amount_cents,
            currency=currency,
            raw_payload=raw_payload,
            event_id=event_id,
            transaction_id=transaction_id,
        )
        if occurred_at is not None:
            event.occurred_at = occurred_at
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

    async def exists_by_event_id(self, event_id: str) -> bool:
        stmt = (
            select(SubscriptionEvent.id)
            .where(SubscriptionEvent.event_id == event_id)
            .limit(1)
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def exists_by_transaction_id(self, transaction_id: str) -> bool:
        stmt = (
            select(SubscriptionEvent.id)
            .where(SubscriptionEvent.transaction_id == transaction_id)
            .limit(1)
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none() is not None
