---
id: adr-15
type: adr
title: 영수증 검증 이중 경로 — client verify + RevenueCat webhook
status: accepted
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-12-mock-purchase-api-and-events]]"
  - "[[adr-22-status-source-cache-with-sync]]"
  - "[[adr-20-webhook-auth-bearer]]"
tags: [adr, payment, subscription, revenuecat, receipt-verification, webhook, phase2]
---

# 영수증 검증 이중 경로 — client verify + RevenueCat webhook

## Summary

RevenueCat 결제 완료 후 backend subscription_status 를 갱신하는 경로를 **client `POST /api/subscription/verify` + RevenueCat webhook 이중 경로(D-PLAN-2-1 C)** 로 결정. webhook 이 source of truth 이며, 충돌 시 webhook 우선. idempotency key 는 `transaction_id`.

---

## Context

- Phase 1 에서는 `POST /api/subscription/mock-purchase` 로 backend 직접 상태 변경
- Phase 2 에서는 RevenueCat SDK → Apple/Google 영수증 검증 → RevenueCat customer info 발급 흐름으로 전환
- 결제 완료 직후 즉시 Pro unlock UX 와, 환불·취소·갱신·grace-period 등 라이프사이클 이벤트 처리 모두 충족해야 함
- planning-03 §2-1 의 RevenueCat ↔ backend 동기화 흐름 요구 (D-PLAN-2-1)

---

## Options

| 안 | trigger | 장점 | 단점 |
|---|---------|------|------|
| A | **client → `POST /api/subscription/verify`** (구매 직후 mobile 이 RevenueCat customer info 를 backend 에 전달) | 결제 후 즉시 backend 갱신, UX 지연 없음 | 네트워크 실패 시 재시도 로직 필요. client 위조 방어 필요 |
| B | **RevenueCat webhook → backend 단독** | 서버-to-서버, 위조 불가. 모든 라이프사이클 이벤트 포함 | 수신 지연(수 초~수 분). 구매 직후 Pro unlock UX 에 지연 발생 가능 |
| **C** | **A + B 이중 경로** (webhook = source of truth, 충돌 시 webhook 우선) | 구매 즉시 Pro unlock (A) + 라이프사이클 이벤트 처리 (B). RevenueCat Best Practice | 구현 복잡도 증가. A/B 중복 이벤트 멱등 처리 필요 |

---

## Decision

**C 채택 — client verify + webhook 이중 경로.**

### 흐름

```
[Mobile App]
  ↓ Purchases.purchasePackage() 완료
  ↓ RevenueCat customer info 수신
  ↓
  ├─ POST /api/subscription/verify (즉시 Pro unlock — 경로 A)
  │    → backend: RevenueCat API 재확인 후 subscription_status='pro' 갱신
  │    → subscription_events INSERT (source='revenuecat', transaction_id)
  │
  └─ [RevenueCat Server]
       ↓ webhook push → POST /api/subscription/webhook (경로 B)
            → source of truth. 환불/취소/갱신/grace-period 처리
            → 충돌 시 webhook 우선
```

### 멱등성 규칙

- `subscription_events` 의 `transaction_id` 컬럼 기반
- 동일 `transaction_id` 중복 INSERT 차단 (Phase 1 mock-purchase 멱등 패턴 답습)
- A 경로와 B 경로 모두 동일 `transaction_id` 사용 → 중복 이벤트 방어

### webhook = source of truth 규칙

- A 경로(client verify) 로 상태 갱신 후, B 경로(webhook) 수신 시 webhook 정보 우선 적용
- 환불·취소 이벤트는 webhook 만 처리 (client verify 는 구매 이벤트에만 사용)

**Why**: RevenueCat 공식 Best Practice. client verify 로 즉시 UX 보장, webhook 으로 라이프사이클 완결성 확보. Phase 1 멱등 패턴 재사용.

---

## Consequences

### backend/api (○)
- `POST /api/subscription/verify` 신규 엔드포인트 구현 필요
  - RevenueCat customer info 수신 → RevenueCat API 재확인 (위조 방어)
  - `subscription_events` INSERT (`source='revenuecat'`, `transaction_id`)
  - `User.subscription_status / pro_until` 갱신
- `POST /api/subscription/webhook` 신규 엔드포인트 구현 필요 (adr-20 Bearer 검증 포함)
- `subscription_events` 테이블: 스키마 변경 없음 (Phase 1 `source` 컬럼 이미 'revenuecat' 포함, `transaction_id` 컬럼 활용)
- 멱등성: `transaction_id` 유니크 제약 또는 중복 체크 로직 필요

### frontend/mobile-fe (○)
- 구매 완료 후 `POST /api/subscription/verify` 호출 로직 추가
- RevenueCat customer info 를 verify endpoint 에 전달

### frontend/web-fe (×)
### frontend/shared-fe (×)

### 추가 결정 항목 (발견)
- **client verify 실패 시 재시도 정책**: verify 호출 실패 시 webhook 만 신뢰할지, 재시도할지 — **권장: 1회 재시도 후 실패 시 webhook 대기**. verify 실패해도 webhook 으로 복원 가능하므로 무한 재시도 불필요. spec 단계에서 재시도 횟수/간격 명세 결정.
