---
id: adr-12
type: adr
title: mock-purchase API + 이벤트 소싱 (전용 API / append-only / source 컬럼)
status: accepted
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[planning-02-payment]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-11-monthly-only-no-yearly]]"
tags: [adr, payment, subscription, api, events, mock-purchase, event-sourcing]
---

# mock-purchase API + 이벤트 소싱 (전용 API / append-only / source 컬럼)

## Summary

Phase 1 결제 트리거는 전용 `POST /api/subscription/mock-purchase` API. 결제 이력은 `subscription_events` 테이블에 append-only 이벤트 소싱. Phase 2 RevenueCat 이력은 `source="revenuecat"` 컬럼으로 동일 테이블에 혼재.

---

## Context

- Phase 1: 스토어 SDK 없이 백엔드가 직접 구독 상태 관리 (mock)
- Phase 2: RevenueCat webhook → 동일 테이블로 흘려넣기
- 결제 이력 보존 필요: 감사·환불 분쟁 대응
- Debug 강제 전환 API (`POST /admin/debug/subscription`): prod 노출 위험 방지 필요
- planning-02 D-PLAN-1 (전용 API) + D-PLAN-5 (append-only) + D-PLAN-6 (source 컬럼) 통합 결정

---

## Options

### 결제 트리거 방식 (D-PLAN-1)

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **전용 mock-purchase API** (`POST /api/subscription/mock-purchase`) | 의도 명확, prod 노출 차단 용이, Phase 2 동일 endpoint 계약으로 설계 가능 | 신규 API 1개 추가 |
| B | debug API 재사용 | 추가 개발 0 | debug용 API가 prod paywall flow에 혼입 |
| C | 어드민 수동 전환 API 재사용 | 추가 개발 0 | 어드민 권한 필요, 사용자 self-serve 불가 |

### 이력 범위 (D-PLAN-5)

| 안 | 기록 이벤트 | 감사 추적 | row 수 |
|---|------------|---------|-------|
| **A** | **모든 이벤트 append-only** | 완전 | 많음 |
| B | 성공 거래만 | 부분 | 적음 |
| C | 활성 레코드 1행 upsert | 없음 | 최소 |

### mock→real 마이그레이션 (D-PLAN-6)

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **이력 보존 + source 컬럼** | 트라이얼 방지 로직 유지, 집계 필터 가능 | 집계 시 source 필터 필요 |
| B | 폐기 | 집계 단순 | 이력 손실 |
| C | 별도 테이블 이동 | 분리 명확 | 마이그레이션 복잡 |

---

## Decision

**세 결정 모두 A 채택.**

### API 설계

- `POST /api/subscription/mock-purchase`
  - 인증 필수 (JWT)
  - 멱등성: 동일 사용자 활성 구독 존재 시 재사용 (이중 결제 방지)
  - Phase 2 전환 시 내부 구현만 교체 (동일 endpoint 계약 유지)
- `POST /admin/debug/subscription`
  - 스테이지 환경 전용
  - `ENABLE_DEBUG_SUBSCRIPTION` 환경변수 `false` 시 prod 404 반환
  - free/trial/pro 자유 토글 (테스트 목적)

### subscription_events 테이블 스키마

```
subscription_events
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id      UUID NOT NULL REFERENCES users(id)
  event_type   ENUM(purchased, renewed, expired, cancelled, refunded,
                    trial_started, trial_expired)
  source       ENUM(mock, revenuecat, admin, system)
  plan         ENUM(monthly)   -- adr-11 월 only 확정
  amount_cents INTEGER          -- monthly: 199
  currency     VARCHAR(3)       -- 'USD'
  occurred_at  TIMESTAMPTZ NOT NULL
  raw_payload  JSONB            -- RevenueCat webhook 원문 등 원본 보존
```

- **append-only 보장**: UPDATE / DELETE 금지 (DB 계층 정책, 변경은 새 이벤트 INSERT)
- 활성 구독 상태: `subscription_events` reduce 또는 `User.is_pro` / `User.pro_until` 캐시 컬럼 → 성능/정합성 trade-off는 후속 spec 에서 결정

**Why**:
- 전용 API: 의도 명확, Phase 2 전환 시 내부 구현만 교체
- debug 분리: prod 노출 위험 방지 (`ENABLE_DEBUG_SUBSCRIPTION` 가드)
- append-only: 감사 가능 + 환불 분쟁 이력 그대로 추적
- source 컬럼: mock/revenuecat 혼재 가능, Phase 2 마이그레이션 비용 0

---

## Consequences

### backend/api (○ 영향)
- Alembic: `subscription_events` 테이블 신규
- `POST /api/subscription/mock-purchase` API 신규
- `POST /admin/debug/subscription` API 신규 (ENV 가드)
- `User.is_pro` / `User.pro_until` 캐시 컬럼 활용 여부 — spec 단계에서 결정
- `daily_focus` 테이블 `session_count` 와 subscription 상태 연계 검토 필요

### frontend/mobile-fe (○ 영향)
- paywall "구매 완료" 버튼 → `POST /api/subscription/mock-purchase` 호출
- 응답 기반 구독 상태 즉시 반영

### frontend/web-fe (× 없음)
### frontend/shared-fe (× 없음)

### 후속 산출물
- `spec-NN-subscription-api`: mock-purchase / debug / `GET /users/me` 확장 Request·Response 계약
- `spec-NN-subscription-data-model`: `subscription_events` 인덱스, append-only 보장 방법, 활성 상태 read 전략
