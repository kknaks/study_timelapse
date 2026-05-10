---
id: adr-21
type: adr
title: 취소 vs 환불 상태 전환 — 환불=즉시 cancelled, 취소=만료일까지 Pro 유지
status: accepted
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-10-subscription-state-model]]"
  - "[[adr-17-refund-policy-store-delegation]]"
  - "[[adr-19-grace-period-handling]]"
  - "[[adr-22-status-source-cache-with-sync]]"
tags: [adr, payment, subscription, revenuecat, cancel, refund, state-transition, phase2]
---

# 취소 vs 환불 상태 전환 — 환불=즉시 cancelled, 취소=만료일까지 Pro 유지

## Summary

RevenueCat 이벤트 유형에 따라 상태 전환 분기(D-PLAN-2-10 B). 환불(`REFUND` / `CANCELLATION`+영수증무효) = 즉시 `cancelled` + `pro_until=현재시각`. 자발적 취소(`CANCELLATION`+갱신안함) = `cancelled` 기록 + `pro_until` 만료까지 Pro 기능 유지.

---

## Context

- Phase 1 5-state ENUM: `cancelled` 상태 존재. 환불과 자발적 취소 모두 동일 상태로 처리할 경우 사용자 경험 차이 발생
- RevenueCat 이벤트: `CANCELLATION` (자발적 구독 취소), `REFUND` (환불 처리 완료)
- 자발적 취소는 만료일까지 Pro 기능 유지가 스토어 표준 (이미 결제한 기간의 서비스 제공)
- 환불은 결제 무효화 → Pro 근거 소멸 → 즉시 전환이 원칙
- planning-03 D-PLAN-2-10 결정, planning-03 S3/S4 시나리오

---

## Options

| 안 | 환불 | 취소 | 장점 | 단점 |
|---|------|------|------|------|
| A | 즉시 전환 | 즉시 전환 | 구현 단순 | 갱신 취소 후 만료일 전 Pro 기능 박탈 → 사용자 반발. 스토어 표준 위반 가능 |
| **B** | **즉시 cancelled** | **만료일까지 Pro 유지** | 환불/취소 구분 처리. 취소 사용자 경험 보호. 스토어 표준 | 구현 약간 복잡 (취소 시 `subscription_status='cancelled'` 기록 + `pro_until` 까지는 Pro 기능 제공) |
| C | 만료일까지 유지 | 만료일까지 유지 | 단순 | 환불 후에도 Pro 유지 = 무임승차 허용. adr-17 환불 즉시 처리 원칙에 위배 |

---

## Decision

**B 채택 — 환불=즉시 cancelled, 취소=만료일까지 Pro 유지.**

### 이벤트별 상태 전환 규칙

| RevenueCat 이벤트 | subscription_status | pro_until | 즉시 효과 |
|-------------------|---------------------|-----------|-----------|
| `REFUND` | `cancelled` 즉시 | 현재시각으로 갱신 | Pro 권한 즉시 박탈. 워터마크 복귀. 일일 1회 한도 즉시 적용 |
| `CANCELLATION` (자발적, 다음 갱신 안 함) | `cancelled` 기록 | 변경 없음 (기존 pro_until 유지) | pro_until 까지 Pro 유지. 만료 시 lazy expiry → `expired` |
| `BILLING_ISSUE_DETECTED_EVENT` (갱신 실패) | (adr-19 결정에 따름) | (adr-19 결정에 따름) | grace period 처리는 adr-19 참조 |

### Pro 기능 제공 판단 로직 (Phase 1 답습)

```
is_active_pro(user):
  if user.subscription_status == 'pro':
    return True
  if user.subscription_status == 'cancelled' and user.pro_until > now():
    return True  # 자발적 취소 후 만료일 전
  if user.subscription_status == 'trial':
    return True
  return False
```

### 감사 이력 (`subscription_events`)

- `REFUND` 이벤트: `event_type='refund'`, `source='revenuecat'`, `subscription_status='cancelled'`
- `CANCELLATION` 이벤트: `event_type='cancellation'`, `source='revenuecat'`, `subscription_status='cancelled'`
- 환불 vs 취소 구분은 `event_type` 으로 audit trail 에서 명확히 구분

**Why**: Phase 1 `cancelled` 상태의 의미(만료일까지 Pro 유지)와 일치. 환불(영수증 무효)과 취소(서비스 계속 제공) 구분이 법적·비즈니스적으로 정확. 스토어 표준 준수.

---

## Consequences

### backend/api (○)
- webhook `REFUND` 처리: `User.subscription_status='cancelled'` + `User.pro_until=datetime.utcnow()` 즉시 갱신
- webhook `CANCELLATION` 처리: `User.subscription_status='cancelled'` 기록 + `User.pro_until` 변경 없음
- `GET /users/me` 응답: `is_pro` 계산 로직에 `cancelled + pro_until > now` 분기 포함 (Phase 1 이미 구현 확인 필요)
- lazy expiry 기존 로직: `cancelled` 상태에서 `pro_until < now` → `expired` 전환 그대로 유지

### frontend/mobile-fe (○)
- 설정 화면: `subscription_status='cancelled'` 이고 `pro_until > now` 인 경우 "구독이 취소됐으나 {pro_until}까지 사용 가능" 표시 (planning-03 S3 시나리오)

### frontend/web-fe (×)
### frontend/shared-fe (×)
