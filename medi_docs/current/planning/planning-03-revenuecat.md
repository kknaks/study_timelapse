---
id: planning-03
type: planning
title: RevenueCat 스토어 연동(Phase 2) 요구·시나리오·제약
status: draft
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-02-payment]]"
  - "[[plan-03-payment-roadmap]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-11-monthly-only-no-yearly]]"
  - "[[adr-12-mock-purchase-api-and-events]]"
  - "[[adr-13-anonymous-paywall-and-terms]]"
  - "[[adr-14-phase1-execution-strategy]]"
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-04-subscription-api]]"
  - "[[spec-05-subscription-data-model]]"
  - "[[policy-01-daily-quota]]"
  - "[[policy-02-trial]]"
tags: [planning, payment, subscription, revenuecat, store, phase2]
---

# RevenueCat 스토어 연동(Phase 2) 요구·시나리오·제약

## Summary

Phase 1 (내부 mock 결제 로직) 완료를 기반으로, Phase 2 — 실제 App Store / Google Play 스토어 결제를 RevenueCat SDK 로 연동하는 단계의 SSOT. Phase 1 자산(5-state 스키마, subscription_events 테이블, paywall UI, mock-purchase 유지)을 그대로 활용하고 결제 trigger 만 RevenueCat 으로 교체한다. 이 문서는 Phase 2 의 spec/adr/policy/plan 작성의 최상위 근거다.

---

## Phase 1 자산 현황 (마이그 0 원칙)

Phase 2 진입 전 Phase 1 이 이미 확보한 자산. **이 아래 항목은 Phase 2 에서 스키마/로직 변경 없이 그대로 활용된다.**

| 자산 | Phase 1 상태 | Phase 2 활용 방식 |
|------|------------|-----------------|
| `subscription_events` 테이블 | 구현 완료, `source` 컬럼 `('mock', 'revenuecat', 'admin', 'system')` 이미 포함 | `source='revenuecat'` 로 신규 행 추가. 마이그레이션 0 |
| `User` 컬럼 6개 | `subscription_status / trial_start_date / pro_until / timezone / terms_agreed_at / privacy_agreed_at` | 동일 컬럼 사용 |
| 5-state ENUM | `free / trial / pro / expired / cancelled` | RevenueCat `active→pro`, `expired→expired`, `cancelled→cancelled`, `in_grace_period→?` 매핑 (D-PLAN-2-8) |
| `paywall.tsx` UI | 월 $1.99 단일 CTA, 구매 trigger = mock-purchase API | UI 재사용, 구매 trigger 만 `react-native-purchases SDK` 로 교체 |
| mock-purchase API | 구현 완료, staging 디버그용 유지 | Phase 2 에서도 staging 에 유지. prod 에서는 ENV 가드 (`ENABLE_MOCK_PURCHASE=false`) |
| `/admin/debug/subscription` | 구현 완료, staging 전용 | Phase 2 에서도 유지 (사용자 결정) |
| 5-state 구독 감사 이력 | append-only `subscription_events` | Phase 1 mock 이력 `source='mock'` 그대로 보존 |
| 약관 UI | 가입 + paywall 양쪽 동의 | 동일 (Phase 2 실제 결제에서 더 중요) |

---

## 1. 사용자 시나리오

### 핵심 시나리오

Phase 1 은 mock-purchase 로 강제 Pro 전환이었으나, Phase 2 는 실제 스토어 결제 → RevenueCat customer info 갱신 → backend sync 흐름으로 재정의된다. **D-PLAN-2-2 B 채택으로 가입 시 backend trial 자동 시작 제거 — Phase 2 신규 가입자는 `free` 로 시작, trial 은 paywall introductory offer 진입 시점에 시작된다.**

| # | 시나리오 | 사용자 기대 |
|---|---------|------------|
| S1 | **가입 → `free`** → 약관 동의 (onboarding/legal) → **Trial 안내 페이지** → [7일 무료 체험 시작] → paywall 진입 → RevenueCat introductory offer → `trial` → 7일 후 자동 결제 → `pro` | 가입 직후 "7일 무료 + 이후 $1.99/월 자동 결제" 안내를 명확히 인지하고 시작. 결제 정보 등록 = paywall 진입 시점. 14일 전 갱신 고지 수신 (한국 전자상거래법). |
| S2 | **가입 → `free`** → [나중에] → Free 1회/일 한도 → 한도 도달 시 paywall 자동 노출 → introductory offer → `trial` → 자동 결제 → `pro` | 무료로 먼저 써보다가 한도에 걸리면 paywall 유도. 이 시점에도 introductory offer 7일 무료 가능. |
| S3 | **(Phase 1 기존 사용자 자연 종료)** — backend `trial_start_date` 보유 사용자 → 7일 만료 → `expired`/`free` 전환 → paywall 도달 시 RevenueCat 이 Apple/Google 계정 기준 introductory offer eligibility 자체 판단. **데이터 마이그레이션 없음.** | Phase 1 trial 이미 소진한 사용자는 RevenueCat 이 introductory offer 미제공 가능 (Apple/Google 계정 기준). paywall 에서 $1.99/월 직접 결제 CTA 표시. |
| S4 | Pro → 사용자가 스토어 설정에서 구독 취소 → RevenueCat `CANCELLATION` 이벤트 → backend `subscription_status='cancelled'` 기록 → **`pro_until` 까지 Pro 유지** → 만료 시 `expired` | "구독이 취소됐으나 YYYY-MM-DD 까지 사용 가능" 설정 화면 표시. 만료 후 워터마크 복귀 + 일일 1회 한도 적용. (adr-21 B) |
| S5 | Pro → 사용자 환불 요청 → Apple/Google 처리 → RevenueCat `REFUND` 이벤트 → backend `subscription_status='cancelled'` **즉시** 전환 + `pro_until=NOW()` | 환불 후 앱 재시작 또는 다음 API 호출 시 Free 상태. Pro 권한 즉시 박탈. (adr-17 A, adr-21) |
| S6 | 디바이스 변경 / 재설치 → 동일 Apple/Google 계정 로그인 → RevenueCat customer info 자동 복원 → backend sync → Pro 상태 복원 | 재설치 후 로그인 시 이전 구독 유지. "구독을 복원했습니다" 안내. |

### 엣지 시나리오

| # | 이벤트 | 사용자 기대 |
|---|--------|------------|
| E1 | 결제 시트 오픈 직후 사용자가 취소 | 결제 전 상태(Free/Trial) 유지. 오류 메시지 없음. |
| E2 | 결제 성공했으나 backend sync 실패 (네트워크/서버 다운) | RevenueCat 이 source of truth — 앱 재시작 시 RevenueCat customer info 복원 → backend lazy sync. 사용자는 Pro 권리 잃지 않음. |
| E3 | RevenueCat webhook 누락 (backend 미수신) | RevenueCat 이 자동 재시도. backend 는 5xx 응답 시 재시도 수신. 앱에서 customer info polling 으로 보완 가능 (D-PLAN-2-1 결정). |
| E4 | 동일 Apple ID 로 다중 디바이스 동시 결제 시도 | RevenueCat 이 중복 처리 방지. backend 멱등성 보장 (transaction_id 중복 INSERT 방지). |
| E5 | Trial 사용자가 스토어 결제 진행 — introductory offer 적용 여부 | D-PLAN-2-2 결정에 따름. Phase 1 backend trial 이력 있는 사용자가 RevenueCat introductory offer 대상인지 여부 확인 필요. |
| E6 | 시계 변조로 만료 회피 시도 | RevenueCat 이 server-side 영수증 검증 (Apple/Google). backend 는 RevenueCat customer info 의 `expiration_date` 신뢰 (클라이언트 시계 무시, Phase 1 D-PLAN-4 답습). |
| E7 | Phase 1 mock 결제 이력 보유 사용자가 Phase 2 실제 결제 진행 | `subscription_events` 에 `source='mock'` 이력 보존 + 신규 `source='revenuecat'` 이력 추가. 두 source 공존. 집계 시 source 필터링 필요. |
| E8 | Anonymous(게스트) 사용자가 paywall 도달 | Phase 1 결정(D-PLAN-9/adr-13) 그대로: 로그인 유도 → 로그인 후 paywall. 게스트 결제 후 가입 시 복원은 Phase 2 에서도 미지원 (D-PLAN-2-7 결정에 따름). |
| E9 | 결제 수단 만료 → 갱신 실패 → RevenueCat in_grace_period 이벤트 | D-PLAN-2-8 결정. grace period 동안 Pro 유지 또는 expired 전환. Apple 최대 16일, Google 최대 30일. |
| E10 | RevenueCat SDK 초기화 실패 (네트워크 없음) | backend `GET /users/me` 의 `subscription_status` 로 fallback. 오프라인 시 마지막 캐시 상태 표시. |

---

## 2. 입력·출력 요구

### 2-1. RevenueCat ↔ backend 동기화 흐름

Phase 1 은 `POST /api/subscription/mock-purchase` → backend 직접 상태 변경이었으나, Phase 2 는 RevenueCat 이 source of truth.

```
[Mobile App]
  ↓ Purchases.purchasePackage()
[RevenueCat SDK (native)]
  ↓ Apple/Google 영수증 검증
[RevenueCat Server]
  ├─ customer info 갱신
  └─ webhook → [Backend]

[Mobile App]
  ↓ (D-PLAN-2-1 결정: webhook 만 / client 호출도 추가)
[Backend POST /api/subscription/verify]
  ↓ subscription_events INSERT (source='revenuecat')
  ↓ User.subscription_status / pro_until 갱신
  ← 200 OK (subscription_status, pro_until)
```

### 2-2. 새로운 / 변경 endpoint

| endpoint | 변경 방향 | 메모 |
|----------|---------|------|
| `POST /api/subscription/verify` | **신규** — RevenueCat customer info 또는 receipt token 수신, backend sync | D-PLAN-2-1: client 호출 여부 결정 |
| `POST /api/subscription/webhook` | **신규** — RevenueCat webhook 수신 (환불·취소·갱신·grace-period) | Authorization 헤더 또는 webhook secret 검증 (D-PLAN-2-9) |
| `POST /api/subscription/mock-purchase` | **유지** — staging 전용, prod ENV 가드 | Phase 2 에서도 디버그용 보존 (사용자 결정) |
| `GET /api/users/me` | **재사용** — Phase 1 V2 응답 그대로 | RevenueCat sync 후 `subscription_status / pro_until / is_pro` 가 일치 확인 필요 |
| `POST /admin/debug/subscription` | **유지** — staging 전용 | Phase 2 에서도 보존 |

### 2-3. subscription_events 변경

- `source='revenuecat'` 신규 행 추가. Phase 1 테이블 스키마 그대로 (마이그 0).
- `transaction_id` (RevenueCat transaction_id) 기반 멱등성: 동일 `transaction_id` 중복 INSERT 방지.
- `receipt_data` 컬럼 (nullable): RevenueCat customer info JSON 저장. Phase 1 `spec-05-subscription-data-model` 에서 이미 nullable 추가 예정.

### 2-4. paywall.tsx 변경 (유일한 mobile 변경 지점)

| 항목 | Phase 1 | Phase 2 |
|------|---------|---------|
| 구매 trigger | `POST /api/subscription/mock-purchase` | `Purchases.purchasePackage()` (RevenueCat RN SDK) |
| 결제 시트 | 없음 (백엔드 직접 전환) | iOS/Android native 결제 시트 (SDK 제공) |
| 가격 표시 | $1.99 하드코딩 | RevenueCat `Package` 에서 동적 로드 (현지화 통화 포함) |
| 구매 후 처리 | 백엔드 응답으로 상태 갱신 | RevenueCat customer info → D-PLAN-2-1 결정 경로로 backend sync |

### 2-5. subscription_status 신뢰원 (D-PLAN-2-11)

| 구분 | Phase 1 | Phase 2 |
|------|---------|---------|
| 신뢰원 | backend `pro_until` lazy expiry check | RevenueCat customer info `entitlements.expiration_date` → backend sync 캐시 |
| 앱 조회 경로 | `GET /users/me` | 동일 (`GET /users/me`) — webhook 으로 backend 를 최신 유지 |
| offline fallback | 마지막 캐시 | RevenueCat SDK 로컬 캐시 + backend 캐시 이중 fallback |

---

## 3. 비기능 요구 (정성)

### 결제·sync 정확성

- **영수증 위변조 방어**: client 가 보낸 영수증을 backend 가 직접 신뢰하지 않음. RevenueCat 이 Apple/Google server-side 검증 후 customer info 발급 — backend 는 customer info 또는 webhook 만 신뢰.
- **결제 성공 후 sync 실패 복원**: 결제 완료 + backend sync 실패 시에도 RevenueCat 이 source of truth 이므로 앱 재시작 시 customer info 복원 → lazy backend sync. 사용자가 결제 권리를 잃지 않음.
- **멱등성**: 동일 `transaction_id` 중복 webhook 수신 시 `subscription_events` 중복 INSERT 없음. Phase 1 mock-purchase 멱등 패턴 답습.

### 신뢰성

- **webhook 재시도**: RevenueCat 이 자동 재시도. backend 는 5xx 응답 시 재시도 처리, 2xx 응답 시 이벤트 처리 완료.
- **오프라인 복원**: 앱 재설치 / 디바이스 변경 후 동일 Apple/Google 계정 로그인 시 RevenueCat customer info 자동 복원 → backend sync.

### 사용자 신뢰

- 환불·취소 이벤트가 webhook 수신 즉시 backend 에 반영되어 앱에 표시.
- 취소 후 만료일까지 Pro 유지 상태를 설정 화면에 명확히 표시 (S3 시나리오).
- 만료 직전 앱 내 배너 (Phase 1 `TrialExpiringBanner` 답습). 푸시 알림은 Phase 3.

### 회계 추적성

- `subscription_events` append-only 유지. Phase 1 audit pattern 그대로.
- Phase 2 신규 이벤트는 `source='revenuecat'`, Phase 1 이력은 `source='mock'` 보존. 실 매출 집계 시 `source='revenuecat'` 필터.

### 개발자 경험

- Phase 1 의 mock-purchase / `/admin/debug/subscription` 은 Phase 2 에서도 staging 환경 유지 (사용자 결정). prod 에서는 ENV 가드.
- RevenueCat sandbox 계정으로 Phase 2 결제 시나리오 시뮬레이션 가능 (App Store Sandbox / Google Play Test).

---

## 4. 제약 / 가정

### 사전 준비 — Phase 2 코드 진행 가능, 실기 검증 불가 차단 요소

아래 3개가 준비되지 않으면 Phase 2 코드 구현은 진행 가능하지만 sandbox/실 검증이 불가능하다.

1. **Apple Developer 계정 + App Store Connect** — 월 $1.99 USD 단일 in-app 구독 상품 등록 (product_id 정의). adr-11 월 only 결정 적용.
2. **Google Play Console** — 동일 상품 등록 ($1.99/월).
3. **RevenueCat 계정 + project** — Apple/Google 연동, offerings/entitlements 설정, `REVENUECAT_API_KEY` (public SDK key + secret webhook key) 발급.

### Phase 1 자산 그대로 활용 (마이그 0 원칙)

- `subscription_events` 테이블 + `source` 컬럼: 변경 없음.
- `User` 컬럼 6개: 변경 없음.
- 5-state ENUM (`free / trial / pro / expired / cancelled`): RevenueCat 이벤트 매핑은 §2-5 및 D-PLAN-2-8 참조.
- `paywall.tsx` UI: 구매 trigger 만 교체, 레이아웃/UX 변경 없음.
- mock-purchase API + debug API: staging 유지.

### Phase 2 신규 가입자 — trial 기동 방식 변경 (D-PLAN-2-2 B)

- **가입 시 backend trial 자동 시작 제거**: `auth_service.py` 의 가입 시 `subscription_status='trial'` + `trial_started` event INSERT 로직 삭제. Phase 2 신규 가입자는 `subscription_status='free'`, `trial_start_date=NULL` 로 생성.
- **trial 진입 시점**: paywall 의 `Purchases.purchasePackage()` 성공 → RevenueCat introductory offer 적용 → backend verify 경로 → `subscription_status='trial'`.
- **Phase 1 기존 사용자**: 자연 종료. 이미 박힌 `trial_start_date` + `subscription_status='trial'` 데이터 **마이그레이션 없이 그대로 보존**. 만료 후 RevenueCat 이 Apple/Google 계정 기준 introductory offer eligibility 자체 판단.
- `subscription_events` 의 `trial_started` event_type: Phase 2 신규 가입자 가입 시점 INSERT 제거. RevenueCat `INITIAL_PURCHASE` 이벤트 수신 시 trial 진입으로 기록.

### Phase 1 → Phase 2 데이터 호환

| 항목 | 처리 방식 |
|------|---------|
| Phase 1 mock 결제 이력 (`source='mock'`) | 보존. 실 매출 집계 시 필터링 |
| Phase 2 신규 이력 (`source='revenuecat'`) | 동일 테이블 공존 |
| `is_pro` 캐시 컬럼 | Phase 2 에서 deprecated 예정 — `subscription_status` 단일 source of truth 로 전환 (D-PLAN-2-11) |

### 플랫폼 범위

- iOS + Android 양쪽. Phase 1 은 OS 무관 mock 이었으나 Phase 2 는 각 스토어 native 결제 시트.
- `react-native-purchases` (RevenueCat RN SDK) 로 iOS/Android 통합.

### 인증·계정

- RevenueCat `app_user_id` ↔ backend `user_id` 매핑 정책: D-PLAN-2-7 결정.
- Anonymous(게스트) 사용자: Phase 1 정책 그대로 paywall 차단 (adr-13 답습). 게스트 결제 후 가입 시 복원은 미지원.

### 법적 TBD (Phase 2 출시 전 확정 필요)

Phase 1 정책 문서에 남은 미확정 5개 항목. D-PLAN-2-6 에서 확정 시점 결정.

| # | 항목 | 현황 |
|---|------|------|
| TBD-1 | 관할 법원 | 미확정 (한국 법원 가정) |
| TBD-2 | 클라우드 호스팅사 명시 | 미확정 |
| TBD-3 | Phase 2 출시 목표일 | 미확정 |
| TBD-4 | 분석 SDK (Mixpanel 등) | 미확정 |
| TBD-5 | 일할 환불 정책 | D-PLAN-2-4 결정에 따름 |

> Phase 1 정책 초안 (`policy-03-terms-of-service`, `policy-04-privacy-policy`, `policy-05-subscription-refund`) 은 한국어, 법무 검토 전. 글로벌 출시 시 영어 번역 필요.

---

## 5. 결정이 필요한 항목

### D-PLAN-2-1: 영수증 검증 trigger

RevenueCat 결제 완료 후 backend subscription_status 를 어떤 경로로 갱신할지.

| 안 | trigger | 장점 | 단점 |
|---|---------|------|------|
| A | **client → `POST /api/subscription/verify`** (구매 직후 mobile 이 RevenueCat customer info 를 backend 에 전달) | 결제 후 즉시 backend 갱신, UX 지연 없음 | 네트워크 실패 시 재시도 로직 필요. client 가 위조한 customer info 방어 필요 (RevenueCat server-side fetch 권장) |
| B | **RevenueCat webhook → backend** (RevenueCat 서버가 backend 에 이벤트 push) | 환불·취소·갱신·grace-period 등 모든 이벤트 포함. 서버-to-서버라 위조 불가 | 수신 지연 (보통 수 초~수 분). 구매 직후 즉시 Pro unlock UX 에 지연 발생 가능 |
| **C** | **A + B 이중 경로** | 구매 즉시 Pro unlock (A) + 환불·취소·갱신 이벤트 처리 (B) | 구현 복잡도 증가. A 와 B 의 중복 이벤트 멱등 처리 필요 |

**권장: C** — RevenueCat Best Practice. A 로 구매 즉시 UX 보장, B 로 라이프사이클 이벤트 (환불/취소/갱신 실패) 처리. A 의 customer info 는 RevenueCat SDK 가 서명하므로 backend 에서 RevenueCat API 재확인으로 위조 방어 가능. B 의 webhook secret 검증으로 위변조 방어.

---

### D-PLAN-2-2: 트라이얼 정책 (Phase 2)

Phase 1 에서는 가입 즉시 backend 에서 7일 trial 자동 시작 (D-PLAN-2 확정). Phase 2 에서 스토어 introductory offer 와 어떻게 연계할지.

| 안 | 정책 | 장점 | 단점 |
|---|------|------|------|
| A | **Phase 1 그대로 유지** — backend trial 7일, RevenueCat introductory offer 미사용 | Phase 2 trial 로직 변경 없음. 이미 trial 소진한 사용자 처리 불필요 | 스토어 표준 introductory offer 미활용. Apple/Google 에 "트라이얼 제공" 부각 효과 없음 |
| **B** | **RevenueCat introductory offer** — Phase 2 부터 스토어 표준 7일 무료 → 자동 결제 전환 | Apple/Google 스토어 검색 노출 향상 ("7일 무료 체험" 배지). RevenueCat 이 trial eligibility 관리 (재사용 방지 자동). | Phase 1 backend trial 이력 사용자가 introductory offer 대상에서 제외될 수 있음. 플로우 변경 (자동 결제 전환 고지 필요). |
| C | **하이브리드** — 가입 시 backend trial, Phase 2 결제 시점에 introductory offer 비노출 | Phase 1 사용자 연속성 유지 | 복잡도 높음. RevenueCat eligibility 와 backend trial 이중 관리 |
| ~~D~~ | ~~가입 즉시 backend trial 유지 + introductory offer 미사용~~ | — | **폐기** — "가입 시 7일 무료 받았는데 결제할 땐 무료 X" 혼란 발생. 결제 정보 등록 시점이 trial 만료 *후* 가 되어 Apple/Google 표준 흐름(가입 직후 결제 정보 + 무료 체험)과 어긋남. 사용자 마찰 최대. |

**결정: B 채택** (adr-16 기준 확정).

**B 채택의 구체적 의미 (adr-16 에서 명확화)**:
1. `auth_service.py` 의 가입 시 `subscription_status='trial'` 자동 설정 + `trial_started` INSERT **제거**
2. Phase 2 신규 가입자 = 가입 시 `subscription_status='free'`, `trial_start_date=NULL`
3. trial 시작 = 온보딩 후 paywall 의 `Purchases.purchasePackage()` (introductory offer 적용) 성공 시점
4. Phase 1 기존 사용자 = 자연 종료. 데이터 마이그 없음. RevenueCat 이 Apple/Google 계정 기준 eligibility 자체 추적.

D-PLAN-2-3 (자동 결제 전환) 과 연동: A 채택 (스토어 표준 자동 갱신).

---

### D-PLAN-2-3: trial 만료 시 자동 결제 여부

D-PLAN-2-2 와 연동. introductory offer 표준 또는 명시 동의 중 선택.

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **Apple/Google introductory offer 표준** — trial 만료 시 자동 결제 전환 (D-PLAN-2-2 B 선택 시 자동 결정) | 스토어 표준 흐름. 전환율 높음. RevenueCat 이 관리. | 한국 전자상거래법 자동 갱신 고지 의무 충족 필요. 사용자가 만료 전 취소 안 하면 결제됨. |
| B | **명시 동의** — trial 만료 시 paywall 다시 노출, 사용자가 직접 구매 액션 | 사용자 능동 동의. 불필요 결제 민원 최소화. | 전환율 낮음. introductory offer 미사용 시 스토어 혜택 없음. D-PLAN-2-2 B 와 상충 |

**권장: A** — D-PLAN-2-2 B 선택 시 스토어 표준상 자동. 단, 한국 법상 자동 갱신 사전 고지 (결제 7일 전 이메일/앱 내 알림) 필수 확인. Phase 3 푸시 알림과 연계.

---

### D-PLAN-2-4: 환불 정책

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **Apple/Google 이 처리** (스토어 정책 위임, 회사 개입 없음) | 운영 부담 0. in-app purchase 기본. 한국 결제법도 스토어가 대행 | 회사가 환불 조건 커스터마이징 불가 |
| B | **회사 직접 환불** (잔여 일수 일할 환불) | 사용자 유연성. `policy-05-subscription-refund` 초안 내용 | 백오피스 어드민 구현 필요. 스토어 외 결제 수단 없으면 현실적으로 불가 |
| C | **A 기본 + 특수 케이스만 B** | 대부분 자동 + 예외 처리 가능 | 기준 불명확, 운영 부담 발생 |

**권장: A** — in-app purchase 기반이면 Apple/Google 이 자동 처리. `policy-05-subscription-refund` 초안의 일할 환불 조항은 Phase 2 에서 A 로 대체 (스토어 정책 명시). 법무 검토 후 확정.

---

### D-PLAN-2-5: subscription_events 의 plan 값

adr-11 (monthly-only) 의 Phase 2 적용 여부.

| 안 | plan 값 | 장점 | 단점 |
|---|--------|------|------|
| **A** | **'monthly' only** (adr-11 결정 유지) | 스키마 단순. Phase 1 결정 일관성. | yearly 재도입 시 ADR 갱신 필요 |
| B | **'monthly' + 'yearly'** (Phase 2 에서 yearly 부활) | 연 가격 도입 가능 | adr-11 번복. 스토어 상품 2개 등록 필요. paywall UI 변경. |

**권장: A** — adr-11 결정 유지. Phase 2 에서도 월 $1.99 단일 상품. yearly 도입 필요 시 별도 ADR 작성 후 adr-11 supersedes 처리.

---

### D-PLAN-2-6: TBD 5개 확정 시점

Phase 1 약관/정책 문서에 남은 미확정 항목(관할 법원/클라우드 호스팅사/출시일/분석SDK/일할환불) 의 확정 시점.

| 안 | 시점 | 장점 | 단점 |
|---|------|------|------|
| **A** | **Phase 2 코드 task 발행 전 확정** | 약관에 법적 필수 정보 누락 없이 Phase 2 진입 | 확정 지연 시 Phase 2 진입 차단 |
| B | **코드 진행 병행, 점진 채움** | Phase 2 병렬 진행 가능 | 약관 미완성 상태로 sandbox 테스트 진행 → 출시 직전 급하게 처리 위험 |
| C | **출시 직전 일괄 처리** | Phase 2 가장 빠른 진입 | 법적 리스크 가장 큼. 약관 미완성 앱 스토어 제출 가능성 |

**권장: A** — 관할 법원·클라우드 호스팅사는 약관 본문에 명시 필수. 실제 결제가 일어나는 Phase 2 출시 전 확정이 한국 전자상거래법 최소 요건. 확정 지연 시 Phase 2 진입 일정에 반영.

---

### D-PLAN-2-7: RevenueCat app_user_id ↔ backend user_id 매핑 정책

| 안 | 매핑 시점 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **가입 즉시** — `Purchases.logIn(user_id)` 로 backend user_id 를 RevenueCat app_user_id 로 설정 | 구현 단순. 이중 계정 없음. RevenueCat 이력 = backend 이력 1:1 일치 | 가입 시점에 RevenueCat SDK 초기화 필요 |
| B | **결제 시점** — paywall 도달 시 로그인 | RevenueCat SDK 초기화 지연 가능 | 가입~paywall 사이 기간 anonymous ID 사용 → merge 처리 필요 |
| C | **익명 매핑 후 가입 시 merge** — anonymous ID 로 결제 → 가입 시 `Purchases.logIn()` 으로 user_id 로 merge | 로그인 전 결제 지원 가능 | Phase 1 정책(adr-13: 인증 필수) 과 상충. merge 복잡도. |

**권장: A** — 가입 시점에 `Purchases.logIn(user_id)` 호출. Phase 1 정책(인증 필수 paywall) 과 일치. 구현 최단순.

---

### D-PLAN-2-8: RevenueCat in_grace_period 동안 subscription_status 처리

결제 수단 만료로 갱신 실패 시 Apple(최대 16일)/Google(최대 30일) 이 grace period 를 부여.

| 안 | 처리 방식 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **grace period 동안 Pro 유지** — `in_grace_period` 이벤트 수신 시 `subscription_status='pro'` 유지 + `pro_until` 연장 | 사용자 경험 보호. Apple/Google 권장 정책. | grace period 종료 후 expired 전환 로직 필요 |
| B | **즉시 expired 전환** — `in_grace_period` = `subscription_status='expired'` | 구현 단순 | 사용자가 결제 수단 업데이트 기회 전에 Pro 기능 박탈. App Store 가이드라인 위반 가능 |

**권장: A** — Apple/Google 가이드라인상 grace period 동안 Pro 기능 유지 권장. 5-state ENUM 에 `in_grace_period` 를 6번째 state 로 추가할지 vs `pro` 상태로 처리할지는 spec 단계에서 결정. Phase 1 스키마에 이미 ENUM 변경 여지 있음.

---

### D-PLAN-2-9: RevenueCat webhook 검증 방식

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **Authorization Bearer** — RevenueCat 대시보드에서 설정한 webhook secret 을 Bearer token 으로 검증 | RevenueCat 표준. 구현 단순. | token 유출 시 위변조 가능 (HTTPS + 환경변수 저장으로 방어) |
| B | **HMAC signature** | 높은 보안 | RevenueCat 표준이 아님. 커스텀 구현 필요. |

**권장: A** — RevenueCat 공식 문서 권장 방식. `REVENUECAT_WEBHOOK_SECRET` 환경변수 저장, HTTPS 강제. 구현 1일 이내.

---

### D-PLAN-2-10: 환불·취소 시 subscription_status 전환 시점

| 이벤트 | 안 A (즉시 전환) | 안 B (만료일까지 유지) |
|--------|--------------|-------------------|
| **환불** (RevenueCat `REFUND` / `CANCELLATION` + 영수증 무효) | 즉시 `cancelled` 전환 | — (환불 = 영수증 무효 = Pro 근거 없음) |
| **갱신 취소** (사용자가 스토어에서 구독 취소, 다음 갱신 안 함) | 즉시 `cancelled` 전환 | `cancelled` 기록 + 만료일(`pro_until`)까지 `pro` 기능 유지 → 만료 시 `expired` |

| 안 | 환불 | 취소 | 장점 | 단점 |
|---|------|------|------|------|
| A | 즉시 전환 | 즉시 전환 | 단순 | 갱신 취소 후 만료일 전 Pro 기능 박탈 → 사용자 반발 |
| **B** | **즉시 전환** | **만료일까지 Pro 유지** | 환불/취소 구분 처리. 취소 사용자 경험 보호. 스토어 표준 | 구현 약간 복잡 (cancelled + pro_until 두 필드 체크) |
| C | 만료일까지 유지 | 만료일까지 유지 | 단순 | 환불 후에도 Pro 유지 = 무임승차 허용 |

**권장: B** — 환불(영수증 무효)은 즉시 cancelled, 갱신 취소(자발적)는 만료일까지 Pro 유지. Phase 1 5-state 스키마의 `cancelled` 상태 의미와 일치. S3 시나리오 구현 기준.

---

### D-PLAN-2-11: subscription_status 신뢰원

| 안 | 신뢰원 | 장점 | 단점 |
|---|--------|------|------|
| A | **RevenueCat customer info 우선** — 앱 시작 시마다 `Purchases.getCustomerInfo()` → 최신 상태 | 항상 최신. Phase 2 시작 즉시 단순 구현 | backend 와 항상 sync 필요. RevenueCat SDK 오프라인 시 fallback 로직 필요 |
| **B** | **backend 캐시 우선 + webhook sync** — 앱은 `GET /users/me` 조회, webhook 으로 backend 최신 유지 | API 구조 Phase 1 그대로 유지. 오프라인 fallback 자연스럽게 처리 | webhook 지연 시 일시적 상태 불일치 (수 초~수 분). 보완: 구매 직후 D-PLAN-2-1 A 경로로 즉시 sync |
| C | RevenueCat + backend 동시 조회, 불일치 시 RevenueCat 우선 | 이론적 정합 최대 | 구현 복잡도 최대. API 호출 2배 |

**권장: B** — Phase 1 API 구조 유지. webhook 으로 backend 최신 상태 유지, 앱은 `GET /users/me` 로 조회. 구매 직후에는 D-PLAN-2-1 C (client + webhook 이중 경로) 로 즉시 sync 보장. RevenueCat SDK 는 오프라인 복원/sandbox 디버그용으로 활용.

---

## 6. 명시적 비목표 (Out of Scope for Phase 2)

- **가족 공유 / 학교·단체 라이선스**: Phase 1 정책 유지, 미지원
- **기프트 코드 / 프로모션 코드**: Phase 1·2·3 모두 미포함
- **다국가 통화·세금 자동 처리**: Apple/Google/RevenueCat 이 표시 통화 처리. backend 는 USD 기준 단일 가격 ($1.99/월)
- **웹 클라이언트 결제 UI**: mobile only. web 은 legacy MVP, Phase 2 미대상
- **사용자별 가격 차등 / A/B 테스트 가격**: 미지원
- **yearly / lifetime / 학생 할인 플랜**: D-PLAN-2-5 A 결정 (월 only). yearly 재도입은 별도 ADR 필요
- **푸시 알림 (만료 D-1/H-1, 갱신 실패)**: Phase 3 통합 — Expo notifications + APNs/FCM
- **인앱 영수증 이메일**: 스토어 자체 발송으로 대체
- **게스트(anonymous) 결제 후 가입 시 구독 복원**: 미지원 (adr-13 정책 유지)
- **환불 자동화 버튼 (앱 내)**: 스토어 경유 (D-PLAN-2-4 A)
- **구독 중 플랜 변경**: 월 단일 플랜이므로 해당 없음
- **`is_pro` 컬럼 즉시 제거**: Phase 2 에서 deprecated 표시 후 Phase 3 이후 제거 (legacy 호환)

---

## 영향 범위 분석

| 영역 | 영향 | 변경 내용 |
|------|------|---------|
| backend/api | ○ | `POST /api/subscription/verify` 신규, `POST /api/subscription/webhook` 신규. 기존 테이블/컬럼 변경 없음. |
| frontend/mobile-fe | ○ | `react-native-purchases` SDK 추가, `paywall.tsx` 구매 trigger 교체 (D-PLAN-2-1). 나머지 UI 변경 없음. |
| frontend/shared-fe | × | 영향 없음 |
| frontend/web-fe | × | 영향 없음 |
