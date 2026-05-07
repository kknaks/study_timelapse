"""T-007 — 구독 repository API surface 단위 테스트 (DB 불필요)."""

from __future__ import annotations

from app.repositories.subscription_event import SubscriptionEventRepository
from app.repositories.user import UserRepository


class TestSubscriptionEventRepositoryApiSurface:
    """append-only 가드: update/delete 메서드 미존재 확인."""

    def test_has_create_method(self) -> None:
        assert callable(getattr(SubscriptionEventRepository, "create", None))

    def test_has_list_by_user_method(self) -> None:
        assert callable(getattr(SubscriptionEventRepository, "list_by_user", None))

    def test_no_update_method(self) -> None:
        assert not hasattr(SubscriptionEventRepository, "update")

    def test_no_delete_method(self) -> None:
        assert not hasattr(SubscriptionEventRepository, "delete")


class TestUserRepositoryApiSurface:
    """UserRepository.set_subscription_status 시그니처 확인."""

    def test_has_set_subscription_status(self) -> None:
        assert callable(getattr(UserRepository, "set_subscription_status", None))

    def test_has_get_by_id(self) -> None:
        assert callable(getattr(UserRepository, "get_by_id", None))
