---
id: spec-10
type: spec
title: 세션 도메인 — Session API·모바일 녹화 플로우
status: draft
created: 2026-05-18
updated: 2026-05-18
sources:
  - "[[planning-01-recording-pipeline]]"
  - "[[spec-03-subscription-state-machine]]"
depends_on:
  - "[[spec-01-recording-state-machine]]"
  - "[[spec-02-capture-pipeline]]"
  - "[[spec-03-subscription-state-machine]]"
  - "[[spec-08-mobile-revenuecat-integration]]"
tags: [spec, session, recording, timelapse, backend, mobile]
---

# 세션 도메인 — Session API·모바일 녹화 플로우

## Summary

홈에서 "Start Focus Session" 탭 후 타임랩스를 갤러리에 저장하기까지의 전체 세션 흐름을 정의한다. 모바일에서 session-setup → focus(네이티브 캡처) → generating(stitch) → result(오버레이 선택) → saving(갤러리 저장) 순으로 진행되며, 각 단계는 BE Session API와 연동된다.

---

## [API] Session Endpoints

### POST /api/sessions — 세션 시작

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |
| Response | 201 Created |

**Request body**

```json
{
  "start_time": "2026-05-18T09:00:00",
  "output_seconds": 15,
  "aspect_ratio": "9:16",
  "overlay_style": "stopwatch"
}
```

**Response 201**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "start_time": "datetime",
    "end_time": null,
    "duration": null,
    "output_seconds": 15,
    "aspect_ratio": "9:16",
    "overlay_style": "stopwatch",
    "status": "recording",
    "file_id": null,
    "task_id": null,
    "created_at": "datetime"
  }
}
```

**에러**

| 코드 | error_code | 사유 |
|---|---|---|
| 422 | — | `output_seconds` 허용 외 값 |
| 422 | — | `aspect_ratio` 허용 외 값 |
| 403 | `DAILY_QUOTA_EXCEEDED` | Free/Expired/Cancelled 사용자 1일 한도 초과 |
| 401 | `UNAUTHORIZED` | JWT 미제공 |

---

### PUT /api/sessions/{session_id} — 세션 종료·업데이트

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |

**Request body** (모두 optional)

```json
{
  "end_time": "datetime|null",
  "duration": "int|null",
  "status": "string|null",
  "file_id": "string|null",
  "task_id": "string|null"
}
```

**Response 200** — SessionResponse 동일 구조

**에러**

| 코드 | 사유 |
|---|---|
| 404 | 세션 미존재 또는 타인 세션 |
| 422 | `duration < 0` |

---

### GET /api/sessions — 내 세션 목록

| 항목 | 값 |
|---|---|
| 인증 | JWT 필수 |
| Query params | `limit` (최대 100, 기본 20), `offset` (기본 0) |

**Response 200**

```json
{
  "success": true,
  "data": [ /* SessionResponse 배열 */ ]
}
```

---

## [API] 데이터 모델

### FocusSession

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `start_time` | TIMESTAMP | timezone naive |
| `end_time` | TIMESTAMP null | |
| `duration` | INTEGER null | 초 단위 |
| `output_seconds` | INTEGER | 타임랩스 출력 길이 |
| `aspect_ratio` | VARCHAR | 허용값: `9:16 / 16:9 / 1:1 / 4:5 / 3:4` |
| `overlay_style` | VARCHAR | 기본값: `stopwatch` |
| `status` | VARCHAR | `recording / completed` |
| `file_id` | VARCHAR null | 갤러리 저장 후 식별자 |
| `task_id` | VARCHAR null | 비동기 처리 태스크 id |

### DailyFocus (집계)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `date` | DATE | 사용자 timezone 기준 로컬 날짜 |
| `total_seconds` | INTEGER | 누적 포커스 시간 |
| `session_count` | INTEGER | 완료 세션 수 |

---

## [API] 비즈니스 규칙

### 검증

- `output_seconds` 허용 집합: `{5, 10, 15, 30, 45, 60, 90, 120}`
- `aspect_ratio` 허용 집합: `{9:16, 16:9, 1:1, 4:5, 3:4}`

### 일일 한도 체크 (세션 시작 시)

- `subscription_status`가 `trial` 또는 `pro` → 무제한
- `free / expired / cancelled` → timezone 기준 오늘 `session_count >= 1`이면 `403 DAILY_QUOTA_EXCEEDED`
- 한도 체크는 세션 **시작** 시점 (`POST /sessions`)에 수행

### 세션 완료 처리 (`status=completed` + `duration` 존재)

1. `daily_focus` upsert: 사용자 timezone 기준 오늘 날짜 row에 `total_seconds`, `session_count` 갱신
2. `user.total_focus_time` 누적
3. streak 계산: 오늘부터 과거로 연속 `daily_focus` row 수를 세어 `user.streak` 갱신, `user.longest_streak` 업데이트

### 시간 처리

- 요청의 `start_time`, `end_time`에 tzinfo가 있으면 naive로 변환 (DB: TIMESTAMP WITHOUT TIME ZONE)
- `duration` 자동 계산: `end_time - start_time` (초). 단 `duration` 명시 시 우선 사용

---

## [모바일] 화면 목록

| 화면명 | 파일 경로 | 한 줄 설명 |
|---|---|---|
| 홈 | `app/index.tsx` | "Start Focus Session" 버튼으로 session-setup 진입 |
| 세션 설정 | `app/session-setup.tsx` | 집중 시간·타임랩스 길이·화면비·타이머 모드 설정 |
| 집중 녹화 | `app/focus.tsx` | VisionCamera 프레임 프로세서로 캡처, 타이머 표시 |
| 타임랩스 생성 | `app/generating.tsx` | 캡처 프레임으로 preview.mp4 스티치, 진행률 표시 |
| 결과 미리보기 | `app/result.tsx` | 미리보기 영상 재생 + 오버레이 스타일 선택 |
| 갤러리 저장 | `app/saving.tsx` | 오버레이 burn-in stitch → 갤러리 저장 → 세션 업데이트 |

---

## [모바일] 전환 흐름

```
/ (index.tsx)
  └─ "Start Focus Session" 탭 → /session-setup

/session-setup (session-setup.tsx)
  ├─ "Start Recording" 탭 → createSession() API 호출
  │    ├─ 성공 → /focus (params: sessionId, studyMinutes, outputSeconds, aspectRatio, timerMode)
  │    └─ 오류
  │         ├─ DAILY_QUOTA_EXCEEDED → 일일 한도 모달 (닫기 or /paywall)
  │         └─ 기타 → Alert
  └─ "←" 뒤로 → router.back()

/focus (focus.tsx)
  ├─ 카메라 권한 없음 → 권한 요청 화면 (같은 스크린 내 분기)
  ├─ 카메라 장치 없음 → 오류 화면 (같은 스크린 내 분기)
  ├─ 재생 버튼 탭 (미시작) → startCapture() + 타이머 시작
  ├─ 재생/일시정지 버튼 탭 (시작 후) → pauseCapture / resumeCapture
  ├─ 정지 버튼 탭 (elapsed >= 10s) → 정지 확인 모달
  │    ├─ "정지" 확정 → stopCapture() → /generating
  │    └─ "계속" → resumeCapture() + 타이머 재개
  ├─ 정지 버튼 탭 (elapsed < 10s) → Alert '최소 10초'
  ├─ "←" 탭 → 나가기 확인 모달
  │    ├─ "Leave" → stopCapture() → router.back()
  │    └─ "Keep Going" → 모달 닫기
  ├─ 타이머 완료 (elapsed >= goalSec) → 자동 stopCapture() → /generating
  └─ AppState background/inactive (녹화 중) → 자동 pauseCapture() + Alert

/generating (generating.tsx)
  ├─ subLoading=false 후 stitchTimelapse() 실행 (preview.mp4)
  │    ├─ showWatermark → overlayMeta.showAppMark=true (Free)
  │    ├─ 성공 → /result (params: previewPath + focus params 전달)
  │    └─ 오류 → Alert → router.back()
  └─ 웹 환경 → 바로 /result (previewPath='')

/result (result.tsx)
  ├─ 오버레이 스타일 선택 (none/timer-up/timer-down/progress/streak)
  │    └─ progress: showProgressBar=false → /paywall 이동
  ├─ "Save to Gallery" 탭 → /saving (params: overlayStyle + result params 전달)
  ├─ "Remove Watermark" 탭 (Free 사용자) → /paywall
  └─ "←" 탭 → /  (gestureEnabled=false)

/saving (saving.tsx)
  ├─ Step 0: MediaLibrary 권한 요청
  │    └─ 거부 → Alert → router.back()
  ├─ Step 1: stitchTimelapse() (오버레이 burn-in + 워터마크 burn-in)
  ├─ Step 2: MediaLibrary.saveToLibraryAsync() + updateSession() + 파일 cleanup
  ├─ Step 3: 완료 → setFinished=true
  │    ├─ "View Stats →" 탭 → /stats
  │    └─ Instagram 아이콘 탭 → Linking.openURL('instagram://')
  └─ 오류 발생 → Alert → router.back()
```

---

## [모바일] 주요 상태/데이터

| 상태 | 위치 | 설명 |
|---|---|---|
| `focusMinutes` (5~240) | session-setup local | 집중 시간 (슬라이더, 기본 120) |
| `outputSeconds` | session-setup local | 타임랩스 길이 초 (5~120s 옵션, 기본 30) |
| `aspectRatio` | session-setup local | 화면비 `'9:16'`/`'1:1'`/`'3:4'` (기본 `'9:16'`) |
| `timerMode` | session-setup local | `'countdown'`/`'countup'` (기본 countdown) |
| `isRecording`, `hasStarted` | focus local | 녹화 상태 트래킹 |
| `elapsed` | focus local | 경과 초 (1초 interval) |
| `cameraFacing` | focus local | `'front'`/`'back'` (기본 front, 시작 전에만 전환) |
| `zoom` | focus local | 핀치 제스처로 조절 |
| `elapsedSecSV`, `isPausedSV`, `captureDirSV` | focus worklet shared values | 프레임 프로세서(worklet thread)에 실시간 전달 |
| `showWatermark`, `showProgressBar` | `useSubscription()` | Free=워터마크, Pro/Trial=Progress Bar 허용 |
| `progress` (0~100) | generating local | stitch 진행률 (`onStitchProgress` 이벤트) |
| `overlayStyle` | result local | 선택된 오버레이 스타일 |
| `videoRatio` | result local | expo-video currentTime/duration 폴링 (50ms) → 오버레이 타이밍 동기화 |
| `steps`, `finished` | saving local | 단계별 상태 (`pending`/`active`/`done`) |

---

## 에지 케이스

| 케이스 | 처리 방식 |
|---|---|
| 일일 세션 한도 초과 | session-setup: DAILY_QUOTA_EXCEEDED 모달. resetsAt 시각 표시 + paywall 유도 |
| 집중 시간 > 2시간 + 5s/10s 선택 | 5s/10s 옵션 비활성화, 15s로 자동 변경 |
| 카메라 권한 미허용 | focus: 권한 요청 화면 (Grant Permission 버튼) |
| 녹화 10초 미만 정지 시도 | focus: Alert '최소 10초 이상 녹화' |
| 앱이 백그라운드/inactive 전환 | focus: 자동 pauseCapture() + Alert. 타이머 정지 |
| 화면 자동 잠금 | focus: `activateKeepAwakeAsync`로 idle timer 비활성화 (녹화 중만) |
| 구독 상태 로딩 중 (generating) | subLoading=true 동안 stitch 실행 보류 |
| captureDir 없음 (generating) | Error throw → Alert → router.back() |
| 갤러리 권한 미허용 (saving) | Alert → router.back() |
| saving 세션 업데이트 실패 | console.warn 후 무시 (저장 자체는 완료) |
| preview.mp4 cleanup | saving 완료 후 즉시 삭제. captureDir는 cleanupTtlSec 후 setTimeout 삭제 |
| Progress Bar 오버레이 (Free 사용자) | result: paywall로 이동 (선택 불가) |
| 웹 환경 (`Platform.OS==='web'`) | 슬라이더 → `<input type="range">` 폴백. 네이티브 모듈 스킵 |
| `output_seconds` 허용 집합 외 | 422 |
| Free 사용자 오늘 세션 이미 완료 | `403 DAILY_QUOTA_EXCEEDED` + `daily_quota_resets_at` |
| 세션 PUT 시 타인 소유 or 미존재 | `404 Session not found` |
