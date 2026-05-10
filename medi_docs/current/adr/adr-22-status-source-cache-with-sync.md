---
id: adr-22
type: adr
title: subscription_status 신뢰원 — backend 캐시 + webhook sync
status: accepted
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-15-receipt-verification-dual-path]]"
  - "[[adr-19-grace-period-handling]]"
  - "[[adr-21-cancel-vs-refund-state-transition]]"
tags: [adr, payment, subscription, revenuecat, source-of-truth, cache, sync, phase2]
---

# subscription_status 신뢰원 — backend 캐시 + webhook sync

## Summary

앱의 구독 상태 조회는 `GET /users/me` → backend `subscription_status + pro_until` 캐시 기준(D-PLAN-2-11 B). webhook 으로 backend 최신 유지. 구매 직후 adr-15 client verify 경로로 즉시 sync. **client 강제 sync endpoint (`POST /subscription/sync`) 추가 결정 포함**.

---

## Context

- Phase 1: `GET /users/me` → backend `subscription_status + pro_until` 으로 구독 상태 반환
- Phase 2: RevenueCat 이 실제 결제 상태 source of truth 이지만, 앱이 RevenueCat SDK 를 직접 조회할 경우 Phase 1 API 구조 변경 필요
- RevenueCat SDK 오프라인 시 fallback, 앱 cold start 시 상태 로딩 성능 고려
- planning-03 D-PLAN-2-11 결정

---

## Options

| 안 | 신뢰원 | 장점 | 단점 |
|---|--------|------|------|
| A | **RevenueCat customer info 우선** — 앱 시작 시마다 `Purchases.getCustomerInfo()` | 항상 최신 | Phase 1 API 구조 변경 필요. SDK 오프라인 시 fallback 복잡 |
| **B** | **backend 캐시 우선 + webhook sync** — `GET /users/me` 로 조회, webhook 으로 backend 최신 유지 | Phase 1 API 구조 유지. 오프라인 fallback 자연스럽게 처리 | webhook 지연 시 일시적 상태 불일치 (수 초~수 분). 보완: D-PLAN-2-1 C 경로로 즉시 sync |
| C | RevenueCat + backend 동시 조회, 불일치 시 RevenueCat 우선 | 이론적 정합 최대 | 구현 복잡도 최대. API 호출 2배 |

---

## Decision

**B 채택 — backend 캐시 + webhook sync.**

### 상태 조회 흐름

```
[앱 시작 / 상태 확인]
  ↓
GET /users/me
  → subscription_status + pro_until + grace_until (adr-19 B 결정 시)
  ← 캐시 기준 응답 (webhook 으로 최신 유지)

[구매 직후]
  ↓
POST /api/subscription/verify (adr-15 경로 A)
  → 즉시 backend 갱신 → GET /users/me 다음 호출 시 갱신된 값

[RevenueCat webhook 수신]
  → POST /api/subscription/webhook (adr-15 경로 B)
  → backend subscription_status + pro_until 갱신
```

### 오프라인 / SDK fallback

| 상황 | 동작 |
|------|------|
| 네트워크 없음 | 앱의 마지막 캐시 상태(`GET /users/me` 마지막 응답) 표시. RevenueCat SDK 로컬 캐시도 보조 |
| RevenueCat SDK 초기화 실패 | backend `GET /users/me` 로 fallback. Pro 상태 유지 (planning-03 E10 시나리오) |
| webhook 누락 (RevenueCat 재시도 전) | 앱 재시작 또는 강제 sync 시 최신 상태 반영 |

### 강제 sync endpoint 결정 (`POST /subscription/sync`)

**추가 결정 포함**: webhook 누락/실패 대응용 client 강제 sync endpoint.

| 안 | 설명 | Pros | Cons |
|---|------|------|------|
| **A** | **`POST /subscription/sync` 추가** — client 가 RevenueCat customer info 를 backend 에 강제 갱신 요청 | webhook 누락/실패 시 사용자가 결제 후 stale 상태 해소 가능. "구독 상태 새로고침" 버튼 UX 지원 가능 | endpoint 1개 추가 + RevenueCat API 호출 비용 |
| B | webhook 재시도에만 의존, sync endpoint 없음 | 구현 최단순 | webhook 누락 시 사용자가 결제 후에도 Free 상태 유지 가능 (stale 기간 수 분~수십 분) |

**권장: A** — webhook 누락/실패 는 드물지만, 결제 성공 후 Free 상태 유지는 사용자 신뢰 저하 원인. "구독 상태 새로고침" UX 는 사용자 셀프 해소 경로 제공. RevenueCat API 호출 비용 = 사용자 요청 시에만 발생.

**Why**: Phase 1 API 구조 유지로 mobile/backend 변경 최소화. webhook 으로 backend 최신 유지 = 대부분의 상황에서 충분. 강제 sync 는 예외 케이스 대응 안전망.

---

## Consequences

### backend/api (○)
- `GET /users/me` 응답 유지 (Phase 1 V2 구조 그대로)
- webhook 처리로 `subscription_status + pro_until` 자동 갱신 (adr-20 Bearer 인증)
- **`POST /subscription/sync` 추가** (A 결정 시): RevenueCat API 호출 → customer info 기준 backend 상태 갱신

### frontend/mobile-fe (○)
- 구독 상태 조회: `GET /users/me` 그대로 사용
- (선택) "구독 상태 새로고침" 버튼 → `POST /subscription/sync` 호출 (spec 단계 UX 확정)

### frontend/web-fe (×)
### frontend/shared-fe (×)

### Phase 1 자산 재확인
- `GET /users/me` Phase 1 V2 응답에 `subscription_status + pro_until + is_pro` 포함 여부 확인 필요
- `is_pro` 캐시 컬럼: Phase 2 에서 deprecated 표시 예정 (P2.5). Phase 2 에서는 `subscription_status` 단일 기준
