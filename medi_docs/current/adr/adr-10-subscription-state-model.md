---
id: adr-10
type: adr
title: 구독 상태 모델 — 5상태 머신 + timezone + 트라이얼 재사용 방지 deferred
status: accepted
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[planning-02-payment]]"
related_to:
  - "[[adr-11-monthly-only-no-yearly]]"
  - "[[adr-12-mock-purchase-api-and-events]]"
tags: [adr, payment, subscription, state-machine, trial, timezone]
---

# 구독 상태 모델 — 5상태 머신 + timezone + 트라이얼 재사용 방지 deferred

## Summary

`free / trial / pro / expired / cancelled` 5상태 머신을 Phase 1 스키마에 확정 박는다. 일일 한도 리셋은 사용자 로컬 자정(`User.timezone`) 기준, 트라이얼 재사용 방지는 Phase 1 deferred.

---

## Context

- 결제 도메인의 핵심 데이터 모델 — 모든 후속 spec/code 가 의존
- 현행 `User` 모델: `subscription_status` = `"free" | "trial" | "pro"` (3상태)
- planning-02 D-PLAN-2/3/4/7 + 사용자 결정 (sub-state Phase 1부터 포함)
- Phase 2 RevenueCat 이벤트(`active / expired / cancelled / in_grace_period` 등) 를 같은 상태 머신으로 매핑해야 함
- `daily_focus` 테이블에 `session_count` 가 이미 존재 — 일일 한도 체크와 연계 필요

---

## Options

| 안 | 상태 수 | Phase 2 호환 | 마이그레이션 | 복잡도 |
|---|---------|------------|------------|--------|
| A | 3상태 (free/trial/pro) | Phase 2 전환 시 ENUM 확장 마이그레이션 필요 | O | 낮음 |
| **B** | **5상태 (free/trial/pro/expired/cancelled) 처음부터** | 완전 호환 | 없음 | 중간 |
| C | 2상태 (free/pro) + trial 플래그 | 만료/취소 구분 모호 → RevenueCat 매핑 불명확 | O | 낮음 (short-term) |

---

## Decision

**B 채택 — 5상태 머신 Phase 1 스키마 확정.**

### 상태 정의

| 상태 | 설명 | Pro 기능 | 일일 한도 |
|------|------|---------|---------|
| `free` | 기본 상태 (가입 전·구독 없음) | ✗ | 1회/일 |
| `trial` | 신규 7일 Pro 체험 (가입 즉시 자동 시작, D-PLAN-2) | ✓ | 무제한 |
| `pro` | 유효 구독 (mock-purchase 또는 RevenueCat) | ✓ | 무제한 |
| `expired` | 구독 만료 (trial 7일 경과 또는 pro 만료) | ✗ | 1회/일 |
| `cancelled` | 명시적 취소 (갱신 취소 후 만료 시점까지 pro 유지 → 만료 시 전환) | Phase 2 | 만료 전: 무제한 / 만료 후: 1회/일 |

### 전이 규칙

```
가입 → trial  (자동, D-PLAN-2)
trial → pro   (mock-purchase 호출 시)
trial → expired  (7일 경과, D-PLAN-3)
pro → expired    (구독 만료, D-PLAN-3)
pro → cancelled  (명시 취소 — Phase 2 부터)
expired/cancelled → pro   (재구매 시)
expired/cancelled → trial  차단 (Phase 1 deferred, D-PLAN-7)
```

> 정밀 전이 조건 + 불변조건은 후속 `spec-NN-subscription-state-machine` 에서 명세.

### 일일 한도 리셋 (D-PLAN-4)

- `User.timezone` 컬럼 신규 (`VARCHAR`, 기본값 결정은 spec 단계에서)
- 서버 시계 기준으로 사용자 timezone 적용 → 자정 리셋
- 클라이언트 시계 신뢰 안 함 (E4 시나리오 방어)
- `daily_focus` 테이블의 `session_count` 와 연계: 한도 체크 시 사용자 timezone 기준 오늘 날짜의 `session_count` 참조

### 트라이얼 재사용 방지 (D-PLAN-7)

- **Phase 1 deferred** — 내부 테스트 단계이므로 실제 남용 없음
- Phase 2 에서 RevenueCat `introductory_offer_eligibility` (이메일/provider_id 기반) 으로 처리

---

## Consequences

### backend/api (○ 영향)
- `User.subscription_status` ENUM 5값으로 확장: `free / trial / pro / expired / cancelled`
- `User.timezone` VARCHAR 컬럼 신규 (Alembic 마이그레이션)
- `daily_focus` 세션 카운트 체크 로직에 timezone 적용
- 가입 시 `subscription_status = "trial"`, `trial_start_date = today` 자동 설정

### frontend/mobile-fe (○ 간접 영향)
- `GET /users/me` 구독 상태 응답에 5상태 반영 필요
- 상태별 UI 분기 (`expired` / `cancelled` 처리 추가)

### frontend/web-fe (× 없음)
### frontend/shared-fe (× 없음)

### 후속 산출물
- `spec-NN-subscription-state-machine`: 전이 조건·불변조건·타이머 이벤트 정밀 명세
- `policy-NN-daily-quota`: Free 1회/일 기준 이벤트 + timezone 리셋 정책
- `policy-NN-trial`: 7일 고정, 만료 기준 시각(trial_start_date + 7일 자정 UTC vs 168h), 재사용 방지 Phase 2 처리
