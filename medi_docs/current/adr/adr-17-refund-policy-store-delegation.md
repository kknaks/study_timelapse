---
id: adr-17
type: adr
title: 환불 정책 — Apple/Google 스토어 위임, 회사 직접 환불 없음
status: accepted
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-21-cancel-vs-refund-state-transition]]"
  - "[[adr-11-monthly-only-no-yearly]]"
tags: [adr, payment, subscription, revenuecat, refund, policy, phase2]
---

# 환불 정책 — Apple/Google 스토어 위임, 회사 직접 환불 없음

## Summary

Phase 2 환불은 Apple/Google 스토어 정책에 전면 위임(D-PLAN-2-4 A). 회사가 직접 일할 환불을 처리하지 않음. `policy-05-subscription-refund` 의 일할 환불 조항을 스토어 위임 문구로 교체.

---

## Context

- Phase 1: `policy-05-subscription-refund` 초안에 일할 환불 조항 포함 (미확정)
- Phase 2: in-app purchase (RevenueCat SDK 통해 Apple/Google 결제 시트)로 결제
- in-app purchase 의 환불은 Apple/Google 이 처리하는 것이 표준. 스토어 외 결제 수단 없으면 회사 직접 환불 현실적으로 불가
- planning-03 D-PLAN-2-4 결정

---

## Options

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **Apple/Google 위임** — 스토어 정책으로 처리, 회사 개입 없음 | 운영 부담 0. in-app purchase 기본. 한국 결제법도 스토어가 대행 | 회사가 환불 조건 커스터마이징 불가 |
| B | 회사 직접 환불 — 잔여 일수 일할 환불 | 사용자 유연성. policy-05 초안 내용 | 백오피스 어드민 구현 필요. 스토어 외 결제 수단 없으면 현실적으로 불가 |
| C | A 기본 + 특수 케이스만 B | 대부분 자동 + 예외 처리 가능 | 기준 불명확, 운영 부담 발생 |

---

## Decision

**A 채택 — Apple/Google 스토어 환불 위임.**

### 환불 이벤트 처리 (adr-21 연동)

- RevenueCat `REFUND` / `CANCELLATION`(영수증 무효화) 이벤트 수신 → backend 즉시 `subscription_status='cancelled'` + `pro_until=현재시각`
- 상세 전환 로직은 adr-21 참조

### policy-05 갱신 방향

- 기존 일할 환불 조항 → "환불은 해당 앱스토어(Apple App Store / Google Play Store)의 환불 정책을 따릅니다" 문구로 교체
- 환불 문의 안내: 스토어 고객센터 링크 제공 (앱 설정 화면 또는 약관 본문)
- `policy-05-subscription-refund` 갱신은 P2.1 task

**Why**: in-app purchase 기반에서는 Apple/Google 이 영수증을 보유하며 환불 처리 주체. 회사 직접 환불은 스토어 약관 위반 소지 있음. 운영 부담 0 = 초기 스타트업에 최적.

---

## Consequences

### backend/api (○ 간접)
- 환불 이벤트 처리: adr-21 의 즉시 cancelled 전환 로직 구현
- 스키마 변경 없음 (Phase 1 subscription_events + User 컬럼 재사용)

### frontend/mobile-fe (○ 간접)
- 설정 화면에 "환불은 앱스토어를 통해 요청하세요" 안내 문구 + 스토어 링크 추가 (spec 단계 확정)

### frontend/web-fe (×)
### frontend/shared-fe (×)

### 후속 필요
- `policy-05-subscription-refund` 갱신 — 일할 환불 조항 → 스토어 위임 문구 (P2.1 task)
- CS 가이드: 환불 문의 수신 시 스토어 고객센터 안내 절차
