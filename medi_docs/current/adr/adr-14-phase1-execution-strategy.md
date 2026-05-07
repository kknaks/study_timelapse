---
id: adr-14
type: adr
title: Phase 1 실행 전략 — 1a 완료 후 1b/1c 병렬 + DoD 단일 디바이스
status: accepted
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[planning-02-payment]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-11-monthly-only-no-yearly]]"
  - "[[adr-12-mock-purchase-api-and-events]]"
  - "[[adr-13-anonymous-paywall-and-terms]]"
tags: [adr, payment, phase1, execution, dod, parallel]
---

# Phase 1 실행 전략 — 1a 완료 후 1b/1c 병렬 + DoD 단일 디바이스

## Summary

Phase 1a (backend DB + API) 완료 후 1b (paywall 연동) + 1c (약관 UI) 를 병렬 시작. Phase 1 DoD = 단일 디바이스 검증.

---

## Context

- Phase 1 sub-phase: 1a (backend) / 1b (paywall) / 1c (약관)
- 직렬 vs 병렬 trade-off
- Phase 1 DoD 범위 — "다중 디바이스 동일 상태" 포함 여부
- plan-03 P-PLAN-1 (병렬 방식) + P-PLAN-2 (DoD 정의) 통합 결정

---

## Options

### Phase 1 내부 진행 방식 (P-PLAN-1)

| 안 | 진행 방식 | 납기 | 재작업 위험 |
|---|----------|------|----------|
| **A** | **1a API 계약 확정 즉시 1b/1c 병렬 시작** | 최단 | API 계약 변경 시 1b 일부 재작업 |
| B | 1a 완전 완료 후 1b/1c 직렬 시작 | 가장 김 | 없음 |
| C | 1a/1b/1c 모두 병렬 (API 계약 전에 1b 시작) | 짧음 | 1b 대규모 재작업 위험 |

### DoD 범위 (P-PLAN-2)

| 항목 | 포함 여부 |
|------|---------|
| 가입 즉시 trial 자동 시작 | 필수 |
| mock-purchase 1탭 → Pro 전환 | 필수 |
| Pro 기능: 워터마크 제거 + 프로그레스바 | 필수 |
| Free: 1회/일 초과 → paywall 차단 | 필수 |
| 트라이얼 7일 만료 → free 전환 | 필수 |
| debug API prod 404 확인 | 필수 |
| 가입 + paywall 약관 노출 | 필수 |
| subscription_events append-only 감사 이력 | 필수 |
| **다중 디바이스 동일 상태 반영** | **제외 (P-PLAN-2 결정)** |

---

## Decision

**A + 단일 디바이스 DoD 채택.**

### 진행 순서

```
Phase 1a — backend (DB + API)  ← 선행 없음, 즉시 시작
  [subscription_events 테이블, mock-purchase API, debug API]
  [GET /users/me 구독 상태 확장]
  ↓
  API 계약 확정 (spec-NN-subscription-api)
  ↓
Phase 1b — mobile-fe 연동    Phase 1c — 약관 UI     ← 동시 시작
  [paywall mock-purchase 연동]  [가입/paywall 약관]
  [Feature Table 교체]
  [Free 가드 + 트라이얼 배지]
```

### Phase 1 DoD

단일 디바이스(시뮬레이터 또는 실기 1대)에서 아래 5개 시나리오 통과:
1. 가입 → trial 자동 시작 확인
2. mock-purchase 호출 → Pro 전환 → 워터마크 제거 + 프로그레스바 노출
3. Free 1회/일 초과 → paywall 차단
4. 트라이얼 7일 만료 → free 자동 전환 (시뮬레이션)
5. 약관 동의 이력 저장 (`terms_agreed_at`, `privacy_agreed_at`)

**Why**:
- 1a 후 병렬: API spec 확정 시점 기준 → 재작업 위험 최소화, 전체 Phase 1 납기 단축
- 단일 디바이스 DoD: 서버 SSOT 구조상 다중 디바이스 동기화는 자동 보장. 별도 검증 비용 없이 Phase 2 RevenueCat 연동 시 자연스럽게 노출
- 다중 디바이스 검증은 Phase 2 에서 다룸

---

## Consequences

### backend/api (○ 간접 영향)
- 1a 완료 시점에 spec-NN-subscription-api 확정 → 1b/1c 병렬 트리거
- Phase 1 회귀 테스트: 단일 디바이스 시뮬레이터/실기 1대 기준

### frontend/mobile-fe (○ 간접 영향)
- 1a API 계약 확정 후 1b/1c 동시 시작
- DoD 5개 시나리오 기준으로 수용 테스트 진행

### frontend/web-fe (× 없음)
### frontend/shared-fe (× 없음)

### admin 작업 분배
- 1a backend task 발행 → 1a 완료 시 1b/1c mobile-fe task 동시 발행
- Phase 1 완료 판단: DoD 5개 시나리오 + debug API prod 404 + append-only 이력 확인

### Phase 2 이월
- 다중 디바이스 동기화 검증은 Phase 2 RevenueCat 연동 시 자연스럽게 다룸
- P-PLAN-4(연 가격) 폐기로 Phase 2 차단 요소 = "App Store Connect 월 $1.99 단일 상품 등록" 만
