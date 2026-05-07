---
id: adr-11
type: adr
title: 월 only $1.99 — 연 플랜 폐기
status: accepted
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[planning-02-payment]]"
supersedes:
  - "[[planning-02-payment#D-PLAN-8]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-12-mock-purchase-api-and-events]]"
  - "[[adr-14-phase1-execution-strategy]]"
tags: [adr, payment, subscription, pricing, monthly-only]
---

# 월 only $1.99 — 연 플랜 폐기

## Summary

planning-02 D-PLAN-8 의 "월+연 2-tier" 권장을 폐기하고, **월 $1.99 단일 플랜**으로 확정. 연 플랜 미운영.

> 이 ADR 은 `planning-02-payment § D-PLAN-8` 을 supersedes 한다.

---

## Context

- `planning-02` D-PLAN-8 권장: "월+연 2-tier" (월 $2.99, 연 $19.99 잠정)
- `paywall.tsx` 현행 UI: 월 $2.99 / 연 $19.99 하드코딩
- `plan-03` P-PLAN-4: 연 가격 미정 처리 → Phase 2 App Store Connect 등록 전까지 보류
- 사용자 비즈니스 결정: **연 플랜 미운영 확정**
- 영향: planning-02 D-PLAN-8 변경, plan-03 P-PLAN-4 폐기, Phase 2 차단 요소 감소

---

## Options

| 안 | 구성 | 장점 | 단점 |
|---|------|------|------|
| A (구 D-PLAN-8 권장) | 월+연 2-tier ($2.99/$19.99) | 연 업셀 가능, 장기 가입 인센티브 | 연 가격 미확정 → App Store Connect 차단 요소 |
| **B (채택)** | **월 only ($1.99/월)** | paywall 단순화, Phase 2 App Store 단일 상품, 연 가격 결정 부담 없음 | 장기 가입 인센티브 없음 |
| C | 평생 license (one-time) | 단건 수익 | 구독 모델 전환 복잡, Phase 1 scope 초과 |

---

## Decision

**B 채택 — 월 $1.99 단일 플랜.**

- paywall UI: 연 플랜 카드 제거 → 월 $1.99 단일 CTA
- `subscription_events.plan` ENUM = `monthly` 만 (yearly 제거)
- Phase 2 App Store Connect: 월 $1.99 단일 상품 등록
- 연 플랜 추가는 Phase 3+ 이후 별도 ADR 로 재검토

**Why**: 사용자 비즈니스 결정. 연 플랜 미운영. 단순한 paywall 이 전환율 이점. App Store Connect 차단 요소(연 가격 미확정) 제거로 Phase 2 진입 빨라짐.

---

## Consequences

### backend/api (○ 영향)
- `subscription_events.plan` ENUM: `yearly` 값 없음 → `monthly` 단일

### frontend/mobile-fe (○ 영향)
- `paywall.tsx`: 연 플랜 카드 UI 제거, 월 $1.99 단일 CTA 표시
- 연 플랜 관련 분기 로직 제거

### frontend/web-fe (× 없음)
### frontend/shared-fe (× 없음)

### 상위 문서 patch
- `planning-02-payment.md` § D-PLAN-8: "~~월+연 2-tier~~ → **월 only $1.99** (adr-11 로 변경)" 명시
- `plan-03-payment-roadmap.md` § P-PLAN-4: **폐기** (adr-11 로 인해 연 가격 결정 자체 무효)
- `plan-03` Phase 2 차단 요소에서 "연 가격 확정 + App Store Connect 연 플랜 등록" 제거 → "월 $1.99 단일 상품 등록"으로 교체
