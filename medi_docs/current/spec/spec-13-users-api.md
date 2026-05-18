---
id: spec-13
type: spec
title: Users API — 사용자 프로필 조회·수정, 구독 상태, 약관 동의
status: draft
created: 2026-05-18
updated: 2026-05-18
sources:
  - "[[planning-01-recording-pipeline]]"
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-04-subscription-api]]"
tags: [spec, backend, users]
---

# Users API — 사용자 프로필 조회·수정, 구독 상태, 약관 동의

## Summary

인증된 사용자의 프로필·구독 상태·일일 한도·배너 알림을 반환하고, 프로필 수정·약관 동의·streak 갱신을 처리한다.

---

## Endpoints

### GET /api/users/me — 내 정보 조회

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |

호출 시 자동으로 `apply_lazy_expiry(user)` 실행 (trial/pro 만료 자동 전이).

**Response 200 — UserResponseV2**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "provider": "google|apple",
    "email": "string|null",
    "name": "string|null",
    "streak": 0,
    "longest_streak": 0,
    "total_focus_time": 0,
    "subscription_status": "free|trial|pro|expired|cancelled",
    "trial_start_date": "date|null",
    "is_pro": false,
    "pro_until": "datetime|null",
    "grace_until": "datetime|null",
    "timezone": "UTC",
    "terms_agreed_at": "datetime|null",
    "privacy_agreed_at": "datetime|null",
    "daily_session_count": 0,
    "daily_quota": 1,
    "daily_quota_resets_at": "datetime",
    "banner_alert": "trial_expiring_24h|trial_expiring_1h|null",
    "created_at": "datetime",
    "updated_at": "datetime"
  }
}
```

| 필드 | 설명 |
|---|---|
| `daily_quota` | `-1` = 무제한 (trial/pro), `1` = Free |
| `daily_quota_resets_at` | 사용자 timezone 기준 다음 자정 (UTC datetime) |
| `banner_alert` | trial 만료 24h 이내: `trial_expiring_24h`, 1h 이내: `trial_expiring_1h`, 그 외: null |

---

### PUT /api/users/me/terms-agree — 약관 동의

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |

**Request body**

```json
{ "terms_agreed": true, "privacy_agreed": true }
```

**Response 200** — UserResponseV2 동일 구조

**에러**

| 코드 | error_code | 사유 |
|---|---|---|
| 400 | `INVALID_AGREEMENT` | `terms_agreed` 또는 `privacy_agreed`가 false |
| 401 | `UNAUTHORIZED` | JWT 미제공 |

- 이미 동의한 사용자 재호출 → 200 (시각 갱신)
- 멱등 허용

---

### PUT /api/users/me/profile — 닉네임 수정

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |

**Request body**

```json
{ "name": "string" }
```

**Response 200**

```json
{ "success": true, "data": { "name": "string" } }
```

**에러**

| 코드 | 사유 |
|---|---|
| 422 | name이 빈 문자열 |

---

### PUT /api/users/me/streak — streak 수동 갱신

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |

**Request body**

```json
{ "streak": 5, "longest_streak": 10 }
```

`longest_streak`는 optional. 미제공 시 `streak`와 기존 longest_streak 중 큰 값 유지.

**Response 200**

```json
{
  "success": true,
  "data": { "streak": 5, "longest_streak": 10 }
}
```

---

## 데이터 모델

`User` 테이블 주요 필드:

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `subscription_status` | VARCHAR(20) | `free` | Check Constraint: free/trial/pro/expired/cancelled |
| `trial_start_date` | DATE null | NULL | Phase 2 신규 가입자는 NULL |
| `is_pro` | BOOLEAN | false | subscription_status 캐시 |
| `pro_until` | TIMESTAMP null | NULL | Pro 만료 시점 |
| `grace_until` | TIMESTAMP null | NULL | RevenueCat billing issue 유예 기간 |
| `timezone` | VARCHAR(50) | `UTC` | daily_focus 날짜 기준 |
| `terms_agreed_at` | TIMESTAMP null | NULL | |
| `privacy_agreed_at` | TIMESTAMP null | NULL | |
| `streak` | INTEGER | 0 | 연속 공부일 수 |
| `longest_streak` | INTEGER | 0 | 최장 streak |
| `total_focus_time` | INTEGER | 0 | 누적 포커스 시간 (초) |

---

## 비즈니스 규칙

### GET /me lazy expiry 체크

응답 생성 전에:
- `subscription_status='trial'` + `trial_start_date + 7d ≤ now()` → `expired`로 전이 + `subscription_events` `trial_expired` INSERT
- `subscription_status='pro'` + `pro_until ≤ now()` → `expired`로 전이 + `subscription_events` `expired` INSERT

### banner_alert 계산

- trial 사용자 기준 `trial_start_date + 7d`까지 남은 시간이 1h 이내 → `trial_expiring_1h`
- 24h 이내 → `trial_expiring_24h`
- 그 외 또는 non-trial → `null`

### daily_quota

- `trial` / `pro` → `-1` (무제한)
- `free` / `expired` / `cancelled` → `1`

### terms-agree 동작

- `terms_agreed=false` 또는 `privacy_agreed=false` → `400 INVALID_AGREEMENT`
- 둘 다 true → `terms_agreed_at = now()`, `privacy_agreed_at = now()` (DB flush + refresh)

---

## 에러 케이스

| 엔드포인트 | 상황 | 응답 |
|---|---|---|
| GET /me | JWT 미제공 | `401 UNAUTHORIZED` |
| PUT /me/terms-agree | false 값 포함 | `400 INVALID_AGREEMENT` |
| PUT /me/terms-agree | JWT 미제공 | `401 UNAUTHORIZED` |
| PUT /me/profile | name 빈 문자열 | `422 Name cannot be empty` |
