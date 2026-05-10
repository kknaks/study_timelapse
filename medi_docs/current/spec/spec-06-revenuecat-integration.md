---
id: spec-06
type: spec
title: RevenueCat 통합 API 계약 — verify / webhook / sync endpoint
status: draft
created: 2026-05-09
updated: 2026-05-10
note: "2026-05-10 T-015 patch — Product ID com.studytimelapse.monthly → com.kknaks.studytimelapse.monthly (Bundle ID prefix 통일). 2026-05-09 T-008 patch — auth_service Phase 1 코드 변경 영향 섹션 추가. INITIAL_PURCHASE trial vs pro 분기 명시."
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-15-receipt-verification-dual-path]]"
  - "[[adr-17-refund-policy-store-delegation]]"
  - "[[adr-19-grace-period-handling]]"
  - "[[adr-20-webhook-auth-bearer]]"
  - "[[adr-21-cancel-vs-refund-state-transition]]"
  - "[[adr-22-status-source-cache-with-sync]]"
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-04-subscription-api]]"
  - "[[spec-05-subscription-data-model]]"
  - "[[spec-07-receipt-verification]]"
  - "[[spec-08-mobile-revenuecat-integration]]"
tags: [spec, payment, subscription, revenuecat, api, webhook, idempotency, phase2]
---

# RevenueCat 통합 API 계약 — verify / webhook / sync endpoint

## Summary

Phase 2 에서 추가되는 RevenueCat 연동 REST endpoint 3개의 Request·Response·에러·idempotency·인증 계약. backend(@api) 와 mobile-fe 의 공통 입력.

---

## 1. 개요

| Endpoint | Method | Auth | 목적 | Phase |
|----------|--------|------|------|-------|
| `/api/subscription/verify` | POST | User JWT | 구매 직후 client 가 RevenueCat customer info 전달 → backend 즉시 갱신 (adr-15 경로 A) | 2 |
| `/api/subscription/webhook` | POST | Authorization Bearer | RevenueCat 서버가 push 하는 라이프사이클 이벤트 처리 (adr-15 경로 B, source of truth) | 2 |
| `/api/subscription/sync` | POST | User JWT | 사용자 요청 강제 sync — RevenueCat customer info 직접 조회 → backend 갱신 (adr-22) | 2 |

**Phase 1 유지**: `POST /api/subscription/mock-purchase`, `POST /admin/debug/subscription` 는 staging 유지, prod `ENABLE_MOCK_PURCHASE=false` ENV 가드 (spec-04 그대로).

---

## 2. 공통 사항

### 응답 포맷 (Phase 1 동일)
```json
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": { "code": "ERROR_CODE", "message": "한국어 메시지" } }
```

### 타임스탬프: ISO 8601 UTC (`2026-05-09T12:00:00Z`)

---

## 3. Endpoint 명세

### 3-1. POST /api/subscription/verify

**목적**: 구매 완료 직후 mobile 이 RevenueCat customer info 를 backend 에 전달. backend 는 RevenueCat API 재확인 후 subscription_status 즉시 갱신.

**인증**: User JWT (`Authorization: Bearer <jwt>`)

**Request**
```json
POST /api/subscription/verify
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "app_user_id": "user-uuid",
  "transaction_id": "revenuecat_transaction_id_string",
  "product_identifier": "com.kknaks.studytimelapse.monthly"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `app_user_id` | string | ✓ | RevenueCat app_user_id = backend User.id (adr-18) |
| `transaction_id` | string | ✓ | RevenueCat transaction ID. idempotency key |
| `product_identifier` | string | ✓ | RevenueCat product identifier (adr-11: monthly only) |

**Backend 처리 흐름**
```
1. JWT 에서 user_id 추출 → app_user_id 일치 확인 (불일치 시 403)
2. subscription_events WHERE transaction_id = req.transaction_id → 이미 존재 시 idempotent:true 반환
3. RevenueCat REST API GET /subscribers/{app_user_id} 호출 (위조 방어 — adr-15)
4. customer_info 의 entitlements.active 확인
5. subscription_events INSERT (source='revenuecat', event_type='purchased', transaction_id)
6. User.subscription_status / pro_until 갱신
7. 응답 반환
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "subscription_status": "pro",
    "pro_until": "2026-06-09T12:00:00Z",
    "is_pro": true,
    "grace_until": null,
    "idempotent": false
  }
}
```

| 필드 | 설명 |
|------|------|
| `idempotent` | `true` = 동일 transaction_id 이미 처리됨, 기존 상태 반환 |
| `grace_until` | grace period 종료 시각 (null = 정상) |

**Response 4xx/5xx**

| HTTP | code | 조건 |
|------|------|------|
| 400 | `INVALID_REQUEST` | 필수 필드 누락 |
| 403 | `USER_MISMATCH` | JWT user_id ≠ app_user_id |
| 422 | `REVENUECAT_VERIFICATION_FAILED` | RevenueCat API 조회 실패 또는 entitlement 없음 |
| 429 | `RATE_LIMITED` | 동일 user_id 에서 단시간 과다 요청 |
| 5xx | - | RevenueCat API 일시 장애 시 (client 재시도 1회 권장 — adr-15) |

**Client 재시도 정책 (adr-15 A 결정)**:
- verify 실패(network/5xx) 시 1회 재시도
- 재시도 후 실패 → webhook 대기 안내 (사용자에게 "잠시 후 자동으로 갱신됩니다" 표시)

---

### 3-2. POST /api/subscription/webhook

**목적**: RevenueCat 서버가 push 하는 라이프사이클 이벤트 수신. **webhook = source of truth** (adr-15, adr-20).

**인증**: `Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH_TOKEN>` (adr-20)

**Request** (RevenueCat standard webhook payload)
```json
POST /api/subscription/webhook
Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH_TOKEN>
Content-Type: application/json

{
  "api_version": "1.0",
  "event": {
    "type": "INITIAL_PURCHASE",
    "app_user_id": "user-uuid",
    "transaction_id": "rc_transaction_id",
    "product_id": "com.kknaks.studytimelapse.monthly",
    "expiration_at_ms": 1749470400000,
    "grace_period_expiration_at_ms": null,
    "id": "rc_event_uuid"
  }
}
```

**Backend 처리 흐름**
```
1. Authorization Bearer 헤더 검증 → 불일치 시 401 반환
2. subscription_events WHERE event_id = event.id → 중복이면 idempotent 200 반환
3. user = User WHERE app_user_id = event.app_user_id (없으면 404)
4. 이벤트 분기 처리 (§4 매핑 표)
5. subscription_events INSERT (source='revenuecat', event_id=event.id, transaction_id, raw_payload)
6. User 컬럼 갱신
7. 200 OK 반환 (RevenueCat 이 2xx 받으면 재시도 종료)
```

**Response**: 모든 경우 `200 OK` (idempotent 포함). 401 = 인증 실패 (RevenueCat 재시도 없음).

```json
// 정상 처리
{ "success": true, "data": { "idempotent": false } }

// 중복 이벤트
{ "success": true, "data": { "idempotent": true } }
```

**Response 4xx**

| HTTP | code | 조건 |
|------|------|------|
| 401 | `INVALID_AUTH` | Bearer 토큰 불일치 |
| 404 | `USER_NOT_FOUND` | app_user_id 에 해당 사용자 없음 (RevenueCat 재시도 방지를 위해 200 반환 고려) |

> **설계 주의**: `USER_NOT_FOUND` 를 5xx 로 반환하면 RevenueCat 이 재시도. 404 또는 200 으로 반환하면 재시도 없음. 권장: app_user_id 매핑 실패 시 경고 로그 + 200 반환 (재시도 방지).

---

### 3-3. POST /api/subscription/sync

**목적**: 사용자가 "구독 상태 새로고침" 요청 시 RevenueCat customer info 직접 조회 → backend 강제 갱신 (adr-22 A 결정).

**인증**: User JWT (`Authorization: Bearer <jwt>`)

**Request**: body 없음 (JWT 에서 user_id 추출)

```json
POST /api/subscription/sync
Authorization: Bearer <jwt>
```

**Backend 처리 흐름**
```
1. JWT 에서 user_id 추출
2. RevenueCat REST API GET /subscribers/{user_id} 호출
3. customer_info 파싱 → subscription_status / pro_until / grace_until 최신 값 도출
4. User 컬럼 갱신 (verify 흐름과 동일 로직 재사용)
5. subscription_events INSERT (source='revenuecat', event_type='sync', raw_payload)
6. 갱신된 상태 반환
```

**Response 200** (verify 와 동일 schema)
```json
{
  "success": true,
  "data": {
    "subscription_status": "pro",
    "pro_until": "2026-06-09T12:00:00Z",
    "is_pro": true,
    "grace_until": null
  }
}
```

**Response 4xx**

| HTTP | code | 조건 |
|------|------|------|
| 429 | `RATE_LIMITED` | 동일 user_id 에서 단시간 과다 sync 요청 (권장: 30초 쿨다운) |
| 422 | `REVENUECAT_FETCH_FAILED` | RevenueCat API 일시 장애 |

---

## 4. RevenueCat 이벤트 → subscription_events 매핑 표

| RevenueCat event.type | subscription_events.event_type | subscription_status 전이 | pro_until 처리 | grace_until 처리 | 비고 |
|-----------------------|-------------------------------|--------------------------|-----------------|-------------------|------|
| `INITIAL_PURCHASE` | `purchased` 또는 `trial_started` | **분기 필요 — 아래 표** | `event.expiration_at` | `NULL` | 최초 구매. trial vs pro 구분 필수 |
| `RENEWAL` | `renewed` | `pro 유지` | `event.expiration_at` (갱신) | `NULL` (해제) | 월 갱신 성공 |
| `CANCELLATION` | `cancel_scheduled` | `pro 유지` (pro_until 까지) | 변경 없음 | 변경 없음 | 자발적 갱신 취소. adr-21 |
| `EXPIRATION` | `expired` | `* → expired` | 변경 없음 | `NULL` | adr-21 lazy expiry 또는 즉시 |
| `BILLING_ISSUE` | `billing_issue` | `pro 유지` | 변경 없음 | `event.grace_period_expiration_at` | adr-19 B 결정 |
| `REFUND` | `refunded` | `* → cancelled` (즉시) | `NOW()` | `NULL` | adr-21. 즉시 Pro 박탈 |
| `PRODUCT_CHANGE` | `product_change` | 변경 없음 | — | — | adr-11: monthly only → 발생 X |
| `SUBSCRIBER_ALIAS` | (무시) | — | — | — | app_user_id 변경 이벤트. Phase 2 미처리 |

### INITIAL_PURCHASE trial vs pro 분기 (adr-16 B 결정)

RevenueCat `INITIAL_PURCHASE` 는 introductory offer(trial) 와 일반 구매(pro) 양쪽에서 발생한다. backend 는 `event.period_type` 으로 분기한다.

| `event.period_type` | subscription_status 전이 | event_type | 설명 |
|--------------------|--------------------------|------------|------|
| `TRIAL` | `* → trial` | `trial_started` | RevenueCat introductory offer 7일 무료 시작 |
| `NORMAL` | `* → pro` | `purchased` | 일반 구독 구매 (trial 없이 바로 pro) |
| (기타) | `* → pro` | `purchased` | 보수적 처리: pro 로 간주 |

```python
# webhook 처리 예시 (T-009 구현 참고)
period_type = event.get("period_type", "NORMAL")
if period_type == "TRIAL":
    new_status = "trial"
    event_type = "trial_started"
else:
    new_status = "pro"
    event_type = "purchased"
```

> **Phase 2 신규 가입자**: `INITIAL_PURCHASE` + `period_type=TRIAL` 이 trial 진입의 유일한 trigger. 가입 시 backend 가 trial 을 자동 시작하지 않으므로 이 이벤트가 없으면 `subscription_status='free'` 유지.

---

## 5. Idempotency 정책

### subscription_events 테이블 활용

```python
# webhook 멱등성
def is_duplicate_event(db, event_id: str) -> bool:
    return db.query(SubscriptionEvent).filter_by(event_id=event_id).first() is not None

# verify 멱등성
def is_duplicate_transaction(db, transaction_id: str) -> bool:
    return db.query(SubscriptionEvent).filter_by(transaction_id=transaction_id).first() is not None
```

- **webhook**: `subscription_events` 에 `event_id` 컬럼 추가 (UUID, nullable — Phase 1 없음). 이미 존재 시 200 + `idempotent:true`.
- **verify**: `transaction_id` 기반. 이미 처리된 transaction → idempotent 200.
- **sync**: 멱등 처리 불필요 (항상 RevenueCat 최신 상태 반영). rate limit 으로 남용 방지.

### subscription_events 컬럼 추가 (Phase 2 마이그)

```sql
-- Phase 2 마이그레이션 (grace_until + event_id)
ALTER TABLE users ADD COLUMN grace_until TIMESTAMP NULL;                    -- adr-19 B
ALTER TABLE subscription_events ADD COLUMN event_id VARCHAR(100) NULL;     -- webhook idempotency
ALTER TABLE subscription_events ADD COLUMN transaction_id VARCHAR(100) NULL; -- verify idempotency

CREATE UNIQUE INDEX idx_sub_events_event_id
    ON subscription_events (event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_sub_events_transaction_id
    ON subscription_events (transaction_id) WHERE transaction_id IS NOT NULL;
```

---

## 6. Client Verify 재시도 Sequence (adr-15 A 결정)

```
[Mobile]                              [Backend]              [RevenueCat]
   │  purchasePackage() 성공              │                       │
   │──POST /verify (1차)──────────────────►│                       │
   │  (네트워크/5xx 실패)                 │                       │
   │──POST /verify (재시도 1회)───────────►│                       │
   │                                      │──GET /subscribers/───►│
   │                                      │◄─ customer_info ──────│
   │◄── 200 OK (pro) ────────────────────│                       │
   │  (재시도도 실패 시)                  │                       │
   │  사용자에게 "잠시 후 자동 갱신" 표시 │                       │
   │                          (백그라운드)│                       │
   │                                      │◄── webhook event ─────│
   │◄── GET /users/me → 최신 상태 ───────│                       │
```

---

## 7. Webhook 인증 (adr-20)

```python
# FastAPI dependency
def verify_webhook_auth(authorization: str = Header(None)):
    expected = f"Bearer {settings.REVENUECAT_WEBHOOK_AUTH_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail={"code": "INVALID_AUTH"})
```

**ENV 미설정 시**: webhook 라우터 미등록 (Phase 1 debug API 패턴 답습).

---

## 8. GET /api/users/me 확장 (Phase 2)

Phase 1 V2 응답에 `grace_until` 필드 추가:

```json
{
  "success": true,
  "data": {
    ...기존 필드 유지...,
    "grace_until": null,
    "subscription_status": "pro",
    "pro_until": "2026-06-09T12:00:00Z"
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `grace_until` | datetime\|null | grace period 종료 시각. null = 정상 구독 또는 grace 아님 |

---

## 9. Phase 1 코드 변경 영향 (adr-16 B 결정)

### auth_service.py — 가입 시 trial 자동 시작 제거 (T-009 구현 대상)

```python
# 현재 Phase 1 코드 (auth_service.py:142-165) — 제거 대상
user = User(
    ...
    subscription_status="trial",      # ← 'free' 로 교체
    trial_start_date=today_utc,       # ← None 으로 교체
    is_pro=True,                      # ← False 로 교체
    ...
)
await event_repo.create(
    user_id=user.id,
    event_type="trial_started",       # ← 이 INSERT 전체 제거
    source="system",
    plan="monthly",
)
```

Phase 2 목표 상태:
```python
user = User(
    ...
    subscription_status="free",
    trial_start_date=None,
    is_pro=False,
    ...
)
# subscription_events INSERT 없음 (가입 시점)
```

**Phase 1 기존 사용자 데이터**: 변경 없음. 이미 박힌 `trial_start_date` + `subscription_status='trial'` 그대로 보존. `source='system'` trial_started 이력 유지.

---

## 10. 영향 범위

- **backend/api** ○: endpoint 3개 신규. users.grace_until 컬럼 추가 마이그. subscription_events event_id/transaction_id 컬럼 추가 마이그. GET /users/me 응답 grace_until 추가. **auth_service.py 가입 로직 변경 (adr-16 B, T-009)**.
- **frontend/mobile-fe** ○: verify 호출 추가. sync endpoint 호출 추가. **온보딩 trial 안내 페이지 추가 (T-010)**. spec-08 참조.
- **frontend/web-fe** ×
- **frontend/shared-fe** ×
