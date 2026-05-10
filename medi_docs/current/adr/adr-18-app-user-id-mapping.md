---
id: adr-18
type: adr
title: RevenueCat app_user_id ↔ backend user_id 매핑 — 가입 즉시 logIn
status: accepted
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-13-anonymous-paywall-and-terms]]"
  - "[[adr-16-introductory-offer-and-auto-renewal]]"
tags: [adr, payment, subscription, revenuecat, user-id, mapping, auth, phase2]
---

# RevenueCat app_user_id ↔ backend user_id 매핑 — 가입 즉시 logIn

## Summary

RevenueCat `app_user_id` 를 backend `user_id` 와 1:1 매핑. 가입 직후 `Purchases.logIn(user_id)` 호출(D-PLAN-2-7 A). 디바이스 변경/재설치 시 RevenueCat customer info 자동 복원. anonymous 사용자는 Phase 1 정책(paywall 차단) 그대로 유지.

---

## Context

- RevenueCat SDK 는 `app_user_id` 로 구독 이력을 추적
- 미설정 시 anonymous ID 자동 생성 → backend user_id 와 매핑 불일치, 디바이스 변경 시 구독 복원 불가
- Phase 1: 인증 필수 paywall (adr-13: 비로그인 사용자 paywall 차단)
- planning-03 D-PLAN-2-7 결정

---

## Options

| 안 | 매핑 시점 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **가입 즉시** — `Purchases.logIn(user_id)` 호출 | 구현 단순. RevenueCat 이력 = backend 이력 1:1 일치. 디바이스 복원 자동 | 가입 시점 RevenueCat SDK 초기화 필요 |
| B | 결제 시점 — paywall 도달 시 logIn | SDK 초기화 지연 가능 | 가입~paywall 사이 anonymous ID 사용 → merge 처리 필요 |
| C | 익명 결제 후 가입 시 merge — anonymous ID → user_id logIn | 로그인 전 결제 지원 가능 | Phase 1 정책(adr-13: 인증 필수)과 상충. merge 복잡도 |

---

## Decision

**A 채택 — 가입 즉시 `Purchases.logIn(user_id)` 호출.**

### logIn 규칙

```
[가입 완료 직후]
  ↓
Purchases.logIn(backend_user_id)
  → RevenueCat app_user_id = backend User.id (UUID 또는 PK)
  → 기존 anonymous customer info 있으면 RevenueCat 이 자동 merge
```

### user_id 식별자 규칙

- `user_id` = backend `User.id` (UUID 또는 PK)
- stable identifier (변경 없음). 재가입/탈퇴 후 재가입 시 동일 user_id 재사용 여부 = spec 단계 확정

### 디바이스 변경 / 재설치 복원

- 동일 Apple/Google 계정 로그인 후 앱 실행 → `Purchases.logIn(user_id)` 호출 → RevenueCat customer info 자동 복원 → backend sync
- 복원 성공 시 앱에 "구독을 복원했습니다" 안내 (spec 단계 UX 확정)

### anonymous 사용자 처리 (Phase 1 정책 유지)

- adr-13 결정 그대로: 인증되지 않은 사용자가 paywall 도달 시 로그인 유도
- 게스트 결제 후 가입 시 구독 복원: Phase 2 미지원 (Phase 2 비목표, planning-03 §6)
- `Purchases.configure()` 는 앱 초기화 시 항상 호출 (anonymous ID 로 초기화). 로그인 완료 후 `logIn(user_id)` 로 교체

**Why**: Phase 1 인증 필수 정책과 일관. RevenueCat ↔ backend 1:1 매핑으로 구독 이력 단순화. 구현 최단순.

---

## Consequences

### backend/api (×)
- 추가 엔드포인트 불필요. `user_id` 는 기존 인증 토큰에서 추출

### frontend/mobile-fe (○)
- 가입 완료 직후 `Purchases.logIn(user_id)` 호출 추가
- 앱 초기화 시 `Purchases.configure(REVENUECAT_API_KEY)` 호출 (anonymous ID 초기화)
- 재설치/디바이스 변경 후 로그인 완료 시 `Purchases.logIn(user_id)` 호출 → customer info 복원

### frontend/web-fe (×)
### frontend/shared-fe (×)

### 추가 결정 항목 (발견)
- **anonymous 사용자가 paywall 도달 시**: Phase 1(adr-13) 정책 그대로 — 로그인 유도. Phase 2 에서 변경 없음. RevenueCat anonymous user ID 활용 불필요.
- **재가입 시 동일 user_id 재사용 여부**: 탈퇴 후 재가입 사용자의 RevenueCat 이력 처리 — spec 단계에서 확정 필요.
