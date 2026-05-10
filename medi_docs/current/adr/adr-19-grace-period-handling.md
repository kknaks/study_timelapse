---
id: adr-19
type: adr
title: Grace Period 처리 — 갱신 실패 시 Pro 상태 유지 방식
status: accepted
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-21-cancel-vs-refund-state-transition]]"
  - "[[adr-22-status-source-cache-with-sync]]"
  - "[[spec-06-revenuecat-integration]]"
  - "[[spec-07-receipt-verification]]"
  - "[[spec-08-mobile-revenuecat-integration]]"
tags: [adr, payment, subscription, revenuecat, grace-period, state-machine, phase2]
---

# Grace Period 처리 — 갱신 실패 시 Pro 상태 유지 방식

## Summary

결제 수단 만료로 갱신 실패 시 Apple(최대 16일)/Google(최대 30일) 이 부여하는 grace period 동안 Pro 기능 유지(D-PLAN-2-8 A). **옵션 B 채택 (2026-05-09)**: `subscription_status='pro'` 유지 + `grace_until TIMESTAMP NULL` 신규 컬럼.

---

## Context

- Phase 1 5-state ENUM: `free / trial / pro / expired / cancelled`
- RevenueCat `BILLING_ISSUE_DETECTED_EVENT` / `in_grace_period` 이벤트 발생 시 grace period 시작
- Apple 최대 16일, Google 최대 30일 grace period
- Apple/Google 가이드라인: grace period 동안 Pro 기능 유지 권장
- Phase 1 마이그레이션 0 원칙: Phase 2 에서 스키마 변경 최소화
- planning-03 D-PLAN-2-8 / adr-10 5-state 모델

---

## Options

| 안 | 방식 | Pros | Cons |
|---|------|------|------|
| **A** | **6번째 ENUM state 추가** (`subscription_status='in_grace_period'`) | 상태 명확. paywall UI 분기 명시적. audit log 명확. `in_grace_period` 이벤트 = 상태 직접 매핑 | **마이그 1건 발생** (Phase 2 마이그 0 원칙 예외). Phase 1 5-state 머신 설계 변경. Phase 1 코드에서 `in_grace_period` 분기 미처리 → 기존 로직 모두 검토 필요 |
| **B** | **`subscription_status='pro'` 유지 + `grace_until` 신규 컬럼** (또는 subscription_events 메타데이터) | **마이그 0** (User 컬럼 1개 추가) 또는 마이그 0 (events 메타데이터만). 5-state 머신 유지. Phase 1 코드 변경 최소 | grace 기간은 `grace_until` 컬럼 조회 필요. paywall UI 가 `pro + grace_until 임박` 분기 직접 처리. `grace_until` 컬럼 추가 시 마이그 1건 발생 (단, ENUM 마이그보다 영향 작음) |
| **C** | `subscription_status='pro'` 유지 + `subscription_events` 메타데이터에 grace 정보 기록 | 컬럼 추가 없음, **마이그 0 완전 달성** | grace 기간 조회를 events 테이블에서 aggregation 해야 함. paywall UI 에서 grace 임박 판단 복잡 |

---

## Decision

**옵션 B 채택 (사용자 결정 2026-05-09)**: `subscription_status='pro'` 유지 + `grace_until TIMESTAMP NULL` 신규 컬럼.

**Why**: Phase 1 마이그 0 원칙은 Phase 2 핵심 호환성 가정. ENUM 변경(A)은 Phase 1 전체 코드에서 새 상태 분기 처리가 필요해 회귀 위험이 큼. `grace_until` 컬럼 추가(B)는 `ALTER TABLE ADD COLUMN ... DEFAULT NULL` 으로 기존 데이터 영향 없음. 5-state ENUM 유지로 Phase 1 자산 최대 재활용.

### 각 안 선택 시 후속 작업

| 결정 | 필요 작업 |
|------|----------|
| **A** | DB migration 1건 (`ALTER TYPE subscription_status ADD VALUE 'in_grace_period'`). Phase 1 코드 전반 `in_grace_period` 분기 추가. spec-NN 에서 6-state 머신 재명세 |
| **B** | DB migration 1건 (`ALTER TABLE users ADD COLUMN grace_until TIMESTAMP NULL`). `grace_until` 조회 로직 backend + mobile 추가. paywall UI `grace 임박` 배너 조건 `grace_until < now + 3일` 등 |
| **C** | migration 0. subscription_events 조회 쿼리 추가. paywall UI grace 상태 판단 복잡 |

---

## Context (Grace Period 동작)

```
[RevenueCat: BILLING_ISSUE_DETECTED_EVENT]
  ↓
  → grace period 시작 (Apple 최대 16일 / Google 최대 30일)
  → 사용자가 결제 수단 업데이트 → 갱신 성공 → Pro 계속 유지
  → 기간 내 미업데이트 → 갱신 실패 → expired 전환

during grace period:
  → Pro 기능 유지 (워터마크 제거, 프로그레스바)
  → 설정 화면에 "결제 수단을 업데이트해주세요" 배너 표시 권장
```

---

## Consequences (B 채택)

### backend/api (○)
- `User` 테이블에 `grace_until TIMESTAMP NULL` 컬럼 추가 (migration 1건 — `ALTER TABLE users ADD COLUMN grace_until TIMESTAMP NULL`)
- webhook `BILLING_ISSUE_DETECTED_EVENT` 수신 시 `grace_until = now + grace_period_days` 설정 + `subscription_status='pro'` 유지
- grace period 만료 후 갱신 성공 이벤트 수신 시 `grace_until = NULL` 초기화
- grace period 만료 후 갱신 실패 시 lazy expiry 또는 webhook `EXPIRATION` 이벤트에서 `subscription_status='expired'`

### frontend/mobile-fe (○)
- 설정 화면: `grace_until` 존재 시 "결제 수단을 업데이트해주세요" 배너 표시
- `GET /users/me` 응답에 `grace_until` 필드 추가 (spec 단계 확정)

### frontend/web-fe (×)
### frontend/shared-fe (×)
