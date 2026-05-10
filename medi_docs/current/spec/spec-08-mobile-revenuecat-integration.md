---
id: spec-08
type: spec
title: Mobile RevenueCat SDK 통합 — react-native-purchases 초기화·logIn·paywall·sync
status: draft
created: 2026-05-09
updated: 2026-05-10
note: "2026-05-10 T-015 patch — Product ID com.studytimelapse.monthly → com.kknaks.studytimelapse.monthly (Bundle ID prefix 통일). 2026-05-09 T-008 patch — 온보딩 trial 안내 흐름 신규 섹션 추가. useSubscription Phase 2 신규 가입자 동작 보강."
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-16-introductory-offer-and-auto-renewal]]"
  - "[[adr-18-app-user-id-mapping]]"
  - "[[adr-22-status-source-cache-with-sync]]"
  - "[[adr-13-anonymous-paywall-and-terms]]"
  - "[[spec-06-revenuecat-integration]]"
  - "[[spec-04-subscription-api]]"
tags: [spec, payment, subscription, revenuecat, mobile, sdk, react-native, paywall, phase2]
---

# Mobile RevenueCat SDK 통합 — react-native-purchases 초기화·logIn·paywall·sync

## Summary

`react-native-purchases` SDK 를 이용한 Phase 2 mobile 통합 명세. SDK 초기화, logIn 시점, paywall 구매 흐름, introductory offer eligibility, grace period 배너, 강제 sync UI 를 포함.

---

## 1. 개요

Phase 1 paywall 은 `POST /api/subscription/mock-purchase` 를 직접 호출했으나, Phase 2 는 다음으로 변경:

| 항목 | Phase 1 | Phase 2 |
|------|---------|---------|
| 구매 trigger | `mockPurchase()` API 호출 | `Purchases.purchasePackage()` (RevenueCat RN SDK) |
| 구독 상태 source | backend only | backend 캐시 + webhook sync (spec-06) |
| 트라이얼 | **가입 즉시 backend 자동 시작** | **paywall introductory offer — 사용자가 직접 선택** (adr-16 B) |
| 강제 sync | 없음 | `POST /api/subscription/sync` |
| 신규 가입자 초기 상태 | `subscription_status='trial'` | **`subscription_status='free'`** |

### 핵심 변경: 온보딩 흐름에 Trial 안내 페이지 추가 (§1-A)

Phase 1 은 가입 즉시 trial 이 시작되어 사용자가 인지하기 전에 7일이 카운트되었다. Phase 2 는 가입 후 Trial 안내 페이지에서 명시적으로 선택하게 한다.

---

## 1-A. 온보딩 흐름 — Trial 안내 페이지 (신규, T-010 구현 대상)

### 전체 흐름

```
[가입 완료] → subscription_status='free'
  ↓
[약관 동의] onboarding/legal — terms.tsx (기존)
  ↓
[신규] onboarding/trial-intro.tsx  ← 이 섹션
  ↓
  ├─ [7일 무료 체험 시작] → router.push('/paywall?source=onboarding')
  │    → paywall.tsx 가 introductory offer 로 purchasePackage() 자동 진입
  │    → 결제 정보 등록 + 7일 무료 시작 → subscription_status='trial'
  │
  └─ [나중에] → router.replace('/') → index.tsx (Free 사용자)
       → Free 1회/일 한도 운용 → 한도 도달 시 paywall 자동 노출
```

### trial-intro.tsx UI 명세

```typescript
// app/onboarding/trial-intro.tsx
// 온보딩 legal 동의 직후에 노출되는 Trial 안내 화면

const TrialIntroScreen = () => {
  const router = useRouter();

  return (
    <View>
      <Heading>7일 무료로 Pro 기능을 경험하세요</Heading>

      <FeatureList items={[
        '무제한 녹화 (Free: 1회/일)',
        '워터마크 없는 타임랩스',
        '프로그레스바 기능',
      ]} />

      {/* 한국법 자동 갱신 사전 고지 — policy-03 표준 문구 인용 */}
      <AutoRenewalNotice>
        체험 시작 시 Apple/Google 계정에 결제 정보를 등록합니다.{'\n'}
        7일 체험 후 자동으로 USD $1.99/월이 청구됩니다.{'\n'}
        갱신 14일 전 앱 내 알림으로 안내드립니다.{'\n'}
        언제든지 App Store / Google Play 에서 취소 가능합니다.
      </AutoRenewalNotice>

      {/* [7일 무료 체험 시작] CTA */}
      <PrimaryButton
        onPress={() => router.push('/paywall?source=onboarding')}
        label="7일 무료 체험 시작"
      />

      {/* [나중에] */}
      <SecondaryButton
        onPress={() => router.replace('/')}
        label="나중에 (Free로 시작)"
      />
    </View>
  );
};
```

### paywall.tsx — `source=onboarding` 분기

```typescript
// app/paywall.tsx
const { source } = useLocalSearchParams<{ source?: string }>();
const isOnboardingEntry = source === 'onboarding';

// 온보딩 진입 시 UI 텍스트 변경
const ctaLabel = isOnboardingEntry
  ? '환영 7일 무료 체험 시작'
  : (introEligible ? '7일 무료로 시작하기' : '$1.99/월 구독하기');

// 온보딩 진입 + introEligible 이면 handlePurchase() 를 한 번 더 확인 없이 바로 실행할 수도 있음
// (UX 결정: T-010 구현 시 확정)
```

### Phase 1 기존 온보딩 (`onboarding/terms.tsx`) 변경 사항

- `terms.tsx` 에서 약관 동의 완료 후 현재는 `router.replace('/')` → **`router.replace('/onboarding/trial-intro')` 로 교체** (T-010 구현)
- `terms.tsx` 자체 내용 변경 없음. 라우팅만 변경.

---

## 2. 의존성 추가

```bash
# frontend/mobile 에서 실행
npx expo install react-native-purchases react-native-purchases-ui

# iOS: pod install 필요 (EAS build 에서 자동)
# Android: build.gradle 자동 처리
```

**ENV 변수** (`app.config.ts` 또는 `.env`):
```
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_xxxxxxxxxx
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_xxxxxxxxxx
```

---

## 3. SDK 초기화

**위치**: `app/_layout.tsx` (앱 최상위 레이아웃, useEffect)

```typescript
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

// app/_layout.tsx
useEffect(() => {
  const apiKey = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY!
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY!;

  Purchases.setLogLevel(LOG_LEVEL.DEBUG); // dev only (prod: ERROR)
  Purchases.configure({ apiKey });
}, []);
```

- 초기화 시 anonymous ID 로 시작 (user_id 매핑 전)
- logIn 은 §4 에서 별도 처리

---

## 4. logIn 호출 시점 (adr-18 A 결정)

**가입 즉시 + 로그인 직후** `Purchases.logIn(user_id)` 호출.

```typescript
// src/api/auth.ts (또는 useAuth hook)
import Purchases from 'react-native-purchases';

async function onAuthSuccess(user: User) {
  // JWT 저장, user context 업데이트 등 기존 로직...

  // Phase 2: RevenueCat logIn
  try {
    await Purchases.logIn(user.id);
  } catch (e) {
    // SDK 초기화 실패 시 무시 (구독 상태는 backend 에서 fallback)
    console.warn('RevenueCat logIn failed:', e);
  }
}
```

**logIn 호출 위치 체크리스트**:
- [ ] 회원가입 완료 직후 (`/auth/signup` 성공 후)
- [ ] 로그인 완료 직후 (`/auth/login` 성공 후)
- [ ] 앱 재실행 + 자동 로그인 복원 직후 (기존 token 유효성 확인 후)

**Anonymous 사용자**: Phase 1 정책 유지 (adr-13). 로그인 전 paywall 도달 시 로그인 유도 화면으로 이동. `Purchases.logIn` 호출 없음.

---

## 5. Paywall 구매 흐름 (app/paywall.tsx 교체)

### 5-1. Offerings 로드

```typescript
import Purchases, { PurchasesOffering } from 'react-native-purchases';

const [offering, setOffering] = useState<PurchasesOffering | null>(null);

useEffect(() => {
  Purchases.getOfferings()
    .then(offerings => {
      setOffering(offerings.current ?? null);
    })
    .catch(console.warn);
}, []);
```

### 5-2. Introductory Offer Eligibility 조회 (adr-16)

```typescript
import { INTRO_ELIGIBILITY_STATUS } from 'react-native-purchases';

const [introEligible, setIntroEligible] = useState<boolean>(false);

useEffect(() => {
  if (!offering) return;
  const productIds = offering.availablePackages.map(p => p.product.identifier);
  Purchases.checkTrialOrIntroDiscountEligibility(productIds)
    .then(eligibilityMap => {
      const monthlyId = 'com.kknaks.studytimelapse.monthly';
      const status = eligibilityMap[monthlyId]?.status;
      setIntroEligible(status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE);
    })
    .catch(() => setIntroEligible(false));
}, [offering]);
```

- `introEligible = true` → paywall 에 "7일 무료 체험" 배지 표시
- `introEligible = false` → 배지 미표시 (Phase 1 trial 이미 소진한 사용자 등)

### 5-3. 구매 버튼 핸들러

```typescript
import { verifySubscription } from '../api/subscription';   // POST /verify

async function handlePurchase() {
  if (!offering) return;

  const monthlyPackage = offering.availablePackages.find(
    p => p.product.identifier === 'com.kknaks.studytimelapse.monthly'
  );
  if (!monthlyPackage) return;

  setLoading(true);
  try {
    // 1. 스토어 결제 시트 → RevenueCat SDK 처리
    const { customerInfo } = await Purchases.purchasePackage(monthlyPackage);

    // 2. client verify (adr-15 경로 A: 1회 재시도 포함)
    const transactionId = _extractTransactionId(customerInfo);
    try {
      await verifySubscription({
        app_user_id: user!.id,
        transaction_id: transactionId,
        product_identifier: 'com.kknaks.studytimelapse.monthly',
      });
    } catch {
      // verify 1회 재시도
      try {
        await verifySubscription({
          app_user_id: user!.id,
          transaction_id: transactionId,
          product_identifier: 'com.kknaks.studytimelapse.monthly',
        });
      } catch {
        // 재시도도 실패 → webhook 대기 안내
        showToast('잠시 후 자동으로 구독이 적용됩니다.');
      }
    }

    // 3. 상태 갱신 (react-query invalidate)
    await queryClient.invalidateQueries({ queryKey: ['me'] });

    // 4. paywall 닫기 + Pro 화면 진입
    router.back();
  } catch (purchaseError: any) {
    if (purchaseError.userCancelled) return; // 사용자 취소 — 오류 없음
    showToast('구매 중 오류가 발생했습니다.');
  } finally {
    setLoading(false);
  }
}

function _extractTransactionId(customerInfo: CustomerInfo): string {
  const entitlement = customerInfo.entitlements.active['pro_access'];
  return entitlement?.productIdentifier ?? customerInfo.originalAppUserId;
}
```

### 5-4. 구매 흐름 Sequence

```
[paywall.tsx]                    [RevenueCat SDK]    [Backend]
   │  handlePurchase()               │                  │
   │──purchasePackage()──────────────►│                  │
   │                                 │──스토어 결제 시트─►│ (Apple/Google)
   │◄── { customerInfo } ───────────│                  │
   │──POST /verify (1차) ────────────────────────────►  │
   │◄── 200 OK (pro) ───────────────────────────────── │
   │  invalidateQueries(['me'])       │                  │
   │──GET /users/me ─────────────────────────────────► │
   │◄── subscription_status:pro ────────────────────── │
   │  router.back() + Pro UI 진입    │                  │
```

---

## 6. useSubscription 훅 확장 (grace period + Phase 2 신규 가입자)

기존 `src/hooks/useSubscription.ts` 에 `graceUntil` 및 `isGracePeriod` 필드 추가.

**Phase 2 신규 가입자 동작 변경 (adr-16 B)**:
- 가입 직후 `subscription_status='free'` (Phase 1: `'trial'`)
- `trialDaysRemaining = 0` — trial 이 backend 에 박히지 않으므로 D-7 배너 미표시
- trial 시작 시점 = paywall `purchasePackage()` 성공 후 RevenueCat webhook `INITIAL_PURCHASE` + `period_type=TRIAL` 수신 시 → `subscription_status='trial'` 갱신됨

**Phase 1 기존 사용자**: `subscription_status='trial'` + `trial_start_date` 존재 → 기존 `TrialExpiringBanner` 로직 그대로 동작. 자연 종료까지 Phase 1 경로 유지.

```typescript
// src/hooks/useSubscription.ts (Phase 2 확장)
export function useSubscription() {
  const { data: rawData, isLoading, refetch } = useQuery({ ... });
  const user = unwrapUser(rawData);

  // 기존 필드 유지
  const status: SubscriptionStatus = user?.subscription_status ?? 'free';
  const active = isActivePlan(status);

  // Phase 2 신규
  const graceUntil: string | null = user?.grace_until ?? null;
  const isGracePeriod = graceUntil
    ? new Date(graceUntil) > new Date()
    : false;

  // grace 임박 (3일 이내)
  const isGraceApproaching = graceUntil
    ? new Date(graceUntil).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 && isGracePeriod
    : false;

  return {
    ...기존 반환값...,
    graceUntil,
    isGracePeriod,
    isGraceApproaching,
  };
}
```

**배너 컴포넌트 사용 예시** (설정 화면 또는 홈 화면):
```typescript
const { isGracePeriod, graceUntil } = useSubscription();

if (isGracePeriod && graceUntil) {
  return (
    <GraceWarningBanner
      expiresAt={graceUntil}
      onUpdatePaymentMethod={() => {
        // 스토어 결제 수단 관리 화면으로 이동
        Linking.openURL(Platform.OS === 'ios'
          ? 'https://apps.apple.com/account/subscriptions'
          : 'https://play.google.com/store/account/subscriptions'
        );
      }}
    />
  );
}
```

---

## 7. 강제 Sync UI (아이디어)

**설정 화면** (`app/settings` 또는 구독 상태 표시 영역):

```typescript
import { syncSubscription } from '../api/subscription';  // POST /sync

async function handleSyncSubscription() {
  setSyncing(true);
  try {
    await syncSubscription();
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    showToast('구독 상태를 업데이트했습니다.');
  } catch (e: any) {
    if (e.response?.status === 429) {
      showToast('잠시 후 다시 시도해주세요.');
    }
  } finally {
    setSyncing(false);
  }
}

// UI
<TouchableOpacity onPress={handleSyncSubscription} disabled={syncing}>
  <Text>구독 상태 새로고침</Text>
</TouchableOpacity>
```

---

## 8. src/api/subscription.ts 확장

기존 `mockPurchase` 에 Phase 2 함수 추가:

```typescript
// src/api/subscription.ts (Phase 2 추가)
import { apiClient } from './client';

// 기존 (유지)
export const mockPurchase = (plan: 'monthly') =>
  apiClient.post('/api/subscription/mock-purchase', { plan });

// Phase 2 신규
export interface VerifyRequest {
  app_user_id: string;
  transaction_id: string;
  product_identifier: string;
}

export const verifySubscription = (data: VerifyRequest) =>
  apiClient.post<{ data: SubscriptionResponse }>('/api/subscription/verify', data);

export const syncSubscription = () =>
  apiClient.post<{ data: SubscriptionResponse }>('/api/subscription/sync');
```

---

## 9. Anonymous 사용자 흐름 (Phase 1 정책 유지, adr-13)

```
[로그인 없이 앱 사용]
  ↓ 1회/일 초과 또는 Pro 기능 시도
  ↓ paywall 도달
  ↓ (인증 미완료 상태 체크)
  ↓ 로그인 유도 화면 이동
  ↓ 로그인/가입 완료
  ↓ Purchases.logIn(user_id) 호출
  ↓ paywall 재진입 가능
```

RevenueCat anonymous user ID 활용 없음. `Purchases.logIn` 은 인증 완료 후에만 호출.

---

## 10. 영향 범위

- **frontend/mobile-fe** ○:
  - `react-native-purchases` 의존성 추가 (package.json + pod)
  - `app/_layout.tsx`: SDK configure
  - 인증 완료 hook: `Purchases.logIn(user_id)` 추가
  - `app/paywall.tsx`: 구매 trigger 교체 (mock-purchase → purchasePackage + verify) + `source=onboarding` 분기 추가
  - **`app/onboarding/trial-intro.tsx`: 신규 (T-010)** — Trial 안내 + [7일 무료 체험 시작] / [나중에] CTA
  - **`app/onboarding/terms.tsx`: 라우팅만 변경 (T-010)** — 약관 동의 후 `router.replace('/onboarding/trial-intro')`
  - `src/api/subscription.ts`: verifySubscription / syncSubscription 추가
  - `src/hooks/useSubscription.ts`: graceUntil / isGracePeriod / isGraceApproaching 추가. Phase 2 신규 가입자 `free` 초기 상태 처리.
  - 설정 화면: GraceWarningBanner + 강제 sync 버튼 추가
- **backend/api** × (이 spec 은 mobile 전용. backend 는 spec-06/07 참조)
- **frontend/web-fe** ×
- **frontend/shared-fe** ×
