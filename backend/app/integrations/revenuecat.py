"""RevenueCat REST API client."""

from __future__ import annotations

from datetime import datetime

import httpx

from app.config import settings

_REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"
_TIMEOUT = 5.0


class RevenueCatCustomerInfo:
    """RevenueCat GET /subscribers 응답 wrapper."""

    def __init__(self, raw: dict) -> None:
        self.raw = raw

    @property
    def entitlements_active(self) -> bool:
        return bool(self.raw.get("subscriber", {}).get("entitlements", {}).get("active", {}))

    @property
    def expiration_at(self) -> datetime | None:
        active = self.raw.get("subscriber", {}).get("entitlements", {}).get("active", {})
        for ent in active.values():
            expires = ent.get("expires_date")
            if expires:
                return datetime.fromisoformat(expires.replace("Z", "+00:00")).replace(tzinfo=None)
        return None


async def get_customer_info(app_user_id: str) -> RevenueCatCustomerInfo:
    """RevenueCat REST API GET /subscribers/{app_user_id} 호출. timeout 5s, 재시도 1회."""
    if not settings.revenuecat_api_key:
        raise RuntimeError("REVENUECAT_API_KEY not configured")

    headers = {"Authorization": f"Bearer {settings.revenuecat_api_key}"}
    url = f"{_REVENUECAT_API_BASE}/subscribers/{app_user_id}"

    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(2):
            try:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return RevenueCatCustomerInfo(resp.json())
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                last_exc = exc

    raise last_exc  # type: ignore[misc]
