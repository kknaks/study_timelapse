---
id: planning-02
type: planning
title: 결제(구독) 도메인 요구·시나리오·제약
status: draft
created: 2026-05-06
updated: 2026-05-06
sources: []
related_to:
  - "[[adr-11-monthly-only-no-yearly]]"
tags: [planning, payment, subscription, trial, paywall, monetization]
---

# 결제(구독) 도메인 요구·시나리오·제약

## Summary

study_timelapse 의 결제/구독 도메인 SSOT. 신규 가입~트라이얼~Free/Pro 전환~만료까지의 전 생애주기 시나리오와 입출력 요구·비기능 요구·제약을 정리한다. Phase 1 (내부 결제 로직, 스토어 SDK 없음) / Phase 2 (RevenueCat 스토어 연동) 경계를 명확히 구분하며, 이 문서가 결제 domain의 spec/adr/policy/plan 작성의 최상위 근거가 된다.

---

## 1. 사용자 시나리오

### 핵심 시나리오

| # | 시나리오 | 사용자 기대 |
|---|---------|------------|
| S1 | 신규 가입 → 7일 트라이얼 자동 시작 → 트라이얼 기간 Pro 무제한 사용 → 트라이얼 종료 → free 전환 | 트라이얼 시작/종료 시점을 앱 내 배너/알림으로 인지. 트라이얼 만료 후 자동으로 Free 한도 적용 |
| S2 | Free 사용자 일일 1회 녹화 → 당일 한도 초과 시 paywall 노출 → 구독 구매 → Pro 전환 | paywall 화면에서 플랜 비교 후 1탭 구매. 구매 즉시 Pro 기능 unlock |
| S3 | Pro 사용자 무제한 사용 → 구독 만료 → Free 전환 | 만료 전 사전 알림 (D-PLAN-3). 만료 직후 워터마크 복귀 + 일일 1회 한도 적용 |
| S4 | 트라이얼 사용자 Pro 기능(워터마크 제거, Progress bar) 자유 사용 | 트라이얼 배지/만료 일정 표시. 만료 후 동작 사전 안내 |
| S5 | Free 사용자 Progress bar 탭 | 🔒 자물쇠 표시 + paywall 이동 안내 (planning-01 S5 일치) |
| S6 | 사용자 설정 화면에서 명시적 업그레이드 | 설정 → 구독 → paywall 진입. 구독 중이면 현재 플랜·갱신일 표시 |

### 엣지 시나리오

| # | 이벤트 | 사용자 기대 |
|---|--------|------------|
| E1 | 트라이얼 중간에 Pro 결제 | 잔여 트라이얼 기간은 소진되어 구독 시작일로 대체. 이중 과금 없음 (D-PLAN-1) |
| E2 | paywall 도달 후 결제 취소 또는 실패 | 결제 전 상태로 복귀. Free 한도 유지. "결제를 완료하려면 다시 시도하세요" 안내 |
| E3 | 같은 사용자가 여러 디바이스에서 동시 사용 | 구독 상태 SSOT는 서버. 모든 디바이스에 동일 상태 반영 |
| E4 | 디바이스 시계 변조로 일일 한도 우회 시도 | 서버 시계 기준으로 판단. 클라이언트 시간 신뢰 안 함 |
| E5 | 트라이얼 종료 후 다른 이메일로 재가입 — 트라이얼 재사용 시도 | 트라이얼 재사용 방지 정책 (D-PLAN-7) 적용. 방지 방법은 결정 항목 |
| E6 | Anonymous 사용자가 paywall 도달 | 로그인 유도 (D-PLAN-결정 항목 추가). 로그인 없이 구매 불가 |
| E7 | Phase 2: 결제 수단(카드) 만료 → 구독 갱신 실패 | 스토어 유예 기간(grace period) 적용. 유예 종료 시 Free 자동 전환 + 앱 내 알림 |
| E8 | Phase 2: 환불 요청 (App Store 경유) | 스토어 환불 후 RevenueCat webhook → 서버 subscription_status 즉시 free 전환 |
| E9 | 백엔드 다운 중 "구매 완료" 버튼 클릭 (Phase 1) | 오류 안내 ("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요"). 결제 이력 미기록 |
| E10 | 구독 만료 + 앱 오프라인 상태 | 마지막 캐시된 상태로 동작. 온라인 복귀 시 서버 재확인 → 필요 시 Free 전환 |

---

## 2. 입력·출력 요구

### 2-1. 구독 상태 모델

현재 백엔드 `User` 모델:
```
subscription_status: String  → "free" | "trial" | "pro"
trial_start_date: Date       → 트라이얼 시작일
is_pro: Boolean              → 현재 Pro 여부 (computed or cached)
pro_until: DateTime          → Pro 만료 시각 (구독 or 트라이얼)
```

| 상태 | 설명 | Pro 기능 | 일일 한도 |
|------|------|---------|---------|
| `free` | 기본 상태 | ✗ | 1회/일 |
| `trial` | 신규 7일 Pro 체험 | ✓ | 무제한 |
| `pro` | 유효 구독 | ✓ | 무제한 |

추가 sub-state 필요 여부 → **D-PLAN-결정 항목** (§5):
- `expired`: 구독 만료 직후 grace period 처리용 (Phase 2 필요)
- `cancelled`: 갱신 취소했으나 만료일 전 Pro 유지 (Phase 2 필요)
- Phase 1은 3종 (`free / trial / pro`) 으로 충분; Phase 2에서 확장 필요 가능성 고려해 스키마 호환 유지

### 2-2. 트라이얼 조건

| 항목 | 결정 필요 | 현황 / 선택지 |
|------|----------|-------------|
| 트라이얼 시작 시점 | **D-PLAN-2** | 가입 즉시 / 첫 paywall 도달 시 / 사용자 명시 액션 |
| 트라이얼 길이 | 7일 고정 (PRD 기준) | 7일 고정 유지 |
| 만료 기준 시각 | 결정 필요 | trial_start_date + 7일의 자정 UTC vs 시작 시각 기준 168h |
| 만료 후 동작 | **D-PLAN-3** | 자동 free 전환 / 자동 paywall / grace period |
| 재사용 방지 | **D-PLAN-7** | 디바이스/이메일/결제수단 기반 |

### 2-3. Free 일일 한도

| 항목 | 결정 필요 | 현황 / 선택지 |
|------|----------|-------------|
| 한도 기준 이벤트 | 결정 필요 | 녹화 시작 / 타임랩스 변환 완료 / 갤러리 저장 완료 |
| 리셋 시점 | **D-PLAN-4** | 자정 서버UTC / 자정 사용자 로컬 / 24h sliding window |
| carry-over | 미사용 일일 한도 다음날 이월 여부 | 이월 없음 (단순화) |
| 초과 시 동작 | paywall 노출 | 즉시 paywall 화면 이동 |
| SSOT | 서버 (`daily_focus` 테이블 session_count 활용 가능) | 클라이언트 우회 불가 |

### 2-4. 결제 이력 (Payment History)

Phase 1은 스토어 SDK 없이 백엔드가 직접 구독 상태를 관리. Phase 2는 RevenueCat 영수증 흘려넣기.

| 항목 | Phase 1 | Phase 2 |
|------|---------|---------|
| 기록 방식 | 백엔드 직접 DB Insert | RevenueCat webhook → 동일 테이블 |
| 기록 이벤트 | **D-PLAN-5** | 동일 |
| 스키마 호환 | Phase 2 마이그레이션 최소화 목표 | Phase 1 스키마에 `receipt_data` 컬럼 nullable 추가로 대비 |
| 보존 | 영구 (감사 추적) | 영구 |

### 2-5. Paywall 진입점

| 진입점 | Phase 1 | Phase 2 |
|--------|---------|---------|
| 일일 한도 초과 | ✓ | ✓ |
| Progress bar / Pro 기능 탭 | ✓ | ✓ |
| 트라이얼 만료 알림 | ✓ | ✓ |
| 설정 화면 업그레이드 버튼 | ✓ | ✓ |
| 트라이얼 만료 직전 프로모션 | 선택 | ✓ |

현재 `paywall.tsx`: 월 $2.99 / 연 $19.99 UI 하드코딩. Phase 1은 "구매 완료" 버튼 → 백엔드 mock-purchase API 호출로 Pro 전환.

---

## 3. 비기능 요구 (정성)

### 결제 정확성
- **이중 결제 절대 발생 안 함**: Phase 1 mock 버튼도 동일 사용자 동시 2회 클릭 = 1회로 처리 (서버 멱등성 보장)
- Phase 2 환불은 스토어 처리 완료 후 서버 상태 즉시 반영 (webhook 기준)
- Pro 전환 / 취소 / 만료 모든 이벤트의 서버-클라이언트 상태 일치 보장

### 신뢰성
- 결제 이력은 손실되지 않는다. 서버 다운 중 Phase 1 mock 결제 시도 → 실패 응답 반환 (이력 미기록). Phase 2는 RevenueCat 큐가 재시도.
- `subscription_status` + `pro_until` 의 SSOT는 서버. 클라이언트는 캐시만.
- 앱 재시작 / 재설치로 구독 상태 소실되지 않음 (서버 조회)

### 회계 추적성
- 모든 구독 상태 변화 (free→trial, trial→free, free→pro, pro→free 등) 는 감사 가능해야 한다 — 언제/왜(이벤트 종류)/어떤 값에서 어떤 값으로
- `changed_at`, `reason` (event_type), `before_status`, `after_status` 컬럼 필수

### 사용자 신뢰
- 결제 실패/환불 메시지: "Error" 단독 금지. 원인 + 다음 행동 제시
- Phase 2: 영수증 발급은 App Store 기본 처리. 앱 내 구독 이력 조회 화면 제공
- 트라이얼 잔여 일수 앱 내 항상 표시 (설정 화면 + 녹화 화면 배너)

### 개발자 경험 (Phase 1 한정)
- Debug 강제 전환 API (`POST /admin/debug/subscription`) 는 **스테이지 환경에서만 노출** — prod 환경변수 `ENABLE_DEBUG_SUBSCRIPTION=false` 시 404 반환
- 스테이지에서는 free/trial/pro 사이 자유 토글 가능
- prod 새줌 없음 (미들웨어 또는 환경변수 guard)

---

## 4. 제약 / 가정

| 항목 | Phase 1 제약 | Phase 2 제약 |
|------|------------|------------|
| 스토어 SDK | ❌ 없음 | RevenueCat SDK (`react-native-purchases`) |
| 영수증 검증 | ❌ 없음 (mock) | App Store / Play Store 영수증 RevenueCat 검증 |
| paywall "구매" 버튼 | 백엔드 mock-purchase API 호출 → 강제 Pro 전환 | RevenueCat `purchasePackage()` → 영수증 → 서버 검증 |
| 결제 이력 스키마 | mock 기록 (Phase 2 마이그레이션 최소화 설계) | RevenueCat 영수증 필드 추가 |
| iOS / Android | 플랫폼 무관 (백엔드 중심) | 양쪽 모두 (RevenueCat 통합) |
| 인증 | 결제는 인증된 사용자만 | 동일 |
| Anonymous 사용자 paywall | 로그인 유도 → 상세 결정 필요 | 동일 |
| 법적 (한국 결제법) | 약관·개인정보처리방침 위치 정의 필요 (D-PLAN-결정 항목) | 실제 결제 시 필수 |
| Phase 1 mock → Phase 2 마이그레이션 | mock 이력은 `D-PLAN-6` 결정 | RevenueCat 시작일 기준 이후만 실 영수증 |
| 구독 가격 | paywall.tsx 하드코딩 ($2.99/월, $19.99/연) — 비즈니스 확정 대기 | App Store Connect 상품 가격 |
| 결제 수단 | — | App Store / Google Play (국가별 통화 스토어 처리) |

---

## 5. 결정이 필요한 항목

### D-PLAN-1: Phase 1 결제 트리거 방식

paywall "구매 완료" 버튼이 어떤 백엔드 API를 호출해 Pro 전환할지.

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **전용 mock-purchase API** (`POST /api/subscription/mock-purchase`) | 명확한 의도 분리, prod에서 숨기기 쉬움 | 신규 API 1개 추가 |
| B | Debug 강제 전환 API 재사용 (`POST /admin/debug/subscription`) | 추가 개발 0 | debug용 API가 prod paywall flow에 혼입 — 의도 불명확 |
| C | 어드민 수동 전환 API 재사용 | 추가 개발 0 | 어드민 권한 필요, 사용자 self-serve 불가 |

**권장: A** — Phase 1의 mock-purchase는 Phase 2 `purchasePackage()` 와 동일 endpoint 계약(request/response)으로 설계해두면 Phase 2 전환 시 내부 구현만 교체.

---

### D-PLAN-2: 트라이얼 시작 시점

| 안 | 시작 시점 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **가입 즉시 자동 시작** | 구현 단순, 사용자 혼란 없음 | 앱 설치만 하고 안 쓰는 사용자에게도 7일 소진 |
| B | 첫 paywall 도달 시 시작 | 실사용 전에 트라이얼 소진 없음 | paywall 도달 전까지 trial 상태 아님 → 상태 모델 복잡 |
| C | 사용자가 "Pro 체험 시작" 명시 액션 | 사용자 의도 명확 | 추가 UI, 사용자 인지 부담 |

**권장: A** — 가입 즉시 자동 시작. PRD 기준과 일치. 구현 단순. Phase 1에서는 가입 시점 = `trial_start_date = today`, `subscription_status = "trial"` 자동 설정.

---

### D-PLAN-3: 트라이얼/구독 만료 후 동작

| 안 | 만료 후 동작 | 장점 | 단점 |
|---|------------|------|------|
| **A** | **즉시 자동 free 전환 (사용자 액션 없음)** | 예측 가능, 구현 단순 | 만료 직후 사용자 놀랄 수 있음 |
| B | 만료 후 N일 grace period 유지 | 사용자 친화적 | 구현 복잡, 추가 상태 필요 |
| C | 만료 + 자동 paywall 즉시 표시 | 전환 유도 강력 | 강요 느낌. UX 부정적 |

**권장: A + 사전 알림** — 만료 24h/1h 전 앱 내 배너·푸시 알림 (별도 notification spec 필요). 만료 시 즉시 free 전환. Phase 2 grace period는 RevenueCat 설정.

---

### D-PLAN-4: Free 일일 한도 리셋 시점

| 안 | 리셋 기준 | 장점 | 단점 |
|---|----------|------|------|
| A | 자정 UTC | 서버 단일 기준, 구현 단순 | 한국 사용자 KST 오전 9시 리셋 = 직관적이지 않음 |
| **B** | **자정 사용자 로컬 시간 (timezone)** | 사용자 직관과 일치 | timezone 정보 서버에 저장 필요, timezone 변경 우회 가능성 |
| C | 24h sliding window (마지막 녹화 기준 24h 후 해제) | 공정함 | 구현 복잡, 사용자 이해 어려움 |
| D | 자정 KST 고정 (한국 타겟) | 단순, 한국 사용자 최적 | 해외 확장 시 교체 필요 |

**권장: B** — 사용자 timezone 서버 저장 (가입 시 또는 첫 요청 시 감지). 서버 시계 기준으로 판단 (클라이언트 시계 무시). timezone 변경 우회는 서버에서 비정상 변경 감지 로직으로 방어 (policy 단계 정의).

---

### D-PLAN-5: 결제 이력 보존 범위

| 안 | 기록 이벤트 | 장점 | 단점 |
|---|------------|------|------|
| **A** | **모든 이벤트 기록** (구매/갱신/취소/환불/만료/상태변경) | 완전한 감사 추적, 환불 분쟁 대응 | 테이블 row 증가 |
| B | 성공한 거래만 (구매/갱신 성공) | 단순 | 취소/환불 이력 없어 분쟁 시 불리 |
| C | 활성 구독 레코드만 (1행 Upsert) | 최소 | 이력 전무, 감사 불가 |

**권장: A** — 결제 도메인은 감사 추적이 필수. 이벤트소싱 패턴: `subscription_events` 테이블에 모든 이벤트 append-only 기록. `users` 테이블의 `subscription_status / pro_until / is_pro` 는 최신 상태 캐시.

---

### D-PLAN-6: Phase 1 mock 결제 이력의 Phase 2 마이그레이션 처리

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **그대로 유지 (역사 보존) + mock 표시** | 테스트/개발 이력 추적 가능 | 실 매출 집계 시 mock 이력 필터 필요 |
| B | Phase 2 시작 시 mock 이력 폐기 | 집계 단순 | 이력 손실, 트라이얼 재사용 방지 로직에 구멍 |
| C | mock 이력 별도 테이블로 이동 | 분리 명확 | 마이그레이션 복잡 |

**권장: A** — `subscription_events` 테이블에 `source: "mock" | "revenuecat"` 컬럼 추가. Phase 2에서 `source = "revenuecat"` 이벤트만 집계. mock 이력 보존으로 트라이얼 재사용 방지 로직 유지.

---

### D-PLAN-7: 트라이얼 재사용 방지

| 안 | 방지 기준 | 장점 | 단점 |
|---|----------|------|------|
| A | 이메일·OAuth subject (provider_id) 기반 | 구현 단순, 현행 모델 활용 | 다른 이메일/소셜 계정으로 우회 가능 |
| B | 디바이스 ID 기반 | 다계정 우회 방지 | 디바이스 교체 시 신규 사용자 오탐. iOS 정책상 IDFA 제한 |
| C | 결제 수단 기반 (Phase 2) | 가장 신뢰도 높음 | Phase 1에서 불가 |
| **D** | **Phase 1은 방지 안 함 (MVP 한정)** | 구현 0, Phase 1 빠른 출시 | 트라이얼 남용 가능 — Phase 1은 내부 테스트 단계라 실제 사용자 없음 |

**권장: D (Phase 1)** — Phase 1은 내부 검증 목적. Phase 2에서 RevenueCat introductory offer eligibility check (A 기반)로 처리. 필요 시 Phase 2에서 디바이스 기반 추가.

---

### D-PLAN-8: 구독 플랜 tier 구성

현재 paywall.tsx: 월 $2.99 / 연 $19.99 (2-tier). PRD: 월/연 + 7일 트라이얼.

| 안 | 구성 | 장점 | 단점 |
|---|------|------|------|
| ~~**A**~~ | ~~**월 + 연 2-tier (현행)**~~ | ~~단순, 구현 최소~~ | ~~단건/평생 구매 없음~~ |
| B | 월 + 연 + 평생 3-tier | 단건 수익 가능 | 구독 모델 일관성 저하, App Store 검수 복잡 |
| C | 월 1-tier only | 최단순 | 장기 가입 인센티브 없음 |

~~**권장: A** — 월/연 2-tier 유지. 가격 확정은 비즈니스 결정 ($2.99/$19.99 잠정). Phase 2 App Store Connect 상품 등록 시 확정.~~

> **변경 (2026-05-06)**: ~~월+연 2-tier~~ → **월 only $1.99** — 사용자 비즈니스 결정으로 연 플랜 폐기. `adr-11-monthly-only-no-yearly` 참조. paywall 은 월 $1.99 단일 CTA. Phase 2 App Store Connect 도 월 단일 상품 등록.

---

### D-PLAN-9: Anonymous 사용자 paywall 도달 시 동작

| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| **A** | **로그인 유도 → 로그인 후 paywall** | 계정 없이 결제 불가 → 안전 | 로그인 필수 = 진입 장벽 |
| B | 로그인 없이 paywall 노출 (구매 시 로그인 요구) | 구매 의향 확인 먼저 | 로그인 전 paywall UI 노출 비용 |
| C | paywall 접근 자체 차단 (가입 필수 화면만) | 단순 | 구매 의향 사용자 이탈 |

**권장: A** — 현재 앱 구조상 인증 필수 (sessions API 등). paywall 도달 전 로그인 상태 보장. Anonymous 상태에서 paywall 도달 경로 자체가 발생하지 않도록 라우팅 가드.

---

### D-PLAN-10: 법적 약관·개인정보처리방침 표시 시점 (한국 기준)

| 안 | 표시 위치 | 장점 | 단점 |
|---|----------|------|------|
| **A** | **가입 화면 + paywall 화면 (결제 전 동의)** | 한국 전자상거래법 준수 최소 요건 | paywall UI 복잡도 증가 |
| B | 가입 화면에만 (일괄 동의) | 단순 | 결제 시점 동의 명시 부재 → 법적 리스크 |
| C | Phase 2 연동 시점까지 보류 | Phase 1 개발 집중 | Phase 1 자체 결제 UI에 법적 미비 |

**권장: A** — Phase 1 paywall에도 "구독 시 이용약관·개인정보처리방침에 동의합니다" 체크박스 또는 하단 링크 필수. 실제 결제 전 표시가 법적 최소 요건. Phase 1 mock 결제도 동일.

---

## 6. 명시적 비목표 (Out of Scope)

- **가족 공유 / 학교·단체 라이선스**: 미지원
- **기프트 코드 / 프로모션 코드**: Phase 1·2 모두 미포함
- **다국가 통화·세금 자동 처리**: Phase 1. Phase 2는 App Store/RevenueCat 처리에 위임
- **웹 클라이언트 결제 UI**: Mobile only (web은 legacy MVP)
- **사용자별 가격 차등**: 미지원
- **결제 후 즉시 영수증 이메일 발송**: Phase 2까지 보류 (App Store 기본 이메일로 대체)
- **구독 중 플랜 변경 (월→연 업그레이드 in-app)**: Phase 2. Phase 1은 취소 후 재구독
- **무제한 평생 구독 (one-time purchase)**: Out of Scope (D-PLAN-8 A 채택)
- **오프라인 결제 / 신용카드 직접 입력**: 스토어 in-app purchase만 (Phase 2)
- **환불 자동화 (앱 내 환불 버튼)**: Phase 2. Phase 1은 수동 어드민 처리
