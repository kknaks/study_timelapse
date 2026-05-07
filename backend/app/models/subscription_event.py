from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class SubscriptionEvent(Base):
    """구독 이벤트 테이블 — append-only."""

    __tablename__ = "subscription_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('trial_started','trial_expired','purchased',"
            "'renewed','expired','cancelled','refunded')",
            name="event_type",
        ),
        CheckConstraint(
            "source IN ('mock','revenuecat','admin','system')",
            name="source",
        ),
        CheckConstraint(
            "plan IN ('monthly')",
            name="plan",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str | None] = mapped_column(
        String(3), nullable=True, default="USD", server_default="USD"
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    user = relationship("User", back_populates="subscription_events")
