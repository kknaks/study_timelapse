---
id: adr-16
type: adr
title: 트라이얼 — RevenueCat introductory offer 7일 + 자동 갱신
status: accepted
created: 2026-05-09
updated: 2026-05-09
note: "2026-05-09 T-008 patch — Decision 구체화 (backend trial 자동 시작 제거 + Phase 1 자연 종료). 결정 자체는 변경 없음, B+A 의 구현 함의 명확화."
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-11-monthly-only-no-yearly]]"
  - "[[adr-14-phase1-execution-strategy]]"
  - "[[adr-18-app-user-id-mapping]]"
tags: [adr, payment, subscription, revenuecat, trial, introductory-offer, auto-renewal, phase2]
---

# 트라이얼 — RevenueCat introductory offer 7일 + 자동 갱신

## Summary

Phase 2 에서 트라이얼 = RevenueCat introductory offer 7일 무료 → 자동 결제 전환(D-PLAN-2-2 B + D-PLAN-2-3 A). 한국 전자상거래법상 자동 갱신 사전 고지 14일 필수. Phase 1 backend `trial_start_date` 컬럼 역할 재정의 포함.

---

## Context

- Phase 1: 가입 즉시 backend 에서 7일 trial 자동 시작 (`subscription_status='trial'`, `trial_start_date`)
- Phase 2: 실제 스토어 결제 도입 → 스토어 표준 introductory offer 로 전환 고려
- 트라이얼 재사용 방지(동일 사용자 재가입 시), 자동 결제 전환 법적 고지 의무 처리 필요
- planning-03 D-PLAN-2-2 / D-PLAN-2-3 결정 (plan-04 §사용자 합의 사항)

---

## Options

### D-PLAN-2-2: 트라이얼 정책

| 안 | 정책 | 장점 | 단점 |
|---|------|------|------|
| A | Phase 1 그대로 유지 — backend trial 7일, RevenueCat introductory offer 미사용 | Phase 2 trial 로직 변경 없음 | 스토어 표준 introductory offer 미활용. Apple/Google 노출 혜택 없음 |
| **B** | **RevenueCat introductory offer** — Phase 2 부터 스토어 표준 7일 무료 → 자동 결제 전환 | Apple/Google "7일 무료 체험" 배지. eligibility 관리 자동 | Phase 1 backend trial 이력 사용자 eligibility 처리 필요 |
| C | 하이브리드 — 가입 시 backend trial + Phase 2 introductory offer 비노출 | Phase 1 연속성 유지 | 복잡도 최대 |
| ~~D~~ | ~~가입 즉시 backend trial 유지 + introductory offer 미사용~~ | — | **폐기**: "가입 시 7일 무료 받았는데 결제할 땐 무료 X" 사용자 혼란. 결제 정보 등록 시점이 trial 만료 *후* → Apple/Google 표준(가입 직후 결제 정보 + 무료 체험)과 어긋남. 한국법 자동 갱신 고지 시점도 불명확. |

### D-PLAN-2-3: trial 만료 시 자동 결제 여부

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | Apple/Google introductory offer 표준 — 자동 결제 전환 | 스토어 표준, 전환율 높음 | 한국법 자동 갱신 고지 의무 이행 필요 |
| B | 명시 동의 — trial 만료 시 paywall 재노출 | 사용자 능동 동의 | 전환율 낮음. D-2-2 B 와 상충 |

---

## Decision

**D-PLAN-2-2 B + D-PLAN-2-3 A 채택 — RevenueCat introductory offer 7일 무료 → 자동 결제.**

### B 채택의 구체적 구현 함의 (T-008 명확화)

**B 채택 = 가입 시 backend trial 자동 시작 제거.**

| 항목 | 변경 전 (Phase 1) | 변경 후 (Phase 2) |
|------|-----------------|-----------------|
| 가입 시 `subscription_status` | `'trial'` (자동 시작) | `'free'` |
| 가입 시 `trial_start_date` | `today_utc` (자동 설정) | `NULL` |
| 가입 시 `subscription_events` | `trial_started` INSERT | **없음** |
| trial 진입 시점 | 가입 즉시 | paywall `purchasePackage()` 성공 → introductory offer 적용 |
| trial source of truth | backend `trial_start_date` | RevenueCat introductory offer (Apple/Google 계정 기준) |

**코드 변경 대상** (구현 = 후속 T-009):
- `backend/app/services/auth_service.py:148-165` — 가입 시 `subscription_status='trial'`, `trial_start_date=today_utc`, `is_pro=True` 설정 및 `trial_started` event INSERT 제거. `subscription_status='free'`, `trial_start_date=None`, `is_pro=False` 로 교체.

### Phase 1 trial → Phase 2 introductory offer 전환 규칙

| 사용자 상태 | Phase 2 동작 |
|------------|------------|
| Phase 2 신규 가입 (trial 이력 없음) | RevenueCat introductory offer 대상. paywall 진입 시 7일 무료 시작 가능 |
| Phase 1 trial 이력 있음 (`trial_start_date` 존재) | RevenueCat 이 Apple/Google 계정 기준 introductory offer eligibility 자체 판단. backend 개입 없음. |
| Phase 1 mock trial 이력만 있음 (`source='mock'`) | RevenueCat 이 eligibility source of truth. Phase 1 이력은 감사 기록으로만 보존. |

**Phase 1 기존 사용자 자연 종료 (A1)**: 진행 중 backend trial(`subscription_status='trial'`) 그대로 유지 → 만료 후 `expired`/`free` 전환 → paywall 도달 시 RevenueCat 이 eligibility 판단. **데이터 마이그레이션 없음.**

### backend trial_start_date 컬럼 역할 재정의

- Phase 2 이후: `trial_start_date` = Phase 1 감사 이력 보존 용도만. 신규 가입자 = `NULL`.
- RevenueCat introductory offer eligibility 는 RevenueCat (Apple/Google 계정 기준) 이 관리. backend 가 eligibility 판단 참여하지 않음.
- `subscription_status='trial'` = Phase 2 에서도 introductory offer 기간에 유지. Phase 1 5-state ENUM 변경 없음.
- `subscription_events` 의 `trial_started` event_type: Phase 2 신규 가입자 가입 시점 INSERT 제거. RevenueCat `INITIAL_PURCHASE` 이벤트 수신 시 trial 진입으로 기록 (source='revenuecat').

### 온보딩 흐름 변경 (T-010 구현 대상)

```
가입 → subscription_status='free'
  ↓
약관 동의 (onboarding/legal — 기존)
  ↓
[신규] Trial 안내 페이지 (onboarding/trial-intro.tsx)
  - "7일 무료로 모든 기능 체험"
  - "체험 시작 시 결제 정보 등록 (Apple/Google 계정)"
  - "체험 후 $1.99/월 자동 결제 (언제든 취소 가능)"
  - 한국법 자동 갱신 14일 사전 고지 문구 (policy-03 표준 인용)
  ↓
[7일 무료 체험 시작] CTA → paywall → purchasePackage() → trial
[나중에] CTA → index.tsx (Free 사용자, 1회/일 한도)
```

### 한국법 자동 갱신 사전 고지

- 전자상거래법: 자동 갱신 결제 **14일 전** 이메일 또는 앱 내 알림 필수
- `policy-03-terms-of-service` 에 자동 갱신 고지 문구 박힘 (T-007 완료)
- 고지 기준: **trial 시작 시점** (= paywall 결제 직후) 기준 14일 전 알림. Phase 1 backend trial 만료 알림과 다른 별개 흐름.
- 앱 내 배너 (Phase 1 `TrialExpiringBanner` 답습): D-7 이내 고지
- 푸시 알림: Phase 3 (APNs/FCM) — Phase 2 미포함

**Why**: B = Apple/Google "7일 무료 체험" 배지 획득, eligibility 중복 관리 0 (RevenueCat 자동), 전환율 최대화. D 폐기 이유: 가입 시 결제 정보 없이 7일 주는 방식은 결제 정보 등록 = 만료 후라 Apple/Google 표준과 어긋나며 사용자 혼란(무료 받고 나서 결제 유도)이 발생함.

---

## Consequences

### backend/api (○)
- **`auth_service.py` patch 필요 (T-009)**: 가입 시 `subscription_status='trial'`/`trial_start_date`/`is_pro=True` + `trial_started` INSERT 제거 → `subscription_status='free'`, `trial_start_date=None`, `is_pro=False` 로 교체.
- `subscription_events` Phase 2 trial 이벤트: RevenueCat `INITIAL_PURCHASE` 수신 시 `source='revenuecat'` 로 기록
- Phase 1 `source='mock'`/`source='system'` trial 이력: 변경 없이 보존
- `backend/app/services/subscription.py` 의 `debug API` trial 진입 로직: Phase 2 에서도 staging 디버그용 유지 가능 (정상 가입 흐름과 무관)

### frontend/mobile-fe (○)
- **온보딩 신규 페이지 (T-010)**: `onboarding/trial-intro.tsx` 추가 (Trial 안내 + [7일 무료 체험 시작] / [나중에] CTA)
- paywall.tsx 에서 `source=onboarding` query param 수신 시 UI 텍스트 변경 ("환영 7일 무료 체험" 등)
- RevenueCat introductory offer package 로 paywall CTA 연결 (spec-08 §5 이미 명세됨)
- `TrialExpiringBanner`: Phase 1 그대로 활용 (만료일 D-7 이내 표시). 단, trial 시작 시점이 paywall 결제 시점이므로 backend `trial_start_date` 대신 RevenueCat `pro_until` 기준으로 D-7 계산 필요 (spec 단계 확정).
- Phase 2 신규 가입자의 `useSubscription` hook: `subscription_status='free'` 기본. `trialDaysRemaining = 0` (trial 안 박힘).

### frontend/web-fe (×)
### frontend/shared-fe (×)

### 후속 필요
- T-009: backend `auth_service.py` patch (신규 가입자 free 기동)
- T-010: mobile 온보딩 trial 안내 페이지 + paywall 온보딩 진입 분기
