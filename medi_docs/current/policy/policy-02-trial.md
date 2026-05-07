---
id: policy-02
type: policy
title: 트라이얼 정책 — 7일 무료 체험 시작·만료·사전 알림 규칙
status: draft
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[adr-10-subscription-state-model]]"
related_to:
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-05-subscription-data-model]]"
  - "[[policy-01-daily-quota]]"
tags: [policy, payment, subscription, trial]
---

# 트라이얼 정책 — 7일 무료 체험 시작·만료·사전 알림 규칙

## Summary

신규 가입자는 가입 즉시 7일 Pro 체험이 자동 시작. 만료 시 `expired` 상태로 전환 + 앱 내 배너. 재사용 방지는 Phase 1 deferred. 트라이얼 중 결제 시 즉시 pro 전환, 잔여 트라이얼 소멸.

---

## 1. 개요

7일 트라이얼은 Pro 전환율 제고를 위한 핵심 도구다. 가입 즉시 Pro 를 경험하게 함으로써 만료 시 유료 전환 동기를 만든다. 이 문서는 트라이얼의 시작·만료·권한·재사용 방지·사전 알림 규칙을 정의한다.

---

## 2. 적용 범위

- **대상**: 가입 완료된 모든 신규 사용자
- **예외**: Phase 1 에서는 트라이얼 재진입도 허용 (테스트 편의 — Phase 2 에서 차단). 기존 `free`/`expired`/`cancelled` 사용자가 재가입 시 트라이얼 재시작 가능.

---

## 3. 시작 규칙

| 항목 | 값 | 근거 |
|------|---|------|
| 시작 시점 | **가입 즉시 자동** | D-PLAN-2 (adr-10) |
| 시작 기록 | `User.trial_start_date = now() (UTC)` | `Date` 타입 (UTC 날짜) |
| 클라이언트 액션 | 불필요 | 서버 가입 처리 내 자동 |
| subscription_status | 가입 즉시 `'trial'` | 실제 `free` 상태 노출 없음 |

**가입 트랜잭션 side-effect**:
- `User.subscription_status = 'trial'`
- `User.trial_start_date = today (UTC)`
- `User.is_pro = true`
- `subscription_events` INSERT (event_type='trial_started', source='system')

---

## 4. 트라이얼 동안 권한

trial 상태는 Pro 와 동등한 모든 권한을 갖는다:

| 기능 | Free | Trial | Pro |
|------|:---:|:---:|:---:|
| 일일 녹화 횟수 | 1회 | **무제한** | 무제한 |
| 워터마크 | 있음 | **없음** | 없음 |
| 프로그레스바 | 🔒 | **사용 가능** | 사용 가능 |

trial 배지 표시: 앱 내 "7일 무료 체험 중 (N일 남음)" 배지 표시 (mobile-fe 책임, spec-04 GET /users/me `banner_alert` 참조).

---

## 5. 만료 규칙

### 만료 기준 시각

| 항목 | 값 |
|------|---|
| 만료 = | `trial_start_date + INTERVAL '7 days'` (UTC 날짜 기준) |
| 구체 시각 | `trial_start_date + 7일의 00:00:00 UTC` |
| 예시 | 5월 1일 가입 → 5월 8일 00:00:00 UTC 에 만료 |

> `trial_start_date` 는 UTC `Date` 타입. 만료 시각 = 해당 날짜의 자정 UTC. 168시간 floating 방식 미채택 (사용자 예측 가능성 우선).

### 만료 후 상태

**`trial` → `expired`** (5상태 머신 T3 전이)

| 항목 | 값 |
|------|---|
| 전이 후 상태 | `expired` |
| `free` 미전환 이유 | `free` = 트라이얼 미경험 상태, `expired` = 트라이얼 경험 후 만료. 의미 구분 명확히 하기 위해 분리 |
| 기능 제한 | Free 와 동일 (일일 1회 한도, 워터마크 복귀, 프로그레스바 🔒) |
| 재구매 | 즉시 mock-purchase 가능 → `expired → pro` 전환 |

### 만료 감지 방식

1. **Lazy check** (Phase 1 필수): `GET /users/me` 호출 시 서버가 `trial_start_date + 7일 ≤ now()` 확인 → 즉시 T3 전이 수행 후 `expired` 반환
2. **Cron** (Phase 1 권장 추가): 매 시간 만료 체크 → 앱 미열람 사용자도 서버 상태 동기화

---

## 6. 사전 알림

### Phase 1 알림 방식: 앱 내 배너만

| 시점 | 알림 내용 | 방법 |
|------|---------|------|
| 만료 24시간 전 | "Pro 체험이 24시간 후 종료됩니다." | 앱 내 배너 (spec-04 `banner_alert: "trial_expiring_24h"`) |
| 만료 1시간 전 | "Pro 체험이 1시간 후 종료됩니다." | 앱 내 배너 (`"trial_expiring_1h"`) |
| 만료 후 | "Pro 체험이 종료되었습니다. 구독하면 계속 이용할 수 있습니다." | 앱 내 배너 (`"trial_expired"`) |
| **푸시 알림** | Phase 3 에서 별도 구현 | — |

**트리거 계산**: 서버가 `GET /users/me` 응답 시 `trial_start_date + 7일` 과 현재 시각 차이를 계산 → `banner_alert` 값 결정. 클라이언트는 값을 표시만 함 (계산 로직 서버 집중).

---

## 7. 만료 후 사용자 동작

| 사용자 행동 | 서버 동작 |
|-----------|---------|
| mock-purchase 호출 | `expired → pro` 전환 (T7). `pro_until = now() + 30d` |
| 일반 녹화 시도 | 일일 한도 체크 적용 (`expired` = Free 와 동일, policy-01 참조) |
| paywall 진입 | 구매 버튼 활성 |

---

## 8. 결제 후 트라이얼 (trial 중 mock-purchase 호출)

**채택: A — 즉시 pro 전환, 남은 트라이얼 소멸 + pro_until = now() + 30일**

| 안 | 동작 | 사용자 관점 | 비고 |
|---|------|-----------|------|
| **A (채택)** | `trial → pro`, `pro_until = now() + 30d` | 구독 시작일 = 구매 시각. 잔여 트라이얼 소멸 | 단순·예측 가능 |
| B | `trial → pro`, `pro_until = trial_end + 30d` | 남은 트라이얼 + 30일 | 사용자에게 유리하나 구현 복잡 + 비즈니스 손해 |
| C | trial 완료까지 trial 유지, 만료 시 pro 전환 | 구매 즉시 미반영 | 사용자 혼란 (Pro 상태 확인 지연) |

**Why A**: Phase 1 구현 단순, 결제 즉시 상태 반영으로 사용자 혼란 없음. Pro 구독 30일 = 구매 시각부터 명확하게 계산.

side-effect (T2 전이):
- `subscription_status = 'pro'`
- `pro_until = now() + 30d`
- `is_pro = true`
- `subscription_events` INSERT (event_type='purchased', source='mock')

---

## 9. 트라이얼 재사용 방지

| Phase | 방지 여부 | 방법 |
|-------|:--------:|------|
| **Phase 1** | ✗ 방지 안 함 | 내부 테스트 단계, 실 사용자 없음. 테스트 편의상 재가입 시 트라이얼 재시작 허용 (D-PLAN-7) |
| Phase 2 | ✓ | RevenueCat `introductory_offer_eligibility` — 이메일/provider_id 기반 |

Phase 1 에서는 기존 `expired`/`cancelled` 사용자가 새 계정으로 가입 시 트라이얼 재시작 가능. 의도적 허용이므로 버그 아님.

---

## 10. Edge Case

| # | 시나리오 | 동작 |
|---|---------|------|
| E1 | timezone 변경 시 trial_start_date 영향 | 없음. `trial_start_date` 는 UTC Date 타입으로 저장. 만료 시각 계산은 서버 UTC 기준. timezone 변경이 트라이얼 만료에 영향 없음 |
| E2 | 트라이얼 만료 직전 mock-purchase | T2 전이 (trial → pro). 만료와 구매가 동시에 발생해도 서비스 레이어에서 현재 상태 재확인 후 pro 전환 처리. 락 경합 시 멱등 처리 |
| E3 | subscription_events trial_started / trial_expired 기록 | trial_started: 가입 트랜잭션에서 INSERT (source='system'). trial_expired: T3 전이 시 INSERT (source='system', event_type='trial_expired') |
| E4 | 가입 후 앱 미열람 7일 경과 | lazy check — 첫 `GET /users/me` 호출 시 즉시 T3 전이 + `expired` 반환. 사용자 입장에서는 앱을 열 때 이미 만료 상태 |
