---
id: spec-12
type: spec
title: Stats 도메인 — 통계 API·모바일 Stats 화면
status: draft
created: 2026-05-18
updated: 2026-05-18
sources:
  - "[[planning-01-recording-pipeline]]"
  - "[[spec-10-session-domain]]"
depends_on:
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-08-mobile-revenuecat-integration]]"
tags: [spec, stats, backend, mobile, calendar, subscription]
---

# Stats 도메인 — 통계 API·모바일 Stats 화면

## Summary

`daily_focus` 테이블 기반으로 일별·주간 포커스 시간과 streak을 제공하는 BE API와, 오늘/streak 카드·주간 바 차트·월별 캘린더로 구성된 모바일 Stats 화면을 정의한다.

---

## [API] Stats Endpoints

### GET /api/stats/daily — 일별 포커스 통계

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |
| Query params | `start_date` (YYYY-MM-DD, 기본: 오늘-30일), `end_date` (YYYY-MM-DD, 기본: 오늘) |

**Response 200**

```json
{
  "success": true,
  "data": [
    {
      "date": "2026-05-18",
      "total_seconds": 3600,
      "session_count": 2
    }
  ]
}
```

- 데이터가 없는 날짜는 응답에 포함되지 않음 (sparse 배열)
- 날짜 오름차순 정렬

---

### GET /api/stats/weekly — 주간 포커스 통계

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |
| Query params | `target_date` (YYYY-MM-DD, 기본: 오늘) |

**Response 200**

```json
{
  "success": true,
  "data": {
    "week_start": "2026-05-12",
    "week_end": "2026-05-18",
    "total_seconds": 14400,
    "session_count": 6,
    "daily": [
      { "date": "2026-05-12", "total_seconds": 1800, "session_count": 1 }
    ],
    "streak": 5,
    "longest_streak": 12
  }
}
```

---

## [API] 비즈니스 규칙

- 주 시작은 **월요일** (ISO 기준)
- `target_date`의 해당 주를 반환 (`week_start = target_date - weekday`, `week_end = week_start + 6`)
- `streak`, `longest_streak`는 `User` 모델의 누적 값을 그대로 반환 (세션 완료 시 갱신됨)
- 일별 조회: `start_date ~ end_date` 범위 (inclusive). 기본 최근 30일
- `start_date/end_date` 파라미터는 UTC 기준으로 수신됨 — 사용자 timezone 적용 미구현 (⚠ 부채)

---

## [모바일] 화면 구성

Stats 화면 (`app/stats.tsx`) 단일 화면. 세 섹션 + Settings 하단 시트.

| 섹션 | 내용 |
|---|---|
| 오늘/Streak 카드 | 오늘 누적 공부 시간(초→hh:mm), streak 일수 |
| 주간 바 차트 | 이번 주 7일 일별 바. 탭 시 말풍선 표시 |
| 월별 캘린더 Activity Log | 세션 있는 날 점 표시. 탭 시 해당 날짜 공부 시간 말풍선 |
| Settings 모달 | 이름 편집·구독 동기화·로그아웃·Upgrade 버튼 |

---

## [모바일] 전환 흐름

```
/ (index.tsx)
  └─ "↗ Focus Stats" 탭 → /stats

/saving (saving.tsx)
  └─ finished=true, "View Stats →" 탭 → /stats (router.replace)

/stats (stats.tsx)
  ├─ "←" 탭 → router.back()
  ├─ "≡" 탭 → Settings 모달 열기
  │    ├─ "Upgrade Now →" → /paywall
  │    ├─ "Refresh Subscription Status" → syncSubscription() + invalidate ['me']
  │    ├─ Name "Edit" → 이름 편집 모드 (TextInput + Save/Cancel)
  │    └─ "Sign Out" → Alert → GoogleSignin.signOut() + tokenStore.clearTokens() → /login
  ├─ 바 차트 바 탭 (hasData=true) → barBubble 말풍선 표시
  │    └─ barBubble 탭 → 말풍선 닫기
  ├─ 캘린더 날짜 탭 (세션 있는 날) → 말풍선 표시
  │    └─ 배경 탭 → 말풍선 닫기
  └─ 캘린더 월 네비게이션 "‹"/"›" → 이전/다음 달 이동
```

---

## [모바일] 주요 상태/데이터

### API 데이터

| 쿼리 키 | API 함수 | 데이터 |
|---|---|---|
| `['me']` | `getMe()` | `user.streak`, `user.name`, `user.subscription_status` |
| `['weekly-stats']` | `getWeeklyStats()` | `total_seconds`, `daily[]`, `week_start` |
| `['daily-stats', calYear, calMonth]` | `getDailyStats(start, end)` | 월별 날짜별 `session_count`, `total_seconds` |

### 로컬 상태

| 상태 | 타입 | 설명 |
|---|---|---|
| `calYear`, `calMonth` | number | 현재 캘린더 표시 연/월 |
| `selectedDate` | string \| null | 클릭된 캘린더 날짜 (말풍선 트리거) |
| `bubblePos` | object \| null | 캘린더 말풍선 위치 (x, y, cellCenterX) |
| `barBubble` | `{label, seconds}` \| null | 바 차트 말풍선 데이터 |
| `showSettings` | boolean | Settings 모달 표시 여부 |
| `timerAlert` | boolean | 타이머 알림 토글 (UI 전용, API 연동 없음 — 미구현) |
| `editingName` | boolean | 이름 편집 모드 |
| `nameInput` | string | 이름 편집 입력값 |
| `syncing` | boolean | 구독 동기화 중 여부 |

### 계산값

| 값 | 계산 방식 |
|---|---|
| `todaySeconds` | `weeklyStats.daily`에서 오늘 날짜 일치 항목의 `total_seconds` |
| `weekDailyData` | `week_start` 기준 7일 배열 (sparse fill) |
| `maxDailySeconds` | 주간 dailyData 중 최대값 (바 차트 높이 기준) |
| `barHeight` | `(secs / maxDailySeconds) * 80`, 최소 16px |
| `sessionDates` | 월별 `dailyStats` 중 `session_count > 0`인 날짜 Set |

---

## 에지 케이스

| 케이스 | 처리 방식 |
|---|---|
| 주간 데이터 없음 | `maxDailySeconds=1`로 나누기 0 방지. 바 높이 16px(빈 바) |
| `week_start` 없음 | `weekDailyData` 전체 0으로 fallback |
| 바 차트 날짜 없음 (`hasData=false`) | 터치 이벤트 비활성화 |
| 오늘 날짜 + 세션 있음 | 검정 채운 원 + 오렌지 테두리 (`calDotTodayRing`) |
| 오늘 날짜 + 세션 없음 | 검정 테두리 원 (`calDotToday`) |
| 캘린더 말풍선 위치 계산 | `cell.measure()` → 화면 절대 좌표 기반. 좌우 8px~300px 클램프 |
| 이름 저장 빈 값 | `trim()` 후 빈 문자열이면 API 호출 안 함 |
| 구독 동기화 쿨다운 | 30초 미만 재시도 → Alert '30초 후 다시 시도'. ref로 쿨다운 관리 (리렌더링 없음) |
| 로그아웃 | `tokenStore.clearTokens()` + `queryClient.clear()` + `router.replace('/login')` |
| `timerAlert` 토글 | UI 상태만 변경. 백엔드 API 연동 없음 (미구현) |
| 인증 미제공 (API) | `401 UNAUTHORIZED` |
| 데이터 없음 (API) | `200 []` (빈 배열) or `data.daily: []` |

---

## 알려진 부채

- **stats API timezone 미적용**: `daily_focus` 저장은 사용자 timezone 기준, stats API 조회는 UTC 기준 파라미터 수신. 사용자 로컬 시간 기준 조회 미구현.
