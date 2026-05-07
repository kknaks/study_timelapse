"""T-012 — 로그인 시 lazy expiry check 단위 테스트."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.user import User
from app.services import auth_service


def _make_expired_trial_user() -> MagicMock:
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.provider = "google"
    user.email = "test@example.com"
    user.name = "Test User"
    user.subscription_status = "trial"
    user.trial_start_date = date.today() - timedelta(days=8)
    user.is_pro = True
    user.pro_until = None
    return user


_FAKE_TOKENS = {"access_token": "tok", "refresh_token": "ref"}


class TestLoginWithGoogleLazyExpiry:
    @pytest.mark.asyncio
    async def test_existing_expired_trial_user_calls_lazy_expiry(self) -> None:
        """기존 trial 만료 사용자 Google 로그인 → apply_lazy_expiry 호출."""
        user = _make_expired_trial_user()

        with (
            patch(
                "app.services.auth_service.verify_google_token",
                return_value={
                    "provider": "google",
                    "provider_id": "gid_123",
                    "email": "test@example.com",
                    "name": "Test User",
                },
            ),
            patch(
                "app.services.auth_service.get_or_create_user",
                return_value=(user, False),
            ),
            patch("app.services.auth_service.create_token_pair", return_value=_FAKE_TOKENS),
            patch(
                "app.services.auth_service.apply_lazy_expiry",
                new_callable=AsyncMock,
            ) as mock_lazy,
        ):
            await auth_service.login_with_google(AsyncMock(), "fake_token")

            mock_lazy.assert_called_once()
            assert mock_lazy.call_args[0][0] is user

    @pytest.mark.asyncio
    async def test_new_user_skips_lazy_expiry(self) -> None:
        """신규 가입(is_new=True) → apply_lazy_expiry 호출 안 함."""
        user = MagicMock(spec=User)
        user.id = uuid.uuid4()
        user.provider = "google"
        user.email = "new@example.com"
        user.name = "New User"

        with (
            patch(
                "app.services.auth_service.verify_google_token",
                return_value={
                    "provider": "google",
                    "provider_id": "gid_new",
                    "email": "new@example.com",
                    "name": "New User",
                },
            ),
            patch(
                "app.services.auth_service.get_or_create_user",
                return_value=(user, True),
            ),
            patch("app.services.auth_service.create_token_pair", return_value=_FAKE_TOKENS),
            patch(
                "app.services.auth_service.apply_lazy_expiry",
                new_callable=AsyncMock,
            ) as mock_lazy,
        ):
            await auth_service.login_with_google(AsyncMock(), "fake_token")

            mock_lazy.assert_not_called()


class TestLoginWithAppleLazyExpiry:
    @pytest.mark.asyncio
    async def test_existing_expired_trial_user_calls_lazy_expiry(self) -> None:
        """기존 trial 만료 사용자 Apple 로그인 → apply_lazy_expiry 호출."""
        user = _make_expired_trial_user()
        user.provider = "apple"

        with (
            patch(
                "app.services.auth_service.verify_apple_token",
                return_value={
                    "provider": "apple",
                    "provider_id": "aid_123",
                    "email": "test@example.com",
                    "name": None,
                },
            ),
            patch(
                "app.services.auth_service.get_or_create_user",
                return_value=(user, False),
            ),
            patch("app.services.auth_service.create_token_pair", return_value=_FAKE_TOKENS),
            patch(
                "app.services.auth_service.apply_lazy_expiry",
                new_callable=AsyncMock,
            ) as mock_lazy,
        ):
            await auth_service.login_with_apple(AsyncMock(), "fake_apple_token")

            mock_lazy.assert_called_once()
            assert mock_lazy.call_args[0][0] is user

    @pytest.mark.asyncio
    async def test_new_apple_user_skips_lazy_expiry(self) -> None:
        """Apple 신규 가입(is_new=True) → apply_lazy_expiry 호출 안 함."""
        user = MagicMock(spec=User)
        user.id = uuid.uuid4()
        user.provider = "apple"
        user.email = None
        user.name = "Apple User"

        with (
            patch(
                "app.services.auth_service.verify_apple_token",
                return_value={
                    "provider": "apple",
                    "provider_id": "aid_new",
                    "email": None,
                    "name": None,
                },
            ),
            patch(
                "app.services.auth_service.get_or_create_user",
                return_value=(user, True),
            ),
            patch("app.services.auth_service.create_token_pair", return_value=_FAKE_TOKENS),
            patch(
                "app.services.auth_service.apply_lazy_expiry",
                new_callable=AsyncMock,
            ) as mock_lazy,
        ):
            await auth_service.login_with_apple(AsyncMock(), "fake_apple_token")

            mock_lazy.assert_not_called()
