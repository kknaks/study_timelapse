from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    """유저 테이블."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "subscription_status IN ('free','trial','pro','expired','cancelled')",
            name="subscription_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider: Mapped[str] = mapped_column(String, nullable=False)  # 'google' | 'apple'
    provider_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    total_focus_time: Mapped[int] = mapped_column(Integer, default=0)
    subscription_status: Mapped[str] = mapped_column(String, default="free", server_default="free")
    trial_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_pro: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    pro_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(50), nullable=False, default="UTC", server_default="UTC"
    )
    terms_agreed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    privacy_agreed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    sessions = relationship("FocusSession", back_populates="user", lazy="selectin")
    daily_focuses = relationship("DailyFocus", back_populates="user", lazy="selectin")
    subscription_events = relationship(
        "SubscriptionEvent", back_populates="user", lazy="selectin"
    )
