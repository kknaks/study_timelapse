---
id: adr-13
type: adr
title: Anonymous paywall 로그인 유도 + 약관 가입·결제 양쪽 노출
status: accepted
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[planning-02-payment]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-14-phase1-execution-strategy]]"
tags: [adr, payment, paywall, anonymous, terms, privacy, legal]
---

# Anonymous paywall 로그인 유도 + 약관 가입·결제 양쪽 노출

## Summary

Anonymous 사용자가 paywall 도달 시 로그인 화면으로 redirect. 약관·개인정보처리방침은 가입 화면 + paywall 양쪽에 노출. 약관 초안은 planner 작성 → 사용자 검토 → Phase 2 진입 전 법무 완료.

---

## Context

- Phase 1 결제는 인증된 사용자만 (sessions API 등 인증 필수 구조)
- Anonymous 사용자의 paywall 도달 경로: Free 한도 초과 시 (이론상 가능)
- 한국 전자상거래법 — 결제 전 약관 동의·개인정보처리방침 표시 필수
- planning-02 D-PLAN-9 (로그인 유도) + D-PLAN-10 (약관 양쪽) + plan-03 P-PLAN-3 (planner 초안) 통합

---

## Options

### Anonymous paywall 동작 (D-PLAN-9)

| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| **A** | **로그인 유도 → 로그인 후 paywall** | 인증 필수 구조상 자연스러움, 구매 의도 보존 | 로그인 필수 = 진입 장벽 |
| B | 로그인 없이 paywall 먼저 (구매 시 로그인 요구) | 구매 의향 확인 먼저 | paywall UI 노출 비용, 인증 플로우 분산 |
| C | paywall 접근 자체 차단 | 단순 | 구매 의향 사용자 이탈 |

### 약관 표시 위치 (D-PLAN-10)

| 안 | 위치 | 법적 커버리지 | 복잡도 |
|---|------|------------|-------|
| **A** | **가입 화면 + paywall 화면 (결제 전 동의)** | 한국 전자상거래법 최소 준수 | 중간 |
| B | 가입 화면만 (일괄 동의) | 결제 시점 동의 명시 부재 → 법적 리스크 | 낮음 |
| C | Phase 2 연동 시점까지 보류 | Phase 1 법적 미비 | 낮음 (short-term) |

### 약관 작성 책임 (P-PLAN-3)

| 안 | 담당 | 진행 속도 | 리스크 |
|---|------|---------|-------|
| **A** | **planner 초안 → 사용자 검토 → Phase 2 진입 전 법무 완료** | 즉시 진행 | Phase 1 mock 결제는 초안 사용 |
| B | 외부 법무 의뢰 후 Phase 1c 진입 | 지연 위험 | 법적 안전 |
| C | Phase 2 실제 결제 전에만 확정 | Phase 1 속도 | Phase 1 mock 결제에 약관 없음 |

---

## Decision

**세 결정 모두 A 채택.**

### Anonymous paywall 처리

- Anonymous 사용자가 paywall 도달 시 → 로그인 화면으로 redirect
- 구매 의도 보존: 로그인 완료 후 paywall 화면으로 복귀
- paywall 화면 진입 가드: `useAuth` 훅 또는 navigation guard 에서 처리

### 약관 노출 시점

1. **가입 화면**: "이용약관 및 개인정보처리방침에 동의합니다" 체크박스 (필수 동의)
2. **paywall 화면**: mock-purchase 버튼 클릭 직전 "구독 시 이용약관 및 개인정보처리방침에 동의합니다" 문구 노출

### 동의 이력 저장

- `User.terms_agreed_at` TIMESTAMPTZ (가입 시 동의 시각)
- `User.privacy_agreed_at` TIMESTAMPTZ (가입 시 동의 시각)
- Phase 1 scope 포함 (Alembic)

### 약관 텍스트 작성

- planner 초안: 이용약관 + 개인정보처리방침 + 구독 환불 정책
- 사용자 검토 후 확정 → 별도 task 로 분리
- **Phase 2 (실제 결제) 진입 전 법무 검토 완료** 필수

**Why**:
- 로그인 유도: 인증 필수 구조상 자연스러움. Anonymous paywall 경로 자체를 navigation guard 로 차단
- 양쪽 노출: 한국 전자상거래법 최소 준수, 결제 시점 동의 명확
- planner 초안: 즉시 진행 가능, 법무는 Phase 2 진입 전 완료 (실제 결제 전 안전)

---

## Consequences

### backend/api (○ 영향)
- `User.terms_agreed_at`, `User.privacy_agreed_at` 컬럼 신규 (Alembic)
- 가입 API에 동의 시각 기록 로직 추가

### frontend/mobile-fe (○ 영향)
- paywall.tsx 진입 가드: Anonymous 사용자 → 로그인 화면 redirect
- 가입 화면: 약관 동의 체크박스 컴포넌트 추가
- paywall 화면: 구매 버튼 직전 약관 문구 노출

### frontend/web-fe (× 없음)
### frontend/shared-fe (× 없음)

### 후속 산출물
- 별도 task: 약관/개인정보처리방침/환불정책 planner 초안 작성
- Phase 2 진입 전 법무 검토 완료 체크포인트 추가
