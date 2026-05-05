---
id: adr-01
type: adr
title: 비율(aspect ratio) 불일치 해소 — 4:5 통일 (백엔드 수정)
status: accepted
created: 2026-05-03
updated: 2026-05-03
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
related_to:
  - "[[planning-01-recording-pipeline]]"
tags: [adr, recording, aspect-ratio, backend, mobile, phase0]
---

# 비율(aspect ratio) 불일치 해소 — 4:5 통일 (백엔드 수정)

## Summary

모바일 프론트가 허용하는 `4:5` 비율이 백엔드 `VALID_ASPECT_RATIOS` 에 없어 `createSession` 400 오류가 발생하던 문제를, **백엔드에서 `4:5` 를 추가하고 `4:3` 을 제거**하는 방향으로 해소한다. (D-PLAN-2, 2026-05-03 합의)

---

## Context

모바일 앱(React Native)은 비율 옵션으로 `9:16 / 1:1 / 16:9 / 4:5 / 3:4` 를 제공한다.
백엔드(FastAPI) 세션 API의 `VALID_ASPECT_RATIOS` 는 `9:16 / 16:9 / 1:1 / 4:3 / 3:4` 로 정의되어 있어 **`4:5` 를 허용하지 않는다.**

결과: 사용자가 `4:5` 비율로 `createSession` 호출 시 → 백엔드 400 응답 → 세션 메타 기록 실패.
(타임랩스 영상 자체는 로컬에서 생성되지만 서버 세션 기록이 누락된다.)

인스타그램 세로 포맷(`4:5`)이 앱의 핵심 SNS 공유 시나리오(S1)이므로, 이 불일치는 즉시 해소해야 한다.

---

## Options

| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| **A (채택)** | 4:5 통일 — 백엔드 `VALID_ASPECT_RATIOS` 에 `4:5` 추가, `4:3` 제거 | SNS 세로 포맷 최적. 모바일 UI 변경 0. 백엔드 수정 1줄. | 기존 `4:3` 세션 row 존재 시 별도 데이터 마이그레이션 고려 필요 |
| B | 4:3 통일 — 모바일 `4:5` → `4:3` 변경 | 전통 사진 비율 호환 | 인스타그램 세로 포맷 제거. 모바일 UI + 해상도 정의 변경 비용 발생 |
| C | 둘 다 지원 (4:3 + 4:5 동시 허용) | 선택지 최대 | 비율 6종 → UI 복잡, 해상도 정의(`810×1080` vs `720×900`) 추가 |

---

## Decision

**A 채택: 4:5 로 통일, 백엔드 `VALID_ASPECT_RATIOS` 수정.**

### Why

- 인스타그램 세로 포맷(`4:5`)이 핵심 공유 시나리오(S1)의 표준 비율이다.
- 백엔드 상수 집합 수정 1줄로 해결 → 모바일 UI·해상도 정의 변경 비용 0.
- `4:3` 은 전통 사진 비율이나 SNS 모바일 콘텐츠 맥락과 맞지 않는다.
- `aspect_ratio` 컬럼이 `String` 타입이므로 alembic migration 불필요.

---

## Consequences

### 코드 변경 (Phase 0)

| 영역 | 변경 내용 |
|------|----------|
| backend/api | `backend/app/api/v1/sessions.py` 의 `VALID_ASPECT_RATIOS` 집합에서 `"4:3"` 제거 → `"4:5"` 추가. HTTPException detail 메시지도 함께 갱신. |
| frontend/mobile-fe | 변경 없음 (`4:5` 이미 지원) |
| frontend/shared-fe | 변경 없음 |
| frontend/web-fe | 변경 없음 |

### 4 코드 영역 영향

- **backend/api**: ○ — `VALID_ASPECT_RATIOS` 상수 수정, 오류 메시지 갱신
- **frontend/mobile-fe**: × — 영향 없음
- **frontend/shared-fe**: × — 영향 없음
- **frontend/web-fe**: × — 영향 없음

### 테스트

- 신규 pytest 케이스: `4:5` → 200 OK / `4:3` → 400 Bad Request
- 위치: `backend/tests/` 의 sessions 관련 파일

### 운영 데이터

- 기존 dev 데이터에 `4:3` row 존재 시 별도 마이그레이션 task 필요 (현재 dev 환경 데이터는 무시).
- 운영 배포 전 확인 필요.

### 후속 태스크

- 코드 구현: `tasks/backend/PLAN-002-T-003-aspect-ratio-fix.md` 재발행 예정
  (이전 발행본은 lineage 룰 검토로 `.processed` 처리 완료)
