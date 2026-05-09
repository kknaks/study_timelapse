"""구독 관련 Pydantic v2 스키마 — Phase 2 RevenueCat."""

from __future__ import annotations

from pydantic import BaseModel


class RevenueCatVerifyRequest(BaseModel):
    app_user_id: str
    transaction_id: str
    product_identifier: str


class RevenueCatWebhookEvent(BaseModel):
    type: str
    app_user_id: str
    id: str
    transaction_id: str | None = None
    product_id: str | None = None
    expiration_at_ms: int | None = None
    grace_period_expiration_at_ms: int | None = None
    purchased_at_ms: int | None = None
    price: float | None = None


class RevenueCatWebhookPayload(BaseModel):
    api_version: str | None = None
    event: RevenueCatWebhookEvent
