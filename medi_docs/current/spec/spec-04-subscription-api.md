---
id: spec-04
type: spec
title: 구독 API 계약 — mock-purchase / debug / GET users/me 확장
status: draft
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[adr-12-mock-purchase-api-and-events]]"
  - "[[adr-13-anonymous-paywall-and-terms]]"
  - "[[adr-10-subscription-state-model]]"
related_to:
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-05-subscription-data-model]]"
tags: [spec, payment, subscription, api, rest, mock-purchase]
---

# 구독 API 계약 — mock-purchase / debug / GET users/me 확장

## Summary

Phase 1 구독 관련 REST API 3개의 Request·Response·에러 코드 계약. backend @api 와 mobile-fe @paywall 이 이 spec 을 공유 입력으로 사용.

---

## 1. 개요

Phase 1 신규/확장 엔드포인트:

| 엔드포인트                                  | 목적                       | 인증          | 환경           |
| -------------------------------------- | ------------------------ | ----------- | ------------ |
| `POST /api/subscription/mock-purchase` | paywall "구매" 버튼 → Pro 전환 | 필수 (JWT)    | prod + stage |
| `POST /admin/debug/subscription`       | 스테이지 환경 구독 상태 강제 전환      | 필수 + ENV 가드 | stage only   |
| `GET /api/users/me` (확장)               | 구독 상태 + 일일 한도 + 배너 알림 포함 | 필수 (JWT)    | prod + stage |

---

## 2. 공통 사항

### 인증
- 모든 엔드포인트: `Authorization: Bearer <JWT>` 헤더 필수
- 미인증 요청: `401 Unauthorized`

### 응답 포맷
```json
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": { "code": "ERROR_CODE", "message": "한국어 메시지" } }
```

### 타임스탬프
- 모든 시각: ISO 8601, UTC (`2026-05-06T12:00:00Z`)

---

## 3. API 정의

### 3-1. POST /api/subscription/mock-purchase

**목적**: paywall 에서 "구매 완료" 버튼 클릭 → Pro 전환. Phase 2 에서 내부 구현만 RevenueCat 으로 교체 (endpoint 계약 동일).

**Request**
```json
POST /api/subscription/mock-purchase
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "plan": "monthly"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `plan` | `"monthly"` | ✓ | 현재 `monthly` 만 허용 (adr-11) |

**Response 200 — 성공 (신규 구매 또는 멱등 재사용)**
```json
{
  "success": true,
  "data": {
    "subscription_status": "pro",
    "trial_start_date": "2026-05-01",
    "pro_until": "2026-06-06T12:00:00Z",
    "is_pro": true,
    "event": {
      "id": "uuid",
      "event_type": "purchased",
      "source": "mock",
      "plan": "monthly",
      "amount_cents": 199,
      "occurred_at": "2026-05-06T12:00:00Z"
    },
    "idempotent": false
  }
}
```

| 필드 | 설명 |
|------|------|
| `idempotent` | `true` = 이미 활성 구독이 있어 기존 상태 반환 (신규 이벤트 미생성), `false` = 신규 전이 발생 |

**멱등성 룰**:
- 현재 `subscription_status IN ('pro')` 이고 `pro_until > now()` 이면 → 신규 이벤트 없이 현재 상태 반환, `idempotent: true`
- `trial` 또는 `expired` 상태 → 정상 구매 처리 (`idempotent: false`)

**Response 4xx**

| HTTP | code | 조건 |
|------|------|------|
| 400 | `INVALID_PLAN` | `plan` 이 `monthly` 외 다른 값 |
| 402 | `TERMS_NOT_AGREED` | `User.terms_agreed_at IS NULL` (약관 미동의) |
| 409 | `SUBSCRIPTION_ALREADY_ACTIVE` | `pro` 상태 + `pro_until > now()` (멱등 처리가 아닌 명시적 에러로 처리할 경우 — 구현 선택, 권장: 멱등 200 반환) |

> **결정 항목 (spec 내 결정)**: `pro` 상태 중복 호출 시 409 vs 200 (멱등). **권장: 200 + idempotent:true** — 클라이언트 재시도 친화적, 오류 화면 안 뜸.

**Side-effect**:
- `subscription_events` INSERT (`event_type='purchased'`, `source='mock'`, `plan='monthly'`, `amount_cents=199`)
- `User.subscription_status = 'pro'`, `User.pro_until = now() + 30d`, `User.is_pro = true`
- 트랜잭션: subscription_events INSERT + User 업데이트 원자적

---

### 3-2. POST /admin/debug/subscription

**목적**: 스테이지 환경에서 구독 상태 강제 전환 (개발·QA 전용).

**환경 가드**:
- 환경변수 `ALLOW_DEBUG_SUBSCRIPTION=1` 일 때만 라우터 등록
- 미설정 또는 `0` 이면 서버 시작 시 해당 라우터 미등록 → `404`
- prod 배포 환경에서는 절대 `ALLOW_DEBUG_SUBSCRIPTION=1` 설정 금지 (CI/CD 가드 추가 권장)

**Request**
```json
POST /admin/debug/subscription
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "user_id": "uuid",
  "target_status": "trial",
  "note": "QA 테스트 — 만료 시나리오 확인"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `user_id` | UUID | ✓ | 전환 대상 사용자 |
| `target_status` | `"free"\|"trial"\|"pro"\|"expired"\|"cancelled"` | ✓ | 강제 전환할 상태 |
| `note` | string | ✗ | 전환 사유 (subscription_events.raw_payload 에 저장) |

**Response 200**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "previous_status": "free",
    "new_status": "trial",
    "event": {
      "id": "uuid",
      "event_type": "purchased",
      "source": "admin",
      "occurred_at": "2026-05-06T12:00:00Z"
    }
  }
}
```

**Response 4xx**

| HTTP | code | 조건 |
|------|------|------|
| 403 | `DEBUG_API_DISABLED` | ENV 가드 미통과 (실제로는 404 반환이 더 적절 — 존재 자체 미노출) |
| 404 | `USER_NOT_FOUND` | `user_id` 미존재 |
| 400 | `INVALID_TARGET_STATUS` | 허용되지 않는 status 값 |

**Side-effect**:
- `subscription_events` INSERT (`source='admin'`, `raw_payload={note}`)
- `User.subscription_status` 강제 갱신, 필요 시 `trial_start_date` / `pro_until` / `is_pro` 갱신

---

### 3-3. GET /api/users/me (확장)

**목적**: 기존 사용자 정보 + 구독 상태 + 일일 한도 + 배너 알림 포함.

**Response 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "provider": "google",
    "email": "user@example.com",
    "name": "홍길동",
    "streak": 5,
    "longest_streak": 10,
    "total_focus_time": 3600,

    "subscription_status": "trial",
    "trial_start_date": "2026-05-01",
    "pro_until": null,
    "is_pro": true,
    "timezone": "Asia/Seoul",
    "terms_agreed_at": "2026-05-01T09:00:00Z",
    "privacy_agreed_at": "2026-05-01T09:00:00Z",

    "daily_session_count": 0,
    "daily_quota": 1,
    "daily_quota_resets_at": "2026-05-07T15:00:00Z",

    "banner_alert": "trial_expiring_24h",

    "created_at": "2026-05-01T09:00:00Z",
    "updated_at": "2026-05-06T10:00:00Z"
  }
}
```

**신규 필드 명세**

| 필드 | 타입 | 설명 |
|------|------|------|
| `timezone` | string | IANA timezone (`"Asia/Seoul"`, `"UTC"` 등). 기본값 `"UTC"` |
| `terms_agreed_at` | datetime\|null | 이용약관 최종 동의 시각 |
| `privacy_agreed_at` | datetime\|null | 개인정보처리방침 최종 동의 시각 |
| `daily_session_count` | int | 오늘 (사용자 로컬 날짜 기준) 완료된 세션 수. `daily_focus.session_count` |
| `daily_quota` | int | 일일 최대 허용 세션. Free/Expired = 1, Pro/Trial = -1 (무제한 표시) |
| `daily_quota_resets_at` | datetime | 다음 한도 리셋 시각 (사용자 로컬 자정을 UTC 로 변환) |
| `banner_alert` | string\|null | 배너 알림 유형: `null`, `"trial_expiring_24h"`, `"trial_expiring_1h"`, `"trial_expired"`, `"subscription_expired"` |

**banner_alert 계산 로직 (서버)**

```python
# trial 상태인 경우
trial_end = trial_start_date + timedelta(days=7)  # UTC 자정
delta = trial_end - now_utc

if delta <= timedelta(0):          → "trial_expired" (또는 T3 전이 후 "subscription_expired")
elif delta <= timedelta(hours=1):  → "trial_expiring_1h"
elif delta <= timedelta(hours=24): → "trial_expiring_24h"
else:                              → null
```

**5상태별 응답 예시**

| 상태 | `is_pro` | `daily_quota` | `banner_alert` |
|------|---------|--------------|---------------|
| `free` | false | 1 | null |
| `trial` (D+3) | true | -1 | null |
| `trial` (D+6.5) | true | -1 | `"trial_expiring_24h"` |
| `pro` | true | -1 | null |
| `expired` | false | 1 | `"subscription_expired"` (첫 1회) |
| `cancelled` (만료 전) | true | -1 | null |

**Lazy 만료 체크**:
- `GET /users/me` 호출 시 `subscription_status` 가 `trial` 또는 `pro` 이고 만료 조건이면 → DB 갱신 후 갱신된 상태 반환 (응답에서 이미 `expired` 반영)

---

## 4. 에러 코드 목록

| Code | HTTP | 설명 |
|------|------|------|
| `INVALID_PLAN` | 400 | mock-purchase: 허용되지 않는 plan 값 |
| `TERMS_NOT_AGREED` | 402 | 약관 미동의 상태에서 구매 시도 |
| `INVALID_TARGET_STATUS` | 400 | debug API: 허용되지 않는 target_status |
| `USER_NOT_FOUND` | 404 | debug API: 대상 사용자 미존재 |
| `DEBUG_API_DISABLED` | 404 | debug API: ENV 가드 미통과 |
| `UNAUTHORIZED` | 401 | 인증 토큰 없음 또는 만료 |
| `DAILY_QUOTA_EXCEEDED` | 403 | 일일 한도 초과 (세션 시작 시) |

---

## 5. OpenAPI 스니펫 (핵심)

```yaml
paths:
  /api/subscription/mock-purchase:
    post:
      summary: Mock Purchase (Phase 1 구독 전환)
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [plan]
              properties:
                plan:
                  type: string
                  enum: [monthly]
      responses:
        '200':
          description: 구매 성공 또는 멱등 반환
        '402':
          description: 약관 미동의

  /api/users/me:
    get:
      summary: 내 정보 조회 (구독 상태 포함)
      security:
        - bearerAuth: []
      responses:
        '200':
          description: 사용자 정보 + 구독 상태 + 일일 한도 + 배너 알림
```
