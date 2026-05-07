"""T-007 — 구독 Check Constraint + 인덱스 실DB 통합 테스트.

실행 전제: alembic upgrade head 완료 (subscription_events 테이블 존재).
DB: TEST_DATABASE_URL > DATABASE_URL(+asyncpg 제거) > localhost:15434 (로컬 기본값)
"""

from __future__ import annotations

import os
import uuid

import pytest


def _resolve_db_url() -> str:
    if url := os.getenv("TEST_DATABASE_URL"):
        return url
    url = os.getenv("DATABASE_URL", "postgresql://timelapse:timelapse123@localhost:15434/study_timelapse")
    return url.replace("postgresql+asyncpg://", "postgresql://")


_DB_URL = _resolve_db_url()

# asyncpg 가 설치돼 있고 DB가 접근 가능할 때만 실행
asyncpg = pytest.importorskip("asyncpg")


async def _make_test_user(conn) -> str:
    """테스트용 임시 user row 삽입 → user_id 반환."""
    user_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO users (id, provider, provider_id, subscription_status, is_pro,
                           streak, longest_streak, total_focus_time)
        VALUES ($1::uuid, 'test', $2, 'free', false, 0, 0, 0)
        """,
        user_id,
        f"test_{user_id}",
    )
    return user_id


class TestSubscriptionEventCheckConstraints:
    """Check Constraint 위반 시 DB 에러 발생 확인."""

    @pytest.mark.asyncio
    async def test_valid_event_insert_succeeds(self) -> None:
        """정상 데이터 INSERT 성공."""
        conn = await asyncpg.connect(_DB_URL)
        tr = conn.transaction()
        await tr.start()
        try:
            user_id = await _make_test_user(conn)
            await conn.execute(
                """
                INSERT INTO subscription_events (user_id, event_type, source, plan)
                VALUES ($1::uuid, 'trial_started', 'system', 'monthly')
                """,
                user_id,
            )
        finally:
            await tr.rollback()
            await conn.close()

    @pytest.mark.asyncio
    async def test_invalid_event_type_rejected(self) -> None:
        """잘못된 event_type → CheckViolationError."""
        conn = await asyncpg.connect(_DB_URL)
        outer = conn.transaction()
        await outer.start()
        try:
            user_id = await _make_test_user(conn)
            sp = conn.transaction()
            await sp.start()
            try:
                await conn.execute(
                    """
                    INSERT INTO subscription_events (user_id, event_type, source, plan)
                    VALUES ($1::uuid, 'bad_event', 'mock', 'monthly')
                    """,
                    user_id,
                )
                await sp.commit()
                pytest.fail("Expected CheckViolationError")
            except asyncpg.exceptions.CheckViolationError:
                await sp.rollback()
        finally:
            await outer.rollback()
            await conn.close()

    @pytest.mark.asyncio
    async def test_invalid_source_rejected(self) -> None:
        """잘못된 source → CheckViolationError."""
        conn = await asyncpg.connect(_DB_URL)
        outer = conn.transaction()
        await outer.start()
        try:
            user_id = await _make_test_user(conn)
            sp = conn.transaction()
            await sp.start()
            try:
                await conn.execute(
                    """
                    INSERT INTO subscription_events (user_id, event_type, source, plan)
                    VALUES ($1::uuid, 'purchased', 'invalid_src', 'monthly')
                    """,
                    user_id,
                )
                await sp.commit()
                pytest.fail("Expected CheckViolationError")
            except asyncpg.exceptions.CheckViolationError:
                await sp.rollback()
        finally:
            await outer.rollback()
            await conn.close()

    @pytest.mark.asyncio
    async def test_invalid_plan_rejected(self) -> None:
        """잘못된 plan → CheckViolationError."""
        conn = await asyncpg.connect(_DB_URL)
        outer = conn.transaction()
        await outer.start()
        try:
            user_id = await _make_test_user(conn)
            sp = conn.transaction()
            await sp.start()
            try:
                await conn.execute(
                    """
                    INSERT INTO subscription_events (user_id, event_type, source, plan)
                    VALUES ($1::uuid, 'purchased', 'mock', 'yearly')
                    """,
                    user_id,
                )
                await sp.commit()
                pytest.fail("Expected CheckViolationError")
            except asyncpg.exceptions.CheckViolationError:
                await sp.rollback()
        finally:
            await outer.rollback()
            await conn.close()


class TestSubscriptionEventIndexes:
    """인덱스 생성 확인."""

    @pytest.mark.asyncio
    async def test_indexes_exist(self) -> None:
        conn = await asyncpg.connect(_DB_URL)
        try:
            rows = await conn.fetch(
                """
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'subscription_events'
                """
            )
            index_names = {r["indexname"] for r in rows}
            assert "idx_sub_events_user_time" in index_names
            assert "idx_sub_events_type_time" in index_names
            assert "idx_sub_events_source" in index_names
        finally:
            await conn.close()
