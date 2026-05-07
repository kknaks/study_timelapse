---
id: policy-01
type: policy
title: 일일 녹화 한도 정책 — Free 1회/일, 사용자 로컬 자정 리셋
status: draft
created: 2026-05-06
updated: 2026-05-06
sources:
  - "[[plan-03-payment-roadmap]]"
  - "[[adr-10-subscription-state-model]]"
related_to:
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-04-subscription-api]]"
  - "[[spec-05-subscription-data-model]]"
  - "[[policy-02-trial]]"
tags: [policy, payment, subscription, daily-quota, timezone]
---

# 일일 녹화 한도 정책 — Free 1회/일, 사용자 로컬 자정 리셋

## Summary

Free·Expired 사용자에게 하루 1회 녹화 완료를 허용. 한도 기준은 `daily_focus.session_count`, 리셋 시각은 사용자 로컬 자정(서버 시계 기준 `User.timezone`). 한도 도달 시 paywall 화면으로 유도.

---

## 1. 개요

일일 한도 정책은 두 가지 목적을 달성한다:
1. **자원 보호**: 무제한 무료 사용 방지
2. **Pro 전환 유도**: 한도 도달 시 paywall 을 노출해 업그레이드 동기 부여

정책의 SSOT: 이 문서. 기술 계약은 `spec-03-subscription-state-machine` §8, `spec-05-subscription-data-model` §6 참조.

---

## 2. 적용 범위

| subscription_status | 한도 적용 | 허용 횟수/일 |
|--------------------|:--------:|:----------:|
| `free` | ✓ | **1회** |
| `trial` | ✗ | 무제한 |
| `pro` | ✗ | 무제한 |
| `expired` | ✓ | **1회** (`free` 와 동일 취급) |
| `cancelled` (pro_until 전) | ✗ | 무제한 |
| `cancelled` (pro_until 이후) | ✓ | **1회** |

> **expired/cancelled 취급 이유**: 구독이 만료되면 `free` 와 동일한 제한이 적용된다. 사용자가 `expired` 또는 `cancelled` 상태에서 다시 구독하면 즉시 무제한으로 복귀.

---

## 3. 카운트 단위

**1회 = 녹화 세션 완료 (`status = "completed"`)**

| 후보 이벤트 | 채택 여부 | 이유 |
|-----------|:-------:|------|
| 녹화 시작 (`POST /api/sessions`) | ✗ | 시작 후 취소 시 차감 불합리 |
| **녹화 완료** (`PUT /api/sessions/{id}` status="completed") | **✓** | 실제 산출물(타임랩스) 생성 시점. `daily_focus.session_count` 와 일치 |
| 타임랩스 변환 완료 | ✗ | 비동기 처리 — 한도와 결합 복잡 |
| 갤러리 저장 완료 | ✗ | 동일 세션 재저장 시 중복 카운트 가능 |

**카운트 source**: `daily_focus` 테이블의 `session_count` 컬럼 (`(user_id, date)` 복합 키). spec-05 §6 참조.

---

## 4. 카운트 진실 원천

`daily_focus.session_count WHERE (user_id = X AND date = 사용자_로컬_오늘)` 이 진실 원천.

- `session_count` 는 `PUT /api/sessions/{id}` 에서 `status="completed"` 일 때 증가 (`sessions.py:124`)
- `date` 컬럼은 **사용자 timezone 기준 날짜** 로 저장 (Phase 1a 에서 `sessions.py:198` 수정 필요 — spec-05 §5)
- 서버가 유일한 카운터. 클라이언트 카운터 병행 사용 금지.

---

## 5. 리셋 시점

**사용자 로컬 자정** (서버 시계 기준)

| 항목 | 값 | 근거 |
|------|---|------|
| 리셋 기준 | 사용자 로컬 자정 | D-PLAN-4 (adr-10) |
| 기본 timezone | `UTC` | User.timezone DEFAULT 'UTC' |
| 시계 기준 | **서버 시계** | 클라이언트 시계 조작 방어 (E4 시나리오) |
| sliding window | ✗ 미채택 | D-PLAN-4 에서 명시적 폐기 |
| 고정 UTC 자정 | ✗ 미채택 | 한국 사용자 09:00 KST 리셋 = 직관 X |

**timezone 설정 흐름**:
1. 가입 시 클라이언트가 `timezone` 전송 → `User.timezone` 갱신
2. 미전송 시 기본값 `'UTC'` 사용
3. 앱 설정에서 변경 가능 (즉시 반영)

**리셋 시각 계산 예시**:

| User.timezone | 서버 UTC 05:00 일 때 사용자 로컬 시각 | 다음 리셋 (UTC) |
|--------------|--------------------------------------|---------------|
| `UTC` | 05:00 | 자정 00:00 UTC |
| `Asia/Seoul` (UTC+9) | 14:00 | 당일 15:00 UTC (= 한국 다음날 00:00) |
| `America/New_York` (UTC-5) | 00:00 | 05:00 UTC |
| `America/Los_Angeles` (UTC-8) | 21:00 전일 | 08:00 UTC |

---

## 6. 한도 도달 시 동작

### 세션 시작 시 한도 체크

`POST /api/sessions` 진입 시 한도 체크:

```
1. subscription_status 확인
2. 한도 적용 대상(free/expired/cancelled만료후) 이면:
   - 오늘 session_count 조회 (daily_focus WHERE date = 사용자_로컬_오늘)
   - session_count >= 1 이면 → 403 DAILY_QUOTA_EXCEEDED 반환
3. 한도 미적용 대상(trial/pro/cancelled만료전) 이면: 즉시 통과
```

### 클라이언트(mobile-fe) 동작

- `403 DAILY_QUOTA_EXCEEDED` 수신 시 → paywall 화면으로 이동
- 세션 시작 버튼 비활성화 조건: `GET /users/me` 의 `daily_session_count >= daily_quota` (daily_quota > 0 인 경우)
- 사용자 메시지 예시: "오늘 1회 무료 촬영을 완료했습니다. 자정 이후 또는 Pro 구독으로 무제한 촬영하세요."
- 현재 진행 중인 녹화: 이미 시작된 세션은 한도와 무관하게 완료까지 허용 (시작 시점에 허가 완료)

---

## 7. 계산 예시 — timezone 사용자 비교

**시나리오**: 두 사용자가 2026-05-06 UTC 22:00 에 녹화를 완료함.

| 사용자 | timezone | daily_focus.date (저장값) | 리셋 시각 (UTC) |
|--------|----------|--------------------------|---------------|
| A | `UTC` | 2026-05-06 | 2026-05-07 00:00 UTC |
| B | `Asia/Seoul` | 2026-05-07 (= KST 07:00 다음날) | 2026-05-07 15:00 UTC |

A 는 2시간 후 리셋, B 는 이미 다음날로 기록 → 바로 다시 사용 가능 (B 에게 유리).

---

## 8. Edge Case

| # | 시나리오 | 동작 |
|---|---------|------|
| E1 | trial → expired 전이 시 당일 한도 | trial 동안 무제한 → expired 전환 즉시 오늘 daily_focus.session_count 확인. 이미 1회 이상 완료했다면 당일 남은 한도 = 0 (오늘 이미 사용). 서버는 오늘 session_count 그대로 유지 — 별도 리셋 없음 |
| E2 | timezone 변경 시 | 변경 즉시 반영. 변경 전 오늘 날짜 기준 session_count 는 변경 전 timezone 으로 저장된 레코드 그대로 유지. 변경 후 조회 시 새 timezone 기준 오늘 날짜 사용 → 기존 레코드가 다른 날짜이면 오늘 session_count = 0 (새 날짜로 조회) |
| E3 | 자정 직전 녹화 시작 → 자정 이후 종료 | 세션 시작 시점에 한도 체크 완료 → 완료 시 카운트는 **종료 시각 기준 날짜** 의 daily_focus 에 기록. 시작일 != 종료일인 경우 종료일 카운트 증가. (시작 시점에 허가 완료했으므로 완료는 허용) |
| E4 | 클라이언트 시계 변조 | 서버 시계 기준으로 모든 판단. 클라이언트가 내일 날짜를 보내도 서버는 `User.timezone` + 서버 시각으로 오늘 날짜 계산 |
| E5 | timezone = 'UTC' 기본값 사용자가 나중에 timezone 설정 | 설정 시점부터 새 timezone 적용. 과거 레코드 변경 없음. 오늘 날짜 재계산 후 기존 레코드 없으면 새 날짜로 0부터 시작 |

---

## 9. 모니터링·감사

- `DAILY_QUOTA_EXCEEDED` 에러 발생 시 서버 로그 기록 (user_id, timestamp, endpoint)
- 비정상 패턴 감지 기준 (향후 자동화 — Phase 3+ 이후):
  - 같은 사용자가 동일 일 내 한도 초과 시도 5회 이상 → 어뷰즈 플래그
- Phase 1 에서는 로그 보존 (aggregation/alert 는 미구현)
