---
id: test-01
type: test
title: 전체 유저 플로우 E2E 시나리오
status: draft
created: 2026-05-19
updated: 2026-05-19
sources:
  - "[[spec-09-auth-onboarding]]"
  - "[[spec-10-session-domain]]"
  - "[[spec-12-stats-domain]]"
related_to:
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-13-users-api]]"
tags: [test, e2e, user-flow, mobile]
---

# 전체 유저 플로우 E2E 시나리오

## Summary

앱의 전체 유저 플로우를 도메인별로 정리한 E2E 테스트 시나리오. QA 체크리스트 겸 회귀 기준 문서로 활용한다. 신규 온보딩부터 세션 녹화·저장·stats 확인·paywall 전환까지 8개 플로우를 커버한다.

---

## 공통 전제 조건

- 기기: iOS 실기기 또는 시뮬레이터 (카메라 필요 시 실기기 권장)
- 환경: dev/staging (RevenueCat mockPurchase API 폴백 사용)
- 백엔드: `http://localhost:18001` 로컬 또는 staging 서버 기동 상태

---

## F-01. 신규 사용자 온보딩

### 사전 조건

- 해당 Google 계정으로 앱에 가입한 기록 없음 (DB users 테이블에 미존재)
- 네트워크 정상

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | 앱 최초 실행 | 로그인 화면(`/login`) 표시. "Sign in with Google" 버튼 활성 |
| 2 | "Sign in with Google" 탭 | Google Sign-In 시트 표시. isSigningIn=true → 버튼 비활성화 |
| 3 | Google 계정 선택 및 승인 | API `POST /api/auth/google` 호출. is_new=true 응답 수신 |
| 4 | 응답 수신 후 화면 전환 | `/onboarding/terms` 로 router.replace. 뒤로 가기 불가 |
| 5 | 약관 화면 표시 | 서비스 이용약관·개인정보처리방침 체크박스 2개. "Agree" 버튼 비활성 |
| 6 | 두 체크박스 모두 체크 | "Agree" 버튼 활성화 |
| 7 | "Agree" 탭 | `PUT /api/users/me/terms-agree` 호출. isSubmitting=true → 버튼 비활성화 |
| 8 | 약관 동의 성공 | `/onboarding/trial-intro` 로 router.replace |
| 9 | 트라이얼 소개 화면 표시 | 무료 체험 혜택 안내. "시작하기" CTA + "나중에" 링크 표시 |
| 10 | "시작하기" CTA 탭 | `/paywall?source=onboarding` 으로 router.push |
| 11 | Paywall 화면 표시 | 구독 플랜 선택 UI. isOnboarding=true 상태 |
| 12 | ✕(닫기) 탭 | isOnboarding=true → `/` 로 router.replace (홈 진입) |

### 확인 포인트

- 약관 화면에서 하드웨어 뒤로 가기 버튼 → 화면 유지 (BackHandler 막음)
- 약관 한 개만 체크 시 "Agree" 버튼 비활성 유지
- 약관 동의 API 실패(5xx) → Alert에 HTTP 상태 코드 표시, 화면 유지
- 가입 직후 `GET /api/users/me` 응답의 `subscription_status = 'trial'` 확인 (free → trial 자동 전이)
- `trial_start_date` 가 오늘 날짜로 설정됨
- "나중에" 링크 탭 → `/` 로 router.replace (paywall 건너뜀)

---

## F-02. 기존 사용자 재로그인

### 사전 조건

- 해당 Google/Apple 계정으로 기가입 완료 (`terms_agreed_at IS NOT NULL`)
- 이전 토큰 만료 또는 로그아웃 상태

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | 앱 실행 | AuthProvider isReady=false 상태. 스플래시/로딩 표시 |
| 2 | 저장된 refresh_token 존재 시 | `POST /api/auth/refresh` 자동 호출. 성공 시 isLoggedIn=true |
| 3 | 자동 복원 성공 | RouteGuard 실행: terms_agreed_at ≠ null → 홈(`/`) 유지 |
| 4 | 수동 로그인 필요 시 → 로그인 화면 | "Sign in with Google" 탭 → API is_new=false 응답 |
| 5 | is_new=false 분기 | `/` 로 router.replace. 온보딩 화면 진입 없음 |
| 6 | 홈 화면 표시 | "Start Focus Session" 버튼, "↗ Focus Stats" 탭 표시 |

### 확인 포인트

- refresh_token 만료 시 → 401 → 자동 로그아웃 → `/login` redirect
- `terms_agreed_at=null` 인 기존 사용자 로그인 → RouteGuard가 `/onboarding/terms` redirect (F-01 §4 이후 동일)
- 로그인 성공 직후 `loginRevenueCat()` 자동 호출 (RevenueCat 식별자 동기화)
- Apple 재로그인 시 `name=null` → 기존 이름 유지

---

## F-03. 공부 세션 (Free 사용자, 첫 세션)

### 사전 조건

- 로그인 완료, `subscription_status='free'` 또는 `'trial'` (오늘 세션 0건)
- 카메라 권한: 미결정 또는 허용

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | 홈(`/`) 에서 "Start Focus Session" 탭 | `/session-setup` 이동 |
| 2 | 세션 설정 화면 표시 | 집중시간 슬라이더(기본 120분), 타임랩스 길이 선택, 화면비, 타이머 모드 설정 가능 |
| 3 | 파라미터 설정 후 "Start Recording" 탭 | `POST /api/sessions` 호출 |
| 4 | 세션 생성 성공(201) | `/focus` 이동 (sessionId, studyMinutes, outputSeconds, aspectRatio, timerMode 파라미터 전달) |
| 5 | 카메라 권한 미결정 | 권한 요청 다이얼로그 표시 |
| 6 | 권한 허용 | 카메라 프리뷰 표시. 재생 버튼(▶) 표시 |
| 7 | ▶ 탭 | `startCapture()` 실행. 타이머 시작. 화면 자동 잠금 비활성화 |
| 8 | 일시정지(‖) 탭 | `pauseCapture()`. 타이머 정지 |
| 9 | 재개(▶) 탭 | `resumeCapture()`. 타이머 재개 |
| 10 | 정지(■) 탭 (elapsed ≥ 10s) | 정지 확인 모달: "정지" / "계속" |
| 11 | "정지" 확정 | `stopCapture()` → `/generating` 이동 |
| 12 | generating 화면 | `stitchTimelapse()` 실행. 진행률 바 표시 |
| 13 | stitch 완료 | `/result` 이동 (previewPath + focus params 전달) |
| 14 | result 화면 | 미리보기 영상 재생. 오버레이 스타일 선택 탭 표시 |
| 15 | 오버레이 선택 후 "Save to Gallery" 탭 | `/saving` 이동 |
| 16 | saving Step 0: 갤러리 권한 요청 | 갤러리 권한 다이얼로그 표시 |
| 17 | 권한 허용 | Step 1: burn-in stitch 진행 |
| 18 | Step 2: 갤러리 저장 + 세션 업데이트 | `PUT /api/sessions/{id}` (status=completed, duration=실제초) |
| 19 | Step 3: 완료 | "View Stats →" 버튼, Instagram 아이콘 표시. finished=true |

### 확인 포인트

- elapsed < 10s 에서 정지 시도 → Alert '최소 10초 이상 녹화' (모달 미표시)
- 집중시간 > 2시간 + 타임랩스 5s/10s 선택 → 해당 옵션 비활성화, 15s 자동 선택
- Free 사용자: generating 화면에서 `showWatermark=true` → `overlayMeta.showAppMark=true`
- result 화면에서 "Remove Watermark" 버튼 표시 (Free 사용자)
- result 화면 "←" → gestureEnabled=false → `/` 로 이동 (뒤로가기 불가)
- 타이머 완료(elapsed ≥ goalSec) → 자동 stopCapture → /generating (사용자 개입 없음)
- 앱 백그라운드 전환 중 녹화 중 → 자동 pauseCapture + Alert

---

## F-04. 공부 세션 (Free 사용자, 일일 한도 초과)

### 사전 조건

- `subscription_status = 'free'` 또는 `'expired'`
- 오늘 이미 세션 1건 완료 (`daily_focus.session_count ≥ 1`)

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | 홈 → "Start Focus Session" 탭 | `/session-setup` 이동 |
| 2 | "Start Recording" 탭 | `POST /api/sessions` 호출 |
| 3 | API 응답 `403 DAILY_QUOTA_EXCEEDED` | 일일 한도 모달 표시 |
| 4 | 모달 내용 확인 | 한도 초과 안내 + `daily_quota_resets_at` 시각 표시 (리셋 시간 안내) |
| 5 | 모달 닫기 | session-setup 화면으로 복귀 |
| 6 | 모달 "Upgrade" / paywall 유도 탭 | `/paywall` 이동 |

### 확인 포인트

- 한도 체크는 `POST /api/sessions` 호출 시 수행 (session-setup 진입 시가 아님)
- `daily_quota_resets_at` = 사용자 timezone 기준 다음 자정 (UTC datetime)
- `/paywall` 에서 구독 성공 후 홈 복귀 → 세션 시작 가능 확인

---

## F-05. 공부 세션 (Pro/Trial 사용자)

### 사전 조건

- `subscription_status = 'trial'` 또는 `'pro'`

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | 홈 → "Start Focus Session" 탭 | `/session-setup` 이동 |
| 2 | "Start Recording" 탭 | `POST /api/sessions` 호출. 일일 한도 체크 없이 201 응답 |
| 3 | 세션 완료 후 재시도 (당일 2번째) | 동일하게 `POST /api/sessions` 201 응답. QUOTA 에러 없음 |
| 4 | result 화면 | "Progress Bar" 오버레이 선택 가능 (`showProgressBar=true`) |
| 5 | Progress Bar 오버레이 선택 | paywall redirect 없이 정상 선택 |
| 6 | saving 완료 | 워터마크 없이 갤러리에 저장 (`showWatermark=false`) |

### 확인 포인트

- trial 사용자: `banner_alert` 값 확인 (`GET /api/users/me` 응답)
  - 트라이얼 7일 전 → null
  - 24h 이내 → `trial_expiring_24h` 배너 표시
  - 1h 이내 → `trial_expiring_1h` 배너 표시
- generating: `subLoading=true` 동안 stitch 실행 보류 → 로딩 완료 후 자동 stitch 시작
- Pro 사용자가 Progress Bar 선택 + saving → `overlayStyle='progress'` 로 burn-in 적용

---

## F-06. 저장 후 Stats 진입 및 back 동작

### 사전 조건

- F-03 또는 F-05 흐름에서 saving Step 3 완료 상태 (`finished=true`)

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | saving 화면 "View Stats →" 탭 | `router.replace('/stats')` — stats 화면 이동 |
| 2 | stats 화면 표시 | 오늘 공부 시간, streak, 주간 바 차트, 캘린더 표시 |
| 3 | stats 화면 "←" (back) 탭 | `router.back()` → 홈(`/`) 또는 session-setup 이동 |
| 4 | result 화면으로 돌아가지 않음 확인 | back 스택: saving → stats. result 화면 없음 (router.replace 사용) |

### 확인 포인트

- saving → stats 전환 시 `router.replace('/stats')` 사용 (router.push 가 아님) → back 스택에 saving 없음
- 버그 수정 검증: stats에서 back 시 result 화면이 아닌 홈/session-setup으로 이동 (961765a 커밋)
- stats 화면 진입 시 `GET /api/stats/weekly`, `GET /api/users/me` 자동 호출 → 방금 완료한 세션 데이터 반영 확인

---

## F-07. Stats 화면 기본 동작

### 사전 조건

- 로그인 완료. 1개 이상의 완료 세션 보유

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | 홈 "↗ Focus Stats" 탭 | `/stats` 이동 |
| 2 | 오늘/Streak 카드 확인 | 오늘 누적 공부 시간(초→hh:mm 변환), streak 일수 표시 |
| 3 | 주간 바 차트 표시 | 이번 주 7일 일별 바. 세션 없는 날은 16px 빈 바 |
| 4 | 바 탭 (세션 있는 날) | 말풍선(시간 표시) 나타남 |
| 5 | 말풍선 탭 | 말풍선 닫힘 |
| 6 | 월별 캘린더 표시 | 세션 있는 날 점 표시. 오늘 날짜: 테두리 원 |
| 7 | 캘린더 세션 있는 날 탭 | 말풍선(공부 시간) 표시. 위치: 화면 내 클램프(8~300px) |
| 8 | 배경 탭 | 말풍선 닫힘 |
| 9 | 캘린더 "‹"/"›" 탭 | 이전/다음 달 이동. `getDailyStats()` 새 달 범위로 재호출 |
| 10 | "≡" 탭 → Settings 모달 | 이름 편집, "Refresh Subscription Status", "Sign Out" 메뉴 표시 |
| 11 | 이름 "Edit" 탭 | TextInput 편집 모드 진입 |
| 12 | 이름 입력 후 "Save" | `PUT /api/users/me/profile` 호출. 성공 시 화면 이름 갱신 |
| 13 | "Refresh Subscription Status" 탭 | `syncSubscription()` 호출. 30초 쿨다운 적용 |
| 14 | "Sign Out" 탭 | Alert 확인 후 `GoogleSignin.signOut()` + `tokenStore.clearTokens()` → `/login` |

### 확인 포인트

- 세션 데이터 없음 시 주간 바 차트 → `maxDailySeconds=1` fallback (높이 16px 빈 바, 0으로 나누기 방지)
- 이름 빈 문자열 저장 시도 → `trim()` 후 API 호출 안 함 (로컬 처리)
- 구독 동기화 30초 이내 재시도 → Alert '30초 후 다시 시도'
- 로그아웃 후 `queryClient.clear()` 확인 (캐시 초기화)
- Free 사용자: Settings 모달에 "Upgrade Now →" 버튼 표시 → 탭 시 `/paywall` 이동

---

## F-08. Paywall & 구독 전환 (Free → Pro)

### 사전 조건

- `subscription_status = 'free'` 또는 `'expired'`

### 단계 테이블

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | paywall 진입 (result 화면 "Remove Watermark" 탭) | `/paywall` 이동 (`source` 파라미터 없음) |
| 2 | Paywall 화면 표시 | 구독 플랜 선택 UI. `introEligible` 여부에 따라 트라이얼 노트 표시 |
| 3 | 플랜 선택 + 결제 시도 | RevenueCat 결제 시트 표시 (staging: mockPurchase 폴백) |
| 4 | 결제 성공 | Alert 표시 → 확인 탭 → `/` (router.replace) |
| 5 | 홈 복귀 후 `GET /api/users/me` | `subscription_status = 'pro'` 확인 |
| 6 | "Start Focus Session" → 세션 시작 | 일일 한도 없이 201 응답 |
| 7 | result 화면 | "Remove Watermark" 버튼 미표시. Progress Bar 선택 가능 |

### 확인 포인트

- 결제 취소 (`userCancelled=true`) → 조용히 무시, paywall 화면 유지
- paywall: TERMS_NOT_AGREED 오류 → Alert → `/terms` 안내
- paywall: 검증 1회 실패 → 1초 후 재시도. 재시도도 실패 시 webhook 자동 처리 안내
- paywall: 미로그인 사용자 접근 → 로그인 안내 + "로그인" 버튼 (redirect 없음)
- `source=onboarding` 일 때 ✕ 탭 → `/` (홈). `source` 없을 때 ✕ → `router.back()`
- 구독 후 `is_pro=true`, `pro_until` 설정 확인 (`GET /api/users/me`)

---

## 영향 범위 분석

| 영역 | 영향 |
|---|---|
| backend/api | × — 문서 전용. 코드 수정 없음 |
| frontend/web-fe | × — 모바일 전용 플로우 |
| frontend/mobile-fe | × — 코드 수정 없음. QA/회귀 기준 문서 |
| frontend/shared-fe | × — 영향 없음 |

---

## 알려진 부채 / 미구현

| 항목 | 설명 |
|---|---|
| Stats API timezone | `daily_focus` 저장은 사용자 timezone 기준, stats API 조회는 UTC 기준 파라미터. 사용자 로컬 시간 기준 조회 미구현 (spec-12 §알려진 부채) |
| timerAlert | Stats 화면 타이머 알림 토글 — UI 상태만. 백엔드 API 연동 없음 |
| 트라이얼 만료 cron | Phase 1은 lazy check 방식. 별도 cron은 Phase 1b 추가 예정 (spec-03 §5-1) |
