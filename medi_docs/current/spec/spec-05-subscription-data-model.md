---
id: spec-05
type: spec
title: 구독 데이터 모델 — User 컬럼 확장 + subscription_events 테이블 + Alembic
status: draft
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-12-mock-purchase-api-and-events]]"
  - "[[adr-13-anonymous-paywall-and-terms]]"
  - "[[adr-11-monthly-only-no-yearly]]"
related_to:
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-04-subscription-api]]"
tags: [spec, payment, subscription, data-model, alembic, database]
---

# 구독 데이터 모델 — User 컬럼 확장 + subscription_events 테이블 + Alembic

## Summary

Phase 1 DB 변경 전체 명세. User 테이블 컬럼 6개 추가/확장, `subscription_events` 신규 테이블, `daily_focus` 와의 진실 원천 정합성, Alembic 마이그레이션 스켈레톤.

---

## 1. 개요

Phase 1a 에서 적용할 DB 변경 범위:

| 변경 | 대상 | 내용 |
|------|------|------|
| User 테이블 컬럼 추가 | `users` | timezone, terms_agreed_at, privacy_agreed_at |
| User 테이블 컬럼 수정 | `users` | subscription_status (String → ENUM 5값) |
| 신규 테이블 | `subscription_events` | append-only 이벤트 소싱 |
| 인덱스 추가 | `subscription_events` | 사용자별 이력 조회, 분석 |
| daily_focus 로직 수정 | 코드 | date.today() → 사용자 timezone 기준 날짜 |

---

## 2. User 테이블 확장

### 2-1. 기존 컬럼 (참고)

현행 `backend/app/models/user.py` 기준:

```python
subscription_status: Mapped[str] = mapped_column(String, default="free")
trial_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
is_pro: Mapped[bool] = mapped_column(Boolean, default=False)
pro_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

### 2-2. 추가/변경 컬럼

| 컬럼 | 타입 (DB) | NULL | 기본값 | 근거 | 비고 |
|------|-----------|:----:|--------|------|------|
| `subscription_status` | `VARCHAR(20)` (기존 유지, 값 제한은 앱 레이어에서) | NOT NULL | `'free'` | adr-10 | PostgreSQL ENUM 대신 VARCHAR + Check Constraint 권장 (마이그레이션 유연성). 허용값: `free/trial/pro/expired/cancelled` |
| `timezone` | `VARCHAR(50)` | NOT NULL | `'UTC'` | adr-10 + 사용자 결정 | IANA timezone string. 가입 시 클라이언트 전송 시 갱신 |
| `terms_agreed_at` | `TIMESTAMP` | NULL | NULL | adr-13 | 이용약관 동의 시각 (UTC) |
| `privacy_agreed_at` | `TIMESTAMP` | NULL | NULL | adr-13 | 개인정보처리방침 동의 시각 (UTC) |

> **subscription_status ENUM vs VARCHAR 결정**:
>
> | 방식 | 장점 | 단점 | 권장 |
> |------|------|------|------|
> | PostgreSQL ENUM | DB 레벨 값 제한, 저장 공간 소 | ENUM 추가 시 `ALTER TYPE` DDL, 마이그레이션 복잡 | — |
> | **VARCHAR + Check Constraint** | Alembic 마이그레이션 단순, Phase 2 값 추가 쉬움 | 앱 레이어 검증 필요 | **권장** |
>
> **채택: VARCHAR(20) + Check Constraint** (`subscription_status IN ('free','trial','pro','expired','cancelled')`)

### 2-3. is_pro 캐시 컬럼 정합성

현행 `is_pro: bool` 은 `subscription_status` 의 캐시. Phase 1 에서는 유지하되 항상 `subscription_status` 와 동기화:
- `subscription_status = 'trial'` or `'pro'` → `is_pro = true`
- `subscription_status = 'free'` or `'expired'` → `is_pro = false`
- `subscription_status = 'cancelled'` → `pro_until > now()` 이면 `is_pro = true`, 아니면 `false`

> Phase 2 에서 `is_pro` 단독 사용은 deprecated 예정. 클라이언트는 `subscription_status` 를 primary 로 사용해야 함.

---

## 3. subscription_events 테이블 (신규)

### 3-1. 스키마

```sql
CREATE TABLE subscription_events (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type   VARCHAR(30)   NOT NULL
                 CHECK (event_type IN (
                     'trial_started', 'trial_expired',
                     'purchased', 'renewed', 'expired',
                     'cancelled', 'refunded'
                 )),
    source       VARCHAR(20)   NOT NULL
                 CHECK (source IN ('mock', 'revenuecat', 'admin', 'system')),
    plan         VARCHAR(20)   NOT NULL
                 CHECK (plan IN ('monthly')),
    amount_cents INTEGER       NULL,       -- mock=199, system/trial=NULL
    currency     VARCHAR(3)    NULL DEFAULT 'USD',
    occurred_at  TIMESTAMP     NOT NULL DEFAULT now(),
    raw_payload  JSONB         NULL,       -- RevenueCat webhook 원본 등
    created_at   TIMESTAMP     NOT NULL DEFAULT now()
);
```

### 3-2. append-only 보장 방법

**권장: 앱 레이어 가드 (Phase 1) + Phase 2 DB 레벨 보완**

| 방법 | Phase 1 | Phase 2 |
|------|:-------:|:-------:|
| Repository 레이어에서 UPDATE/DELETE 메서드 미구현 | ✓ | ✓ |
| PostgreSQL RLS (Row Level Security) | — | 추가 권장 |
| DB 트리거 (`BEFORE UPDATE/DELETE RAISE EXCEPTION`) | — | 추가 권장 |

Phase 1 에서는 `SubscriptionEventRepository` 에 `add()` 메서드만 구현. `update()` / `delete()` 없음.

### 3-3. 인덱스

```sql
-- 사용자별 최신 이력 조회 (주 사용 패턴)
CREATE INDEX idx_sub_events_user_time
    ON subscription_events (user_id, occurred_at DESC);

-- 이벤트 타입별 분석 (감사·통계)
CREATE INDEX idx_sub_events_type_time
    ON subscription_events (event_type, occurred_at);

-- source 별 집계 (mock/revenuecat 분리 집계)
CREATE INDEX idx_sub_events_source
    ON subscription_events (source);
```

### 3-4. amount_cents 규칙

| source | event_type | amount_cents |
|--------|-----------|:------------:|
| `mock` | `purchased` | 199 |
| `mock` | `renewed` | 199 |
| `system` | `trial_started`, `trial_expired`, `expired` | NULL |
| `admin` | 모든 이벤트 | NULL |
| `revenuecat` | `purchased`, `renewed` | RevenueCat 응답값 |

---

## 4. 활성 구독 상태 Read 전략

**Phase 1 채택: User 캐시 컬럼 우선, events 는 이력·감사용**

| 전략 | 특징 | Phase 1 채택 |
|------|------|:---:|
| **캐시 컬럼** (`User.subscription_status`, `is_pro`, `pro_until`) | 조회 O(1), 갱신 필요 | ✓ |
| events scan | 이력 완전 재구성 가능, 느림 | 감사·디버그 전용 |

캐시 갱신 시점:
1. `mock-purchase` 호출 시 (서비스 레이어에서 트랜잭션 내 동시 갱신)
2. `GET /users/me` lazy 만료 체크 시 (trial/pro 만료 조건이면 즉시 갱신)
3. debug API 호출 시
4. (Phase 2) RevenueCat webhook 수신 시

---

## 5. daily_focus 정합성 — 진실 원천 결정

### 현황

- `daily_focus.session_count`: `PUT /api/sessions/{id}` 에서 `status="completed"` 시 증가 (`sessions.py:124`)
- `daily_focus.date`: 현재 `date.today()` = **서버 UTC 날짜** (`sessions.py:198`)

### 일일 한도 체크의 진실 원천

**`daily_focus` 테이블의 `(user_id, 사용자_로컬_오늘)` 레코드의 `session_count` 가 진실 원천.**

변경 필요 사항:
1. `sessions.py:198` 의 `date.today()` → `_get_user_local_date(user.timezone)` 로 교체
2. `daily_focus.date` = 사용자 로컬 날짜 기준으로 저장

```python
# 변경 전 (sessions.py:198)
today = date.today()

# 변경 후
from zoneinfo import ZoneInfo
from datetime import datetime
def _get_user_local_date(timezone_str: str) -> date:
    tz = ZoneInfo(timezone_str)
    return datetime.now(tz).date()

today = _get_user_local_date(user.timezone or 'UTC')
```

3. 세션 시작(`POST /api/sessions`) 에서 한도 체크 로직 추가:
```python
# subscription_status 가 free/expired/cancelled(만료) 이면 한도 체크
if user.subscription_status in ('free', 'expired') or (
    user.subscription_status == 'cancelled' and
    (user.pro_until is None or user.pro_until < datetime.utcnow())
):
    today_count = await get_today_session_count(db, user, today)
    if today_count >= 1:
        raise HTTPException(status_code=403, detail={"code": "DAILY_QUOTA_EXCEEDED"})
```

### 기존 daily_focus 레코드 (UTC 날짜 기준)

- 기존 레코드는 UTC 날짜로 저장되어 있음
- timezone 도입 후: 새 레코드부터 사용자 로컬 날짜 기준
- 충돌 가능성: `timezone != 'UTC'` 사용자가 UTC 기준 기존 레코드 + 로컬 기준 새 레코드 혼재 → 한도 체크 오판 가능
- **Phase 1 처리**: 신규 가입 사용자는 처음부터 로컬 날짜 기준. 기존 사용자는 `timezone = 'UTC'` 기본값 유지 → 기존과 동일 동작. UTC 기반 한도 체크를 원하는 기존 사용자는 앱에서 timezone 설정 시 갱신.

---

## 6. Alembic 마이그레이션 스켈레톤

```python
"""Phase 1a — 구독 모델 확장 (User 컬럼 + subscription_events)

Revision ID: xxxx
Revises: <이전_revision>
Create Date: 2026-05-XX
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'xxxx'
down_revision = '<이전_revision>'

def upgrade() -> None:
    # 1. User 테이블 컬럼 추가
    op.add_column('users', sa.Column(
        'timezone', sa.String(50), nullable=False, server_default='UTC'
    ))
    op.add_column('users', sa.Column(
        'terms_agreed_at', sa.DateTime(), nullable=True
    ))
    op.add_column('users', sa.Column(
        'privacy_agreed_at', sa.DateTime(), nullable=True
    ))

    # 2. subscription_status CHECK constraint 추가
    op.create_check_constraint(
        'ck_users_subscription_status',
        'users',
        "subscription_status IN ('free','trial','pro','expired','cancelled')"
    )

    # 3. subscription_events 테이블 신규
    op.create_table(
        'subscription_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('source', sa.String(20), nullable=False),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(3), nullable=True, server_default='USD'),
        sa.Column('occurred_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('raw_payload', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('now()')),
        sa.CheckConstraint(
            "event_type IN ('trial_started','trial_expired','purchased',"
            "'renewed','expired','cancelled','refunded')",
            name='ck_sub_events_event_type'
        ),
        sa.CheckConstraint(
            "source IN ('mock','revenuecat','admin','system')",
            name='ck_sub_events_source'
        ),
        sa.CheckConstraint(
            "plan IN ('monthly')",
            name='ck_sub_events_plan'
        ),
    )

    # 4. 인덱스
    op.create_index('idx_sub_events_user_time',
                    'subscription_events', ['user_id', 'occurred_at'],
                    postgresql_ops={'occurred_at': 'DESC'})
    op.create_index('idx_sub_events_type_time',
                    'subscription_events', ['event_type', 'occurred_at'])
    op.create_index('idx_sub_events_source',
                    'subscription_events', ['source'])


def downgrade() -> None:
    op.drop_index('idx_sub_events_source')
    op.drop_index('idx_sub_events_type_time')
    op.drop_index('idx_sub_events_user_time')
    op.drop_table('subscription_events')
    op.drop_constraint('ck_users_subscription_status', 'users')
    op.drop_column('users', 'privacy_agreed_at')
    op.drop_column('users', 'terms_agreed_at')
    op.drop_column('users', 'timezone')
```

---

## 7. 개발 환경 데이터 시드

Phase 1a 검증을 위한 5상태별 테스트 사용자 시드 권장:

```python
# alembic/seeds/subscription_test_users.py (또는 pytest fixture)
TEST_USERS = [
    {"email": "free@test.com",     "subscription_status": "free"},
    {"email": "trial@test.com",    "subscription_status": "trial",    "trial_start_date": date.today()},
    {"email": "pro@test.com",      "subscription_status": "pro",      "pro_until": datetime.utcnow() + timedelta(days=25)},
    {"email": "expired@test.com",  "subscription_status": "expired"},
    {"email": "cancelled@test.com","subscription_status": "cancelled","pro_until": datetime.utcnow() + timedelta(days=5)},
]
```

debug API (`POST /admin/debug/subscription`) 를 사용하면 런타임에 상태 전환 가능 → 별도 시드 불필요한 경우 debug API 활용.
