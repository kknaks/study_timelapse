---
id: spec-09
type: spec
title: Auth & 온보딩 도메인 — OAuth 인증·JWT·온보딩 플로우
status: draft
created: 2026-05-18
updated: 2026-05-18
sources:
  - "[[planning-01-recording-pipeline]]"
depends_on:
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-08-mobile-revenuecat-integration]]"
tags: [spec, auth, onboarding, backend, mobile, paywall]
---

# Auth & 온보딩 도메인 — OAuth 인증·JWT·온보딩 플로우

## Summary

Google/Apple OAuth id_token을 검증해 JWT를 발급하고, 신규 사용자는 약관 동의 → 트라이얼 소개 → paywall 온보딩 플로우로 안내한다. 기존 사용자는 로그인 직후 홈으로 진입한다.

---

## [API] Auth Endpoints

### POST /api/auth/google

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| Content-Type | application/json |

**Request body**

```json
{
  "id_token": "string",
  "terms_agreed": false,
  "privacy_agreed": false,
  "timezone": "UTC"
}
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "tokens": {
      "access_token": "string",
      "refresh_token": "string",
      "token_type": "bearer",
      "expires_in": 3600
    },
    "user": {
      "id": "uuid",
      "provider": "google",
      "email": "string|null",
      "name": "string|null",
      "is_new": false
    }
  }
}
```

**에러**

| 코드 | 사유 |
|---|---|
| 401 | id_token 검증 실패 (만료/조작) |

---

### POST /api/auth/apple

**Request body**

```json
{
  "identity_token": "string",
  "name": "string|null",
  "terms_agreed": false,
  "privacy_agreed": false,
  "timezone": "UTC"
}
```

**Response** — google과 동일 구조 (provider: "apple")

**에러**

| 코드 | 사유 |
|---|---|
| 401 | identity_token 검증 실패 (만료/kid 불일치) |

---

### POST /api/auth/refresh

**Request body**

```json
{ "refresh_token": "string" }
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "access_token": "string",
    "refresh_token": "string",
    "token_type": "bearer",
    "expires_in": 3600
  }
}
```

**에러**

| 코드 | 사유 |
|---|---|
| 401 | refresh_token 만료/변조 |

---

## [API] 데이터 모델

신규 가입 시 생성되는 User row 초기값:

| 필드 | 초기값 |
|---|---|
| `subscription_status` | `"free"` |
| `trial_start_date` | `NULL` |
| `is_pro` | `false` |
| `timezone` | 요청값 or `"UTC"` |
| `terms_agreed_at` | `terms_agreed=true` 시 `now()`, else `NULL` |
| `privacy_agreed_at` | `privacy_agreed=true` 시 `now()`, else `NULL` |

---

## [API] 비즈니스 규칙

- `provider_id` 기준 조회 — 존재하면 로그인, 없으면 신규 가입
- 기존 사용자 로그인 시 `apply_lazy_expiry(user)` 호출 (trial/pro 만료 자동 전이)
- 신규 가입 시 lazy expiry 호출 없음 (`trial_start_date=NULL` → 만료 체크 대상 아님)
- Apple: 첫 로그인 시만 이름 제공 → 이후 `name=null`이면 기존값 유지
- Apple 공개키 인메모리 캐시 (kid 기반). kid 미매칭 시 캐시 무효화 후 1회 재시도
- JWT access_token: 60분, refresh_token: 30일

---

## [모바일] 화면 목록

| 화면명 | 파일 경로 | 한 줄 설명 |
|---|---|---|
| 로그인 | `app/login.tsx` | Google Sign-In 단일 버튼. 신규/기존 사용자 분기 |
| 온보딩 약관 | `app/onboarding/terms.tsx` | 서비스 이용약관·개인정보처리방침 체크박스 동의 |
| 트라이얼 소개 | `app/onboarding/trial-intro.tsx` | 무료 체험 혜택 안내 + paywall 진입 또는 건너뛰기 |
| Paywall | `app/paywall.tsx` | 구독 플랜 선택 + RevenueCat 결제 처리 |
| 홈 | `app/index.tsx` | 진입점. 비로그인 시 로그인으로 redirect |

---

## [모바일] 전환 흐름

```
앱 시작
  ↓ AuthProvider.isReady=true
  RouteGuard 실행
    ├─ isLoggedIn=false → /login
    └─ isLoggedIn=true
         ├─ user.terms_agreed_at=null → /onboarding/terms
         └─ user.terms_agreed_at≠null → 현재 화면 유지 (/ 또는 해당 라우트)

/login (login.tsx)
  ├─ Google Sign-In 성공
  │    ├─ is_new=true → /onboarding/terms  (router.replace)
  │    └─ is_new=false → /  (router.replace)
  └─ Sign-In 취소/오류 → 같은 화면 유지

/onboarding/terms (terms.tsx)
  ├─ termsAgreed && privacyAgreed → agreeToTerms() API 호출
  │    ├─ 성공 → /onboarding/trial-intro  (router.replace)
  │    └─ 실패 → Alert (에러 코드 표시)
  └─ BackHandler: 하드웨어 뒤로 가기 막음

/onboarding/trial-intro (trial-intro.tsx)
  ├─ "시작하기" CTA → /paywall?source=onboarding  (router.push)
  └─ "나중에" 링크 → /  (router.replace)

/paywall (paywall.tsx, source=onboarding)
  ├─ 구독 성공 → Alert → /  (router.replace)
  ├─ 닫기(✕) + isOnboarding=true → /  (router.replace)
  └─ 닫기(✕) + isOnboarding=false → router.back()
```

---

## [모바일] 주요 상태/데이터

| 상태 | 위치 | 설명 |
|---|---|---|
| `isReady`, `isLoggedIn` | `AuthContext` | 앱 부팅 완료 여부 + 로그인 상태 |
| `user.terms_agreed_at` | `getMe()` → React Query `['me']` | null이면 RouteGuard가 `/onboarding/terms`로 redirect |
| `user.is_new` | 로그인 API 응답 | 신규 사용자 여부 (onboarding 진입 조건) |
| `termsAgreed`, `privacyAgreed` | terms.tsx local state | 두 체크박스 모두 true여야 "Agree" 버튼 활성화 |
| `isSubmitting` | terms.tsx local state | API 호출 중 버튼 비활성화 |
| `isSigningIn` | login.tsx local state | Google Sign-In 진행 중 버튼 비활성화 |
| `introEligible` | paywall.tsx local state | RevenueCat intro price 대상 여부 (트라이얼 노트 표시) |
| `source` | paywall.tsx URL param | `'onboarding'`이면 닫기 시 `/`로 이동 |

---

## 에지 케이스

| 케이스 | 처리 방식 |
|---|---|
| 기존 사용자 로그인 → `is_new=false` | `/onboarding/terms` 건너뛰고 `/`로 직행 |
| 로그인 후 `terms_agreed_at=null` 상태에서 다른 라우트 접근 | RouteGuard가 `/onboarding/terms`로 강제 redirect (onboarding/login/legal 화면 제외) |
| 약관 동의 API 실패 | Alert에 HTTP 상태 코드와 오류 상세 표시. 화면 유지 |
| 약관 화면에서 하드웨어 백 버튼 | BackHandler로 막음 (뒤로 빠져나가기 불가) |
| paywall: 미로그인 사용자 접근 | 로그인 안내 + "로그인" 버튼 표시 (redirect 없음) |
| paywall: RevenueCat 미설정(staging) | `mockPurchase` API 폴백 |
| paywall: 결제 수단 없음/취소 | `userCancelled=true` → 조용히 무시 |
| paywall: TERMS_NOT_AGREED 오류 | Alert → `/terms`로 안내 |
| paywall: 검증 1회 실패 | 1초 후 재시도. 재시도도 실패 시 webhook 자동 처리 안내 |
| `loginRevenueCat` 호출 시점 | 로그인 성공 직후 및 기존 토큰으로 앱 재진입 시 자동 호출 |
| id_token/identity_token 만료 | `401 {"detail": "Invalid ... token: ..."}` |
| Apple kid 불일치 (재시도 후) | `401` |
| refresh_token 만료/변조 | `401` |
