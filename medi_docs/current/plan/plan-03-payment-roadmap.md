---
id: plan-03
type: plan
title: 결제(구독) 도메인 로드맵
status: draft
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[planning-02-payment]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-11-monthly-only-no-yearly]]"
  - "[[adr-12-mock-purchase-api-and-events]]"
  - "[[adr-13-anonymous-paywall-and-terms]]"
  - "[[adr-14-phase1-execution-strategy]]"
tags: [plan, payment, subscription, trial, paywall, roadmap]
---

# 결제(구독) 도메인 로드맵

## Summary

`planning-02-payment` 의 D-PLAN-1~10 합의를 기반으로, 결제/구독 도메인을 3개 Phase 로 분해한다. Phase 1 은 스토어 SDK 없이 백엔드 중심의 내부 결제 로직 완결, Phase 2 는 RevenueCat 스토어 연동, Phase 3 은 푸시 알림. Phase 1 내부에서 backend 와 mobile-fe 는 API 계약 확정 후 병렬 진행 가능.

---

## 합의된 결정 사항 (planning-02 D-PLAN-1~10)

| # | 결정 내용 |
|---|----------|
| D-PLAN-1 | Phase 1 결제 트리거 = **전용 `POST /api/subscription/mock-purchase` API** (debug API 별도 분리) |
| D-PLAN-2 | 트라이얼 시작 = **가입 즉시 자동** (`trial_start_date = today`, `subscription_status = "trial"`) |
| D-PLAN-3 | 만료 후 동작 = **즉시 free 전환 + 사전 24h/1h 앱 내 배너** |
| D-PLAN-4 | 일일 한도 리셋 = **사용자 로컬 자정** (서버 시계 기준, User 에 `timezone` 컬럼 필요) |
| D-PLAN-5 | 결제 이력 = **모든 이벤트 append-only** (`subscription_events` 테이블) |
| D-PLAN-6 | mock→real 마이그레이션 = **이력 보존 + `source="mock"` 컬럼** |
| D-PLAN-7 | 트라이얼 재사용 방지 = **Phase 1 방지 안 함**, Phase 2 에서 RevenueCat 기반 처리 |
| ~~D-PLAN-8~~ | ~~플랜 tier = **월 + 연 2-tier**~~ → **월 only $1.99** (adr-11 로 변경, 연 폐기) |
| D-PLAN-9 | Anonymous paywall = **로그인 유도 후 paywall** |
| D-PLAN-10 | 약관 표시 시점 = **가입 + paywall 양쪽** (한국 전자상거래법 최소 준수) |

### 미결 4개 응답 (planning 단계 확정)

1. **구독 가격**: 월 **$1.99** 확정. 연 가격 미정 → Phase 2 App Store Connect 등록 전까지 보류 (Phase 2 진입 차단 요소)
2. **트라이얼 만료 알림**: Phase 1 = **앱 내 배너만**. 푸시 알림은 Phase 3
3. **sub-state 확장**: **Phase 1 스키마에 `expired` / `cancelled` 미리 포함** (5-state: free/trial/pro/expired/cancelled)
4. **paywall.tsx Feature Table**: 기존 목데이터 (`3/day`, `720p`, `1080p`, `Cloud sync`) **폐기 → 아래 실제 Feature 정의로 교체**

### 확정 Feature 정의 (paywall.tsx 교체 기준)

| 플랜 | 일일 횟수 | 워터마크 | 프로그레스바 |
|------|---------|---------|-----------|
| Free | **1회/일** | 있음 | 없음 (🔒) |
| Trial | 무제한 | **제거** | 사용 가능 |
| Pro | 무제한 | **제거** | 사용 가능 |

---

## 1. Phase 분해

| Phase | 목표 (한 줄) | 핵심 산출물 (후속 spec/policy/adr 후보) | 코드 영향 영역 | 의존성 |
|---|---|---|---|---|
| **Phase 1a — DB + API** | 구독 상태 모델·이벤트 로그·mock-purchase·debug API 구현 | spec-03, spec-04, adr-10, adr-11, adr-12, policy-01, policy-02 | backend/api | 없음 |
| **Phase 1b — mobile-fe 연동** | paywall mock-purchase 연동, Feature Table 교체, Free 가드, 트라이얼 배지/배너 | spec-03 (API 계약 참조) | frontend/mobile-fe | Phase 1a API 계약 확정 후 병렬 가능 |
| **Phase 1c — 약관 UI** | 가입 + paywall 양쪽 약관 노출 | 약관 텍스트 사전 준비 필요 | frontend/mobile-fe | Phase 1b 와 병렬 가능 |
| **Phase 2 — 스토어 연동** | RevenueCat SDK + 영수증 검증 + 환불/취소 처리 | spec-05, spec-06, policy-03, adr-13 | backend/api, mobile-fe | Phase 1 완료 + 연 가격 확정 + App Store Connect 사전 등록 |
| **Phase 3 — 푸시 알림** | 트라이얼/구독 만료 24h/1h 푸시 알림 | spec-07 | backend/api, mobile-fe | Phase 2 완료 + notification 인프라 spec 선행 |

### Phase 조정 사유

- **Phase 1 을 1a/1b/1c 로 분리**: backend (DB + API) 와 mobile-fe (paywall UI) 는 API 계약만 공유하면 병렬 진행 가능. 약관 UI(1c)는 텍스트만 준비되면 1b 와 동시 진행 가능 → 전체 Phase 1 납기 단축.
- **Phase 3 분리 유지**: 푸시 알림은 notification 인프라(APNs/FCM 등록, 별도 spec)가 선행 필요. 결제 도메인 핵심 흐름과 직교.
- **`expired/cancelled` sub-state Phase 1 포함**: Phase 2 RevenueCat 이벤트(환불·취소)가 이 상태로 바로 매핑됨. Phase 1에서 스키마 확정해 두면 Phase 2 스키마 변경 0.

---

## 2. 의존성 그래프

```
Phase 1a — backend (DB + API)          ← 선행 없음. 즉시 시작
  │  [subscription_events 테이블]
  │  [mock-purchase API]
  │  [debug API (스테이지 전용)]
  │  [GET /users/me 구독 상태 확장]
  │
  ├─── API 계약 확정 (spec-03/spec-04) ──────────────┐
  │                                                  │
  ▼                                                  ▼
Phase 1b — mobile-fe 연동          Phase 1c — 약관 UI
  [paywall mock-purchase 연동]        [가입/paywall 약관 텍스트 노출]
  [Feature Table 교체]                [약관 텍스트 준비 필요]
  [Free 가드 + 트라이얼 배지]
  [트라이얼 만료 배너 (앱 내)]
         │                                           │
         └──────────────── Phase 1 완료 ─────────────┘
                                  │
                    [차단: App Store Connect 월 $1.99 단일 상품 등록]
                                  │
                                  ▼
              Phase 2 — RevenueCat 스토어 연동
                [SDK + 영수증 검증 + 환불/취소]
                [mock 이력 source="mock" 보존]
                [트라이얼 재사용 방지]
                                  │
                    [차단: notification 인프라 spec]
                                  │
                                  ▼
              Phase 3 — 푸시 알림
                [트라이얼/구독 만료 24h/1h]
                [갱신 실패/환불 알림]
```

### 병렬 진행 가능 영역

- Phase 1a (backend) ↔ Phase 1b (mobile-fe): API 계약(spec-03/spec-04) 확정 직후 동시 시작 가능
- Phase 1b ↔ Phase 1c (약관 UI): 완전 병렬 가능 (서로 의존 없음)
- Phase 1 (결제) ↔ plan-01 Phase 1 (녹화 파이프라인): 완전 독립. 병렬 진행 가능

---

## 3. Phase별 후속 산출물 매핑

| Phase | 후속 문서 후보 | 카테고리 | 설명 |
|---|---|---|---|
| 1a | `spec-03-subscription-state-machine` | spec | 5-state 전이 규칙 (free/trial/pro/expired/cancelled), 트리거 이벤트, 불변조건 |
| 1a | `spec-04-subscription-api` | spec | mock-purchase / debug / GET users/me 확장 Request·Response 계약 |
| 1a | `spec-05-subscription-data-model` | spec | `subscription_events` 테이블 스키마 (컬럼, 인덱스, append-only 보장) |
| 1a | `policy-01-daily-quota` | policy | Free 1회/일 기준 이벤트, 사용자 로컬 자정 리셋, 서버 시계 우선 원칙 |
| 1a | `policy-02-trial` | policy | 트라이얼 7일 고정, 만료 기준 시각(trial_start_date + 7일 자정 UTC), 재사용 방지(Phase 2까지 보류) |
| 1a | `adr-10-mock-purchase-api-design` | adr | D-PLAN-1: 전용 mock-purchase API 선택 사유, Phase 2 교체 계획 |
| 1a | `adr-11-timezone-source` | adr | D-PLAN-4: 사용자 로컬 자정 선택 사유, 서버 시계 우선 + timezone 컬럼 저장 |
| 1a | `adr-12-substate-from-day1` | adr | D-PLAN-3 + 미결-3: expired/cancelled Phase 1 포함 사유, RevenueCat 매핑 호환 |
| 2 | `spec-06-revenuecat-integration` | spec | RevenueCat SDK 설정, webhook 처리, iOS/Android 영수증 검증 |
| 2 | `spec-07-receipt-verification` | spec | App Store / Play Store 영수증 검증 흐름, 환불 처리 |
| 2 | `policy-03-refund-cancel` | policy | 환불 자동 처리 범위, grace period, cancelled → free 전환 조건 |
| 2 | `adr-13-trial-reuse-prevention` | adr | D-PLAN-7: Phase 2 RevenueCat anonymous user ID 기반 처리 선택 사유 |
| 3 | `spec-08-subscription-push-notification` | spec | 만료 24h/1h 푸시, 갱신 실패/환불 푸시, APNs/FCM 연동 |

> **번호 기준**: spec ~02, policy 0건(→01부터), adr ~09. 위 번호는 순서 예약이며 실제 작성 시 충돌 재확인 필요.

---

## 4. 마일스톤 / 우선순위

| Phase | 노력 규모 | 차단 위험 | 완료 정의 (DoD) |
|---|---|---|---|
| **1a** | M | 없음 | `subscription_events` 테이블 마이그레이션 완료, mock-purchase / debug / GET users/me API 동작, 가입 즉시 trial 자동 시작 확인 |
| **1b** | M | Phase 1a API 계약 필요 | paywall mock-purchase 1탭 → Pro 전환 → 워터마크 제거 / Free 한도 초과 → paywall 노출 / 트라이얼 배지·만료 배너 앱 내 노출 확인 |
| **1c** | S | 약관 텍스트 준비 | 가입 화면 + paywall 화면 약관 링크/체크박스 노출. 구매 버튼 클릭 전 표시 확인 |
| **2** | L | App Store Connect 월 $1.99 단일 상품 등록 (Phase 2 진입 차단, 연 플랜 불필요 — adr-11) | RevenueCat 구매 플로우 sandbox 테스트 통과, 환불 webhook → free 전환 확인, iOS/Android 양쪽 |
| **3** | S | notification 인프라 spec 선행 (현재 미존재) | 만료 24h/1h APNs/FCM 발송 확인, 오프라인 기기 딜리버리 재시도 확인 |

### 우선순위 근거

- Phase 1 → Phase 2 직렬 필수 (mock→real 교체 순서)
- Phase 1a/1b/1c 는 병렬 → 전체 Phase 1 기간 단축
- Phase 3 는 결제 핵심 흐름과 독립. notification spec 없으면 진입 불가 → 별도 추적

---

## 5. 코드 영역별 영향 요약

| Phase | backend/api | frontend/mobile-fe | frontend/shared-fe | frontend/web-fe |
|---|---|---|---|---|
| 1a | ○ `subscription_events` 테이블 신규, User 모델 `timezone` 컬럼 추가, `mock-purchase` / `debug` API 신규, `GET /users/me` 구독 필드 확장 | × (API 계약 확정 대기) | × | × |
| 1b | × | ○ `paywall.tsx` mock-purchase 연동, Feature Table 교체 ($1.99/월), Free 한도 가드, 워터마크·프로그레스바 분기, 트라이얼 배지/만료 배너 | × | × |
| 1c | × | ○ 가입 화면 + paywall 약관 노출 컴포넌트 추가 | × | × |
| 2 | ○ `POST /api/subscription/verify` RevenueCat 영수증 검증, webhook 수신·처리 | ○ `react-native-purchases` SDK 통합, 구매 플로우 교체 | × | × |
| 3 | ○ 만료 스케줄러 + APNs/FCM 발송 | ○ 푸시 알림 수신 핸들러 | × | × |

> shared-fe: mobile 은 자체 `src/types/` 보유 → 결제 타입 mobile 직접 정의. web-fe: 결제 UI 미대상.

---

## 6. 결정이 필요한 항목 (plan 단계 신규)

### P-PLAN-1: Phase 1 내부 sub-phase 병렬 진행 방식

| 안 | 진행 방식 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **1a API 계약 확정 즉시 1b/1c 병렬 시작** | 전체 Phase 1 기간 단축 | API 계약이 바뀌면 1b 재작업 일부 발생 |
| B | 1a 완전 완료 후 1b/1c 시작 | 재작업 0 | Phase 1 기간 = 1a + 1b 직렬 합산 |

**권장: A** — API spec-03/spec-04 확정 시점을 병렬 시작 기준으로 삼으면 재작업 위험 최소화.

---

### P-PLAN-2: Phase 1 완료 정의 (DoD)

Phase 1 done 을 선언하기 위해 반드시 검증해야 하는 항목 후보:

| 항목 | 필수 여부 |
|------|---------|
| 가입 즉시 trial 자동 시작 | 필수 |
| mock-purchase 1탭 → Pro 전환 즉시 | 필수 |
| Pro: 워터마크 제거 + 프로그레스바 unlock | 필수 |
| Free: 1회/일 초과 → paywall 차단 | 필수 |
| 트라이얼 7일 만료 → free 자동 전환 | 필수 |
| 앱 내 배너: 만료 24h/1h 전 표시 | 필수 |
| debug API 스테이지 전용 (prod 404) | 필수 |
| 가입 + paywall 약관 노출 | 필수 |
| `subscription_events` append-only 감사 이력 | 필수 |
| 다중 디바이스 동일 상태 반영 | **선택 (Phase 1 범위 여부 결정 필요)** |

**결정 필요**: "다중 디바이스 동일 상태 반영"을 Phase 1 DoD 에 포함할지.

---

### P-PLAN-3: 약관 텍스트 작성 책임

| 안 | 담당 | 장점 | 단점 |
|---|------|------|------|
| **A** | **planner 초안 → 사용자/법무 검토** | 즉시 진행 가능 | 법무 검토 없이 prod 노출 리스크 |
| B | 외부 법무 의뢰 후 Phase 1c 진입 | 법적 안전 | 일정 의존, 지연 위험 |
| C | Phase 2 (실제 결제) 전에만 확정 | Phase 1 속도 | Phase 1 mock 결제에도 약관 없음 |

**권장: A** — Phase 1 planner 초안 (이용약관 링크 + 개인정보처리방침 링크 + 동의 문구). 법무 검토는 Phase 2 진입 전 완료.

---

### ~~P-PLAN-4: 연 가격 미정 처리 방식~~

> **폐기 (2026-05-06)**: D-PLAN-8 가 "월+연 2-tier" → "월 only $1.99" 로 변경됨 (`adr-11-monthly-only-no-yearly`). 연 플랜 자체가 폐기되었으므로 "연 가격 미정 처리" 결정 자체가 무효. Phase 1/2/3 모두 월 단일 플랜 운영.
