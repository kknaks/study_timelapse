---
id: runbook-01
type: runbook
title: Phase 2 사용자 영역 설정 가이드 (Apple / Google / RevenueCat / ENV / Sandbox)
status: draft
created: 2026-05-09
updated: 2026-05-10
sources:
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-15-receipt-verification-dual-path]]"
  - "[[adr-16-introductory-offer-and-auto-renewal]]"
  - "[[adr-18-app-user-id-mapping]]"
  - "[[adr-19-grace-period-handling]]"
  - "[[adr-20-webhook-auth-bearer]]"
  - "[[adr-22-status-source-cache-with-sync]]"
  - "[[spec-06-revenuecat-integration]]"
  - "[[spec-08-mobile-revenuecat-integration]]"
  - "[[policy-03-terms-of-service]]"
  - "[[policy-04-privacy-policy]]"
tags: [runbook, payment, subscription, revenuecat, phase2, setup]
---

# Phase 2 사용자 영역 설정 가이드 (Apple / Google / RevenueCat / ENV / Sandbox)

## Summary

PLAN-004 Phase 2 코드·문서가 완료된 이후 진행하는 **사용자 영역 P2.0 설정** 단계 가이드. Apple Developer, Google Play Console, RevenueCat Dashboard 등록 + ENV 키 입력 + Sandbox 테스터 추가 + 빌드 실행까지 순서대로 따라갈 수 있도록 작성함. 개발자가 아닌 팀원도 단계별로 진행 가능.

---

## 1. 개요

이 문서는 plan-04-revenuecat-roadmap 의 **P2.0 사전 준비 (사용자 영역)** + **P2.4 sandbox 통합 검증** 단계 실행 가이드다.

코드는 이미 준비되어 있으며, 이 가이드를 따라 외부 계정·콘솔 등록 + ENV 키 입력 + sandbox 테스트만 완료하면 Phase 2 결제가 작동한다.

**전제 조건**:
- PLAN-004 T-005/T-006/T-009/T-010/T-011/T-012 구현 완료
- backend `.env` 파일 존재 (`backend/.env`)
- mobile `.env` 파일 없으면 신규 생성 (`frontend/mobile/.env`)

---

## 2. ENV 키 매핑

RevenueCat Dashboard 에서 발급받은 키를 아래 파일에 입력한다.

| RevenueCat Dashboard 위치 | 변수 이름 | 입력 파일 |
|---------------------------|-----------|----------|
| Project Settings → API Keys → **Public iOS Key** (`appl_...`) | `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | `frontend/mobile/.env` (없으면 신규 생성) |
| Project Settings → API Keys → **Public Android Key** (`goog_...`) | `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | `frontend/mobile/.env` |
| Project Settings → API Keys → **Secret API Key (V2)** (`sk_...`) | `REVENUECAT_API_KEY` | `backend/.env` |
| 사용자 임의 생성 Bearer 토큰 | `REVENUECAT_WEBHOOK_AUTH_TOKEN` | `backend/.env` + RevenueCat Webhook 설정 양쪽 동일 |

> `REVENUECAT_WEBHOOK_AUTH_TOKEN` 은 RevenueCat 이 발급하는 키가 아니다. 임의의 긴 문자열(예: UUID v4)을 직접 생성해서 backend `.env` 와 RevenueCat Webhook 설정에 **동일하게** 입력한다.

---

## 3. 코드에 박힌 식별자

아래 식별자는 코드에 하드코딩되어 있다. RevenueCat Dashboard 등록 시 **동일한 값**을 사용해야 한다. 변경 시 코드도 함께 수정 필요.

| 식별자 | 값 | 참조 파일 |
|--------|-----|----------|
| Product ID | `com.kknaks.studytimelapse.monthly` | backend subscription 서비스, mobile paywall.tsx |
| Entitlement Identifier | `pro_access` | mobile `paywall.tsx` introEligible 분기 |
| Offering Identifier | `default` | mobile purchases.ts |
| Package Identifier | `$rc_monthly` | mobile purchases.ts |

---

## 4. 단계별 작업

### Step 1 — Apple Developer + App Store Connect

1. [Apple Developer Program](https://developer.apple.com) 계정 가입 (연 $99 USD)
2. App Store Connect 에서 새 앱 등록
   - Bundle ID = 프로젝트 코드에 설정된 Bundle ID 와 정확히 일치
3. In-App Purchase 등록:
   - Type: **Auto-Renewable Subscription**
   - Subscription Group 생성 (예: "Pro Subscriptions")
   - **Product ID = `com.kknaks.studytimelapse.monthly`**, 가격 = $1.99 USD/월
   - **Introductory Offer 추가**: Type = Free Trial, Duration = 1 Week (adr-16)
4. App Store Connect API Key 발급 (RevenueCat 연동용)
   - App Store Connect → Users and Access → Integrations → App Store Connect API
   - `.p8` 파일 + Key ID + Issuer ID 저장 (RevenueCat Step 3에서 필요)

### Step 2 — Google Play Console

1. [Google Play Developer](https://play.google.com/console) 계정 가입 (일회성 $25 USD)
2. 앱 등록 (Bundle ID는 Apple 과 동일 권장)
3. In-app subscription 등록
   - Product ID = `com.kknaks.studytimelapse.monthly`, 가격 동일
   - Free trial = 7 days
4. Service Account 발급 (RevenueCat 연동용):
   - Google Cloud Console → IAM & Admin → Service Accounts → Create
   - Key 탭 → JSON 다운로드
   - Play Console → Setup → API access → Service Account 권한 부여

### Step 3 — RevenueCat

1. [RevenueCat](https://www.revenuecat.com) 가입 + Project 생성
2. App 추가 (2개):
   - **iOS app**: App Store Connect API Key (`.p8`) + Bundle ID + Issuer ID + Key ID
   - **Android app**: Service Account JSON + Package Name
3. Products 자동 import 확인 (Step 1/2에서 등록한 상품이 나타나는지 확인)
4. **Entitlement 생성**:
   - Identifier = `pro_access`
   - 위 product 연결
5. **Offering 설정**:
   - Identifier = `default`
   - Package = `$rc_monthly`, product 매핑
6. **API Keys 발급** (Project Settings → API Keys):
   - Public iOS Key (`appl_...`) → `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
   - Public Android Key (`goog_...`) → `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
   - Secret API Key V2 (`sk_...`) → `REVENUECAT_API_KEY`
7. **Webhook 설정** (Project Settings → Webhooks):
   - URL: `https://<backend-도메인>/api/subscription/webhook`
   - Authorization Header: `Bearer <임의 생성 토큰>` ← `REVENUECAT_WEBHOOK_AUTH_TOKEN` 과 동일 값 (adr-20)

### Step 4 — ENV 입력

`backend/.env` 에 2개 키 추가:
```
REVENUECAT_API_KEY=sk_...
REVENUECAT_WEBHOOK_AUTH_TOKEN=<임의 생성 Bearer 토큰>
```

`frontend/mobile/.env` 신규 생성 후 2개 키 추가:
```
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
```

> `.env` 파일은 git 에 커밋하지 않는다. `.gitignore` 에 이미 포함되어 있는지 확인.

### Step 5 — Sandbox Tester

**Apple**:
1. App Store Connect → Users and Access → Sandbox Testers → 추가
2. 가짜 이메일 주소 + 임의 비밀번호 설정 (실제 Apple ID 아닌 sandbox 전용)
3. 테스트 iOS 디바이스: 설정 → App Store → 아래로 스크롤 → Sandbox Account 로 위 계정 로그인

**Google**:
1. Play Console → Setup → License testing → 테스터 이메일 추가
2. Internal testing track 에 APK/AAB 등록 (빌드 후)

### Step 6 — 빌드 + 실행

```bash
# Backend
cd backend
pytest                          # 테스트 통과 확인
uvicorn app.main:app --reload   # 서버 실행
```

```bash
# Mobile (iOS)
cd frontend/mobile
pnpm install
cd ios && pod install --repo-update    # 첫 실행만 --repo-update
cd ..
npx expo run:ios
```

```bash
# Mobile (Android)
cd frontend/mobile
npx expo run:android
```

---

## 5. Sandbox 결제 테스트 시나리오 (P2.4)

iOS Sandbox 는 시간 자동 단축 (1주 ≈ 5분). 자동 갱신 6회 후 자동 종료.

| # | 시나리오 | 액션 | 기대 결과 |
|---|---------|------|---------|
| 1 | 신규 가입 | 앱 시작 → Google/Apple OAuth → 약관 동의 → trial-intro 화면 | `subscription_status='free'` |
| 2 | Free 진입 | trial-intro 에서 [Not Now] | index 화면 이동, 1일 1회 한도 적용 |
| 3 | Trial 시작 | trial-intro 에서 [7일 무료 체험 시작] → paywall → 구매 시트 → 완료 | `status='trial'`, `pro_until` = trial 만료일 |
| 4 | 자동 갱신 | sandbox 단축 모드 대기 (약 5분) | trial 만료 → `status='pro'`, 결제 성공 |
| 5 | 구독 취소 | 설정 → 구독 관리 → 취소 | `status='pro'` 유지, `pro_until` 까지 Pro 기능 유지 |
| 6 | 환불 | App Store sandbox refund 처리 | `status='cancelled'`, 즉시 워터마크 복귀 |
| 7 | Grace Period | 결제 수단 만료 시뮬레이션 | `status='pro'` 유지 + `grace_until` 설정 + 앱 내 배너 표시 |
| 8 | 강제 sync | 설정 → "Refresh Subscription Status" 버튼 | RevenueCat customer info → backend 갱신 확인 |

---

## 6. 막혔을 때 점검

| 증상 | 점검 포인트 |
|------|------------|
| paywall 진입 시 "결제 미설정 모드" 토스트 | `frontend/mobile/.env` 의 `EXPO_PUBLIC_REVENUECAT_*_API_KEY` 빈 값 여부 확인 |
| 결제 성공했는데 backend 가 구독 상태를 모름 | `REVENUECAT_WEBHOOK_AUTH_TOKEN` backend `.env` 와 RevenueCat Webhook 설정 일치 여부 / Webhook URL 도메인 접근 가능 여부 / backend 503 응답 여부 |
| introductory offer 가 ELIGIBLE 로 나오지 않음 | App Store Connect 의 introductory offer 상품 심사 통과 여부 / 동일 Apple ID 가 이미 trial 사용 이력 있는지 확인 |
| Android 빌드 실패 | Google Play Console Service Account 권한 설정 여부 / Package Name 일치 여부 |
| RevenueCat Products 가 자동 import 안 됨 | App Store Connect API Key 권한 / Android Service Account 역할 부여 완료 여부 |

---

## 7. 회사 정보 Placeholder 입력 가이드

Phase 2 출시 전 아래 항목을 별도로 채워야 한다. **이 가이드에서는 채우지 않음 — 사용자가 정보 확정 후 직접 patch.**

| 위치 | 항목 | 입력 방법 |
|------|------|---------|
| `medi_docs/current/policy/policy-03-terms-of-service.md` 부칙 | 회사 주소, 사업자등록번호, 통신판매업 신고번호 | 해당 줄의 `[예시]` 텍스트를 실제 값으로 교체 |
| `medi_docs/current/policy/policy-04-privacy-policy.md` §8 | 개인정보 보호책임자 이름·직책·전화·이메일 | `[책임자 이름 예시]`, `[직책 예시]`, `[전화 예시]` 를 실제 값으로 교체 |
| `medi_docs/current/policy/policy-04-privacy-policy.md` §6 | 개인정보 이동권 형식·절차 | 법무 검토 후 `[TBD: ...]` 부분 교체 |
| `medi_docs/current/policy/policy-04-privacy-policy.md` §9 | 추가 보안 조치 | 법무/보안 검토 후 `[TBD: ...]` 부분 교체 |

> policy 문서 수정 후 mobile UI (`frontend/mobile/src/`) 의 법적 화면 정적 텍스트도 동기화 필요 (T-012 이후 별도 fix task 대상).
