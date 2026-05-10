---
id: plan-04
type: plan
title: RevenueCat 스토어 연동(Phase 2) 로드맵
status: draft
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
related_to:
  - "[[plan-03-payment-roadmap]]"
  - "[[planning-02-payment]]"
tags: [plan, payment, subscription, revenuecat, phase2]
---

# RevenueCat 스토어 연동(Phase 2) 로드맵

## Summary

`planning-03-revenuecat` 의 D-PLAN-2-1 ~ D-PLAN-2-11 합의를 기반으로, Phase 2(RevenueCat 스토어 연동)를 6개 sub-phase 로 분해한다. Phase 1 자산(5-state 스키마·subscription_events·paywall UI·mock-purchase) 을 마이그레이션 없이 그대로 활용하며, backend(P2.2) 와 mobile(P2.3) 는 병렬 진행 가능하다. P2.0(사전 준비) 완료 전까지 sandbox 실 검증이 차단된다.

---

## 사용자 합의 사항 (D-PLAN-2-1 ~ D-PLAN-2-11, 전부 권장안 채택)

| # | 결정 내용 |
|---|----------|
| D-PLAN-2-1 | 영수증 검증 trigger = **C: client `POST /api/subscription/verify` + RevenueCat webhook 이중 경로** |
| D-PLAN-2-2 | 트라이얼 정책 = **B: RevenueCat introductory offer (스토어 표준 7일 무료 → 자동 결제)** |
| D-PLAN-2-3 | 만료 시 자동 결제 = **A: 스토어 표준 자동 갱신** (한국법 자동 갱신 사전 고지 필수) |
| D-PLAN-2-4 | 환불 정책 = **A: Apple/Google 위임** (회사 직접 환불 X) |
| D-PLAN-2-5 | plan ENUM = **A: monthly only** (adr-11 유지) |
| D-PLAN-2-6 | TBD 5개 확정 시점 = **A: Phase 2 코드 task 발행 전 확정** |
| D-PLAN-2-7 | app_user_id 매핑 = **A: 가입 즉시 `Purchases.logIn(user_id)`** |
| D-PLAN-2-8 | grace period 처리 = **A: grace 기간 동안 Pro 유지** (6번째 state 추가 여부는 spec 단계에서 결정) |
| D-PLAN-2-9 | webhook 인증 = **A: Authorization Bearer (RevenueCat 표준)** |
| D-PLAN-2-10 | 환불·취소 전환 시점 = **B: 환불=즉시 cancelled, 취소=만료일까지 Pro 유지** |
| D-PLAN-2-11 | subscription_status 신뢰원 = **B: backend 캐시 + webhook sync (Phase 1 API 구조 유지)** |

---

## Phase 1 자산 (마이그 0 원칙 — Phase 2 스키마·로직 변경 없이 활용)

| 자산 | Phase 1 상태 | Phase 2 활용 방식 |
|------|------------|-----------------|
| `subscription_events` 테이블 | 구현 완료. `source` 컬럼 `('mock','revenuecat','admin','system')` 포함 | `source='revenuecat'` 신규 행 추가. 마이그 0 |
| `User` 컬럼 6개 | `subscription_status / trial_start_date / pro_until / timezone / terms_agreed_at / privacy_agreed_at` | 동일 컬럼 재사용 |
| 5-state ENUM | `free / trial / pro / expired / cancelled` | RevenueCat 이벤트 매핑. `in_grace_period` 6번째 state 추가 여부는 spec 단계 결정 (D-2-8) |
| `paywall.tsx` UI | 월 $1.99 단일 CTA, 구매 trigger = mock-purchase API | UI 재사용, 구매 trigger 만 `react-native-purchases` SDK 로 교체 |
| mock-purchase API | 구현 완료, staging 디버그용 | Phase 2 staging 유지. prod 에서는 `ENABLE_MOCK_PURCHASE=false` ENV 가드 |
| `/admin/debug/subscription` | staging 전용 | Phase 2 에서도 유지 |
| 약관 UI | 가입 + paywall 양쪽 동의 | 동일. Phase 2 자동 갱신 고지 문구 보강 필요 |

---

## 1. Phase 분해

| Sub-phase | 목표 (한 줄) | 핵심 산출물 (후속 spec/policy/adr 후보) | 코드 영향 영역 | 의존성 |
|---|---|---|---|---|
| **P2.0 — 사전 준비** | Apple/Google/RevenueCat 계정·상품·키 발급 (사용자 영역, 코드 0) | 없음 (외부 등록 완료 증거) | 없음 | — (전 sub-phase 차단) |
| **P2.1 — 약관·TBD 정리** | TBD 5개 확정 + 한국어 약관 자동 갱신 사전 고지 문구 보강 | `policy-03/04/05` 갱신, `adr-NN-trial-policy-introductory-offer`, `adr-NN-refund-policy-store-delegation` | 문서만 | P2.0 과 동시 시작 가능 |
| **P2.2 — backend 결제 인프라** | verify + webhook endpoint 구현, idempotency, 환불/취소 분기 | `spec-NN-revenuecat-integration`, `spec-NN-receipt-verification`, `adr-NN-receipt-verify-dual-path`, `adr-NN-webhook-auth-bearer`, `adr-NN-status-source-cache-with-sync`, `adr-NN-grace-period-pro-keep`, `adr-NN-cancel-vs-refund-transition` | backend/api | P2.1 완료 (약관·TBD 확정 후 코드 task 발행). P2.3 와 병렬 가능 |
| **P2.3 — mobile RevenueCat SDK 통합** | `react-native-purchases` 추가, paywall 구매 trigger 교체, logIn 연동 | `spec-NN-mobile-revenuecat-integration`, `adr-NN-app-user-id-mapping` | frontend/mobile-fe | P2.2 와 병렬 가능 (D-PLAN-PLAN-2-1 결정). P2.0 API key 필요 |
| **P2.4 — 통합 검증** | TestFlight / Play Internal sandbox 시나리오 5개 통과 | `runbook-NN-store-sandbox-testing`, `test-NN-revenuecat-integration` | (검증용) | P2.0 완료 필수 (sandbox 실 검증 차단). P2.2 + P2.3 완료 |
| **P2.5 — deprecated 정리** (선택) | `User.is_pro` deprecated 표시, mock-purchase prod ENV 가드 강화 | tech-debt entry | backend/api, mobile-fe | P2.4 완료 후 (production 출시 후 진행 가능) |

### Sub-phase 조정 사유

- **P2.0 + P2.1 동시 시작**: P2.0 은 사용자 영역(스토어 계정), P2.1 은 product-planner 영역(문서) — 상호 의존 없음.
- **P2.2 ↔ P2.3 병렬**: Phase 1(1a/1b) 패턴 답습. RevenueCat API 계약(spec-NN-revenuecat-integration) 확정 직후 동시 진행. Integration test 는 P2.0 키 확보 후.
- **P2.5 선택**: production 출시와 독립. DoD 에 포함 여부는 D-PLAN-PLAN-2-2 결정.

---

## 2. 의존성 그래프

```
P2.0 — 사전 준비 (사용자 영역)          P2.1 — 약관·TBD 정리 (product-planner)
  [Apple/Google 상품 등록·심사]            [TBD 5개 확정]
  [RevenueCat 계정·offerings 설정]        [policy-03/04/05 자동갱신 고지 보강]
  [REVENUECAT_API_KEY 발급]              [adr-NN-trial-policy / adr-NN-refund-policy]
       │                                         │
       │  (API key 발급 완료)                    │  (TBD 확정 + 약관 완료)
       │                                         │
       └──────────── P2.1 완료 → 코드 task 발행 ──┘
                              │
           ┌──────────────────┼──────────────────┐
           │                                     │
           ▼                                     ▼
  P2.2 — backend 결제 인프라            P2.3 — mobile RevenueCat SDK 통합
    [POST /api/subscription/verify]       [react-native-purchases 추가]
    [POST /api/subscription/webhook]      [Purchases.configure() + logIn()]
    [Authorization Bearer 검증]          [Purchases.purchasePackage()]
    [idempotency (transaction_id)]        [paywall 구매 trigger 교체]
    [환불=즉시 / 취소=만료까지 분기]      [Free 한도 catch → SDK flow]
           │                                     │
           └──────────── P2.2 + P2.3 완료 ────────┘
                              │
                 [차단: P2.0 완료 (sandbox 실 검증)]
                              │
                              ▼
                  P2.4 — 통합 검증
                    [TestFlight / Play Internal 빌드]
                    [sandbox 시나리오 S1~S5]
                    [webhook 도달 + idempotency 검증]
                    [grace period + introductory offer 자동 갱신 검증]
                              │
                              ▼
                  P2.5 — deprecated 정리 (선택)
                    [User.is_pro deprecated 표시]
                    [mock-purchase prod ENV 가드 강화]
```

### 병렬 가능 영역 정리

| 구간 | 병렬 여부 | 조건 |
|------|---------|------|
| P2.0 ↔ P2.1 | **병렬 가능** | 완전 독립 |
| P2.2 ↔ P2.3 | **병렬 가능** | spec-NN-revenuecat-integration(RevenueCat API 계약) 확정 후 동시 시작 |
| P2.4 | **P2.0 완료 필수** | sandbox 키 없이는 실 검증 불가. P2.2/P2.3 mock 단위테스트는 P2.0 전 진행 가능 |

### 핵심 의존 주의사항

- **introductory offer (D-2-2 B)**: backend `trial_start_date` 컬럼은 Phase 1 이력 기록용으로 유지. RevenueCat 이 introductory offer eligibility source of truth. Phase 1 trial 이력 있는 사용자는 RevenueCat 이 자동으로 introductory offer 제외.
- **in_grace_period (D-2-8 A)**: `subscription_events` 테이블 스키마 변경 없이 `source='revenuecat'` 이벤트 타입으로 처리. 6번째 ENUM state 추가 여부는 P2.2 spec 단계에서 결정 — backend 스키마 변경 가능성 있음.
- **P2.0 차단 범위**: backend 코드(P2.2) 는 mock RevenueCat 응답으로 단위테스트 가능. 단, sandbox 통합 검증(P2.4) 은 P2.0 완료 필수.

---

## 3. Sub-phase 별 후속 산출물 매핑

| Sub-phase | 후속 문서 후보 | 설명 |
|---|---|---|
| P2.1 | `adr-NN-trial-policy-introductory-offer` | D-2-2 B + D-2-3 A: introductory offer 7일 자동 결제 선택 사유 |
| P2.1 | `adr-NN-refund-policy-store-delegation` | D-2-4 A: Apple/Google 환불 위임 선택 사유 |
| P2.1 | `policy-03-terms-of-service` 갱신 | 자동갱신 사전 고지 문구 추가. 관할 법원(TBD-1) 확정 후 반영 |
| P2.1 | `policy-04-privacy-policy` 갱신 | 클라우드 호스팅사(TBD-2) 확정 후 반영. 분석 SDK(TBD-4) 포함 여부 결정 후 |
| P2.1 | `policy-05-subscription-refund` 갱신 | D-2-4 A 채택에 따라 일할 환불 조항 → 스토어 위임 문구로 교체 |
| P2.2 | `spec-NN-revenuecat-integration` | verify + webhook endpoint 계약. RevenueCat customer info schema. idempotency 규칙 |
| P2.2 | `spec-NN-receipt-verification` | 영수증 검증 흐름 (client→verify→RevenueCat API 재확인). D-2-1 C 이중 경로 명세 |
| P2.2 | `adr-NN-receipt-verify-dual-path` | D-2-1 C: client + webhook 이중 경로 선택 사유 |
| P2.2 | `adr-NN-webhook-auth-bearer` | D-2-9 A: Authorization Bearer 선택 사유. `REVENUECAT_WEBHOOK_SECRET` 저장 규칙 |
| P2.2 | `adr-NN-status-source-cache-with-sync` | D-2-11 B: backend 캐시 + webhook sync 선택 사유 |
| P2.2 | `adr-NN-grace-period-pro-keep` | D-2-8 A: grace period Pro 유지 선택 사유. 6번째 ENUM 추가 여부 결정 포함 |
| P2.2 | `adr-NN-cancel-vs-refund-transition` | D-2-10 B: 환불=즉시 cancelled / 취소=만료까지 Pro 유지 선택 사유 |
| P2.3 | `spec-NN-mobile-revenuecat-integration` | `react-native-purchases` SDK 통합 흐름. Purchases.configure/logIn/purchasePackage 계약 |
| P2.3 | `adr-NN-app-user-id-mapping` | D-2-7 A: 가입 즉시 logIn(user_id) 선택 사유 |
| P2.4 | `runbook-NN-store-sandbox-testing` | sandbox 결제 시나리오 5개(S1~S5) 실행 절차. TestFlight / Play Internal 빌드 방법 |
| P2.4 | `test-NN-revenuecat-integration` | 통합 테스트 매트릭스 (S1~S5, E1~E10 엣지). webhook idempotency, grace period |
| P2.5 | (선택) tech-debt entry | `User.is_pro` deprecated 표시. mock-purchase prod ENV 가드 강화 |

> **ADR 우선순위 (후속 T-003 발행용)**: 필수 — D-2-1 / D-2-2,2-3 / D-2-4 / D-2-7 / D-2-8 / D-2-9 / D-2-10 / D-2-11. 신규 ADR 불필요 — D-2-5(adr-11 유지) / D-2-6(plan-04 마일스톤에 반영).

> **NN 번호**: 기존 adr-14, spec-05, policy-05 이후 번호 충돌 피해 부여. 워커가 sub-phase 조정 시 이 매핑도 같이 갱신.

---

## 4. 마일스톤 / 우선순위

| Sub-phase | 노력 규모 | 차단 위험 | 완료 정의 (DoD) |
|---|---|---|---|
| **P2.0** | M (스토어 심사 시간 의존) | **전 sub-phase 실 검증 차단** | Apple/Google in-app 상품 등록 + introductory offer 설정 완료. RevenueCat project + offerings/entitlements 설정 완료. API key (public + webhook secret) 발급 완료 |
| **P2.1** | S | TBD 5개 미확정 시 코드 task 발행 차단 (D-2-6 A) | TBD 5개 확정. policy-03/04/05 자동갱신 고지 문구 갱신. adr-NN-trial-policy / adr-NN-refund-policy 작성 완료 |
| **P2.2** | M | P2.1 완료 선행. P2.0 API key 필요 (단위테스트는 mock 가능) | `POST /api/subscription/verify` + `POST /api/subscription/webhook` 구현. Authorization Bearer 검증. transaction_id idempotency. 환불/취소 분기 로직. 단위테스트 통과 |
| **P2.3** | M | P2.0 API key 필요 (mock SDK 단위테스트는 가능). P2.2 와 병렬 | `react-native-purchases` 설치 완료. `Purchases.configure()` + `Purchases.logIn(user_id)` 연동. `Purchases.purchasePackage()` paywall 연결. iOS + Android 빌드 성공 |
| **P2.4** | L (sandbox 검증은 시간 의존) | **P2.0 완료 필수**. P2.2 + P2.3 완료 | sandbox 시나리오 S1~S5 전체 통과. webhook 도달 확인. idempotency 중복 이벤트 방어 확인. grace period Pro 유지 확인. introductory offer 자동 갱신 검증 (단축 모드 확보 시) |
| **P2.5** | S (선택) | P2.4 완료 후 진행 가능 | `User.is_pro` deprecated 표시. mock-purchase `ENABLE_MOCK_PURCHASE=false` prod guard |

### 차단 위험 상세

| 차단 요소 | 영향 범위 | 대응 |
|----------|---------|------|
| **P2.0 사전 준비 미완료** (Apple/Google 심사 + RevenueCat 설정) | P2.4 sandbox 실 검증 전체 차단. P2.3 실 SDK 테스트 차단 | 코드(P2.2/P2.3) 는 mock 으로 먼저 진행. P2.0 완료 즉시 P2.4 투입 |
| **TBD-5개 미확정** (D-2-6 A: 코드 task 발행 전 확정) | P2.2/P2.3 코드 task 발행 차단 | P2.0 과 P2.1 병행. P2.1 완료 즉시 코드 task 발행 |
| **introductory offer 7일 검증 단축 모드 미확보** | P2.4 trial 자동 갱신 검증 7일 대기 필요 | P2.0 단계에서 RevenueCat / Apple Sandbox 단축 모드 가능 여부 확인 (D-PLAN-PLAN-2-4) |
| **약관 자동갱신 사전 고지 미준수** | 한국법 위반 위험 (전자상거래법). P2.4 실 결제 검증 진행 불가 | P2.1 완료 후 P2.4 진입 |

### TBD 5개 (D-2-6 A — P2.1 에서 확정)

| # | 항목 | 현황 |
|---|------|------|
| TBD-1 | 관할 법원 | 미확정 (한국 법원 가정). 약관 본문 명시 필수 |
| TBD-2 | 클라우드 호스팅사 명시 | 미확정. 개인정보처리방침 명시 필수 |
| TBD-3 | Phase 2 출시 목표일 | 미확정. 자동 갱신 사전 고지 일정 산정 기준 |
| TBD-4 | 분석 SDK (Mixpanel 등) 도입 여부 | 미확정. privacy policy 데이터 수집 항목에 영향 |
| TBD-5 | 일할 환불 | D-2-4 A 채택으로 회사 처리 X. policy-05 문구만 정리 |

---

## 5. 코드 영역별 영향 요약

| Sub-phase | backend/api | frontend/mobile-fe | frontend/shared-fe | frontend/web-fe |
|---|---|---|---|---|
| P2.0 | × (외부 설정) | × | × | × |
| P2.1 | × (문서만) | × | × | × |
| P2.2 | ○ `POST /api/subscription/verify` 신규 (RevenueCat customer info 수신 + backend sync). `POST /api/subscription/webhook` 신규 (Authorization Bearer 검증, idempotency). `subscription_events` `source='revenuecat'` 신규 행 추가. 테이블 스키마 변경 없음 (마이그 0). 환불=즉시 cancelled / 취소=만료까지 분기 로직 | × | × | × |
| P2.3 | × | ○ `react-native-purchases` 의존성 추가. `Purchases.configure()` 앱 초기화. `Purchases.logIn(user_id)` 가입 시점 연동. `paywall.tsx` 구매 trigger `POST /api/subscription/mock-purchase` → `Purchases.purchasePackage()` 교체. 구매 후 `POST /api/subscription/verify` 호출 (D-2-1 C client 경로). iOS + Android 양쪽 | × | × |
| P2.4 | × (검증만) | × (빌드만) | × | × |
| P2.5 | ○ `User.is_pro` deprecated 표시. `mock-purchase` `ENABLE_MOCK_PURCHASE` prod ENV guard 강화 | ○ mock-purchase 호출부 prod guard 확인 | × | × |

> **shared-fe**: RevenueCat 관련 type 추가 검토 결과 — mobile-fe 는 자체 `src/types/` 보유하며 Phase 2 에서도 직접 정의. shared-fe 수정 불필요.
> **web-fe**: Phase 2 범위 외. 결제 UI 미대상.

---

## 6. 결정이 필요한 항목

### D-PLAN-PLAN-2-1: P2.2 (backend) ↔ P2.3 (mobile) 병렬 진행 여부

| 안 | 진행 방식 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **병렬** — spec-NN-revenuecat-integration 계약 확정 즉시 P2.2/P2.3 동시 시작 | Phase 1(1a/1b) 패턴 답습. 전체 Phase 2 기간 단축 | API 계약 변경 시 mobile 재작업 일부 발생 |
| B | **직렬** — P2.2 backend 닫고 P2.3 mobile 시작 | 재작업 0 | Phase 2 기간 = P2.2 + P2.3 직렬 합산. 납기 지연 |

**권장: A** — Phase 1 의 backend/mobile 병렬 패턴이 성공적으로 작동했음. RevenueCat API 계약(spec-NN-revenuecat-integration) 확정 시점을 병렬 시작 기준으로 삼으면 재작업 위험 최소화. P2.2 webhook 구조와 P2.3 SDK purchasePackage 는 독립적으로 개발 가능.

---

### D-PLAN-PLAN-2-2: Phase 2 DoD (완료 정의)

| 안 | 완료 기준 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **P2.4 sandbox 5/5 ✅ + TestFlight/Play Internal 빌드 성공** = done (P2.5 deprecated 정리는 후속 별도 task) | 명확. 배포 가능 상태까지만 = Phase 2. P2.5 는 production 출시 후 진행 가능 | `User.is_pro` deprecated 표시가 Phase 2 내에 미포함 |
| B | **P2.5 deprecated 정리까지** = done | 기술 부채 즉시 청산 | P2.4 검증 완료 후 P2.5 추가 작업 필요. 납기 지연 |
| C | **production 출시** (App Store / Play Store 심사 통과 + 첫 실결제) = done | 비즈니스 기준 최명확 | 스토어 심사 기간(1~3일) 불확실. 개발 done 과 혼재 |

**권장: A** — P2.4 sandbox 검증 완료 = 개발 done. production 출시(스토어 심사)는 별도 운영 이벤트로 분리. P2.5 deprecated 정리는 출시 후 tech-debt task 로 발행.

---

### D-PLAN-PLAN-2-3: 약관 자동갱신 사전 고지 문구 작성 책임

| 안 | 담당 | 장점 | 단점 |
|---|------|------|------|
| **A** | **product-planner 한국어 초안** (Phase 1 policy-03/04/05 패턴 답습) | 즉시 진행 가능. Phase 1 문서 구조 재활용 | 법무 검토 없이 작성 → P2.4 진입 전 검토 필요 |
| B | **외부 법무 의뢰** | 법적 안전성 최대 | 비용 + 일정 의존. P2.1 차단 위험 |
| C | **A 초안 + B 검토** (P2.4 진입 전 병행) | 초안 즉시 시작 + 법무 검토로 보완 | B 검토 완료 전 P2.4 진입 불가 |

**권장: A** — Phase 1 에서 product-planner 초안이 policy-03/04/05 로 작성된 패턴 그대로. 자동 갱신 고지 문구는 Apple/Google 스토어 가이드라인에 표준 문구가 명시되어 있어 법무 의뢰 없이 초안 가능. 실제 결제가 발생하는 P2.4(sandbox) 및 production 출시 전까지 사용자/법무 검토 완료 권장.

---

### D-PLAN-PLAN-2-4: introductory offer 7일 검증 단축 모드

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| A | **RevenueCat / Apple Sandbox 단축 모드** 사용 (예: 5분 = 1주) | P2.4 trial 자동 갱신 검증을 당일 완료 가능 | Apple Sandbox 단축 비율이 Apple 정책으로 결정됨 (변경 불가) |
| B | **실시간 7일 대기** | 추가 설정 없음 | P2.4 납기 최소 7일 이상 지연 |
| **C** | **P2.0 에서 가능 여부 확인 후 결정** | 사실 확인 후 결정으로 리스크 0 | 결정 지연 (P2.0 완료까지) |

**권장: C** — Apple Sandbox 는 구독 기간을 자동 단축(1주 → 3분, 1달 → 5분)하며 RevenueCat 도 sandbox 환경 지원. 단, 정확한 단축 비율과 introductory offer 시뮬레이션 방법은 P2.0 에서 RevenueCat 대시보드·문서 확인 후 확정. 이미 단축 모드가 지원된다면 A 자동 채택.

---

## 후속 태스크 제안 (admin 검토용)

| 태스크 후보 | 담당 에이전트 | 내용 |
|-----------|------------|------|
| `tasks/planning/PLAN-004-T-003-phase2-adrs.md` | `@product-planner` | P2.2 + P2.1 에 매핑된 ADR 8건 작성 (D-2-1 / D-2-2,2-3 / D-2-4 / D-2-7 / D-2-8 / D-2-9 / D-2-10 / D-2-11) |
| `tasks/planning/PLAN-004-T-004-phase2-specs.md` | `@product-planner` | spec-NN-revenuecat-integration + spec-NN-receipt-verification + spec-NN-mobile-revenuecat-integration |
| `tasks/api/PLAN-004-T-005-backend-verify-webhook.md` | `@api` | `POST /api/subscription/verify` + `POST /api/subscription/webhook` 구현 (P2.2). spec 완료 후 발행 |
| `tasks/mobile/PLAN-004-T-006-mobile-revenuecat-sdk.md` | `@mobile-fe` | `react-native-purchases` 통합 + paywall 교체 (P2.3). spec 완료 후 발행 |
| `tasks/planning/PLAN-004-T-007-policy-update-phase2.md` | `@product-planner` | policy-03/04/05 자동갱신 고지 + TBD 5개 반영 갱신 (P2.1) |
