---
id: adr-02
type: adr
title: 세션 업데이트 단일화 — saving 에서만 completed 처리
status: accepted
created: 2026-05-03
updated: 2026-05-03
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
related_to:
  - "[[planning-01-recording-pipeline]]"
tags: [adr, session, mobile, generating, saving, phase0]
---

# 세션 업데이트 단일화 — saving 에서만 completed 처리

## Summary

`updateSession` 이 `generating.tsx` 와 `saving.tsx` 두 곳에서 중복 호출되는 문제를, **`saving.tsx` 에서만 호출**하도록 단일화한다. (D-PLAN-6, 2026-05-03 합의)

---

## Context

현재 `updateSession` (PATCH `/sessions/{id}`) 이 두 곳에서 호출된다:

| 위치 | 시점 | 페이로드 주요 필드 |
|------|------|--------------------|
| `frontend/mobile/app/generating.tsx:114` | 타임랩스 변환 완료 시 | recording_seconds, output_seconds, aspect_ratio, timer_mode, camera_facing 등 |
| `frontend/mobile/app/saving.tsx:172` | 갤러리 저장 완료 시 | status: "completed" |

동일 `sessionId` 에 두 번 PATCH 가 전송되면:
- 상태(status)가 덮어씌워질 수 있다.
- 불필요한 API 중복 호출이 발생한다.
- 변환은 성공했으나 저장이 실패한 경우에도 `completed` 로 기록될 위험이 있다.

---

## Options

| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| **A (채택)** | saving 에서만 (최종 완료 기준) | "세션 완료" = 갤러리 저장까지 포함. 저장 실패 케이스를 completed 로 오기록 방지. | generating 단계의 세션 메타(recording_seconds 등) 기록을 saving 페이로드에 통합 필요 |
| B | generating 에서만 (변환 완료 기준) | duration 정보가 변환 완료 즉시 기록됨 | 저장 실패해도 completed 처리 → 사용자 의도와 불일치 |
| C | 현행 유지 (두 번 PATCH) | 단계별 중간 기록 가능 | 불필요한 API 중복, 상태 덮어쓰기 위험, 저장 실패 시에도 completed 가능 |

---

## Decision

**A 채택: `saving.tsx` 에서만 `updateSession` 호출.**

### Why

- "세션 완료"의 의미는 갤러리 저장까지 포함한다. 변환(generating)만 끝나고 저장이 실패한 케이스를 `completed` 로 기록하면 사용자 의도와 어긋난다.
- generating 단계의 변환 성공 여부는 세션 status 가 아니라 별도 로깅(클라이언트 에러 리포팅)으로 처리한다.
- API 중복 호출 제거 → 불필요한 서버 부하 감소.

---

## Consequences

### 코드 변경 (Phase 0)

| 영역 | 변경 내용 |
|------|----------|
| frontend/mobile-fe | `generating.tsx` 에서 `updateSession` import + 호출 제거 |
| frontend/mobile-fe | `saving.tsx` 의 PATCH 페이로드에 generating 이 보내던 필드(`recording_seconds`, `output_seconds`, `aspect_ratio`, `timer_mode`, `camera_facing` 등) 통합 확인 및 보완 |
| backend/api | 변경 없음 (PATCH 엔드포인트 그대로) |
| frontend/shared-fe | 변경 없음 |
| frontend/web-fe | 변경 없음 |

### 4 코드 영역 영향

- **backend/api**: × — 영향 없음 (PATCH 엔드포인트 그대로)
- **frontend/mobile-fe**: ○ — `generating.tsx` updateSession 제거, `saving.tsx` 페이로드 통합
- **frontend/shared-fe**: × — 영향 없음
- **frontend/web-fe**: × — 영향 없음

### 엣지 케이스 / 미결 사항

- **변환 실패(generating crash) 케이스의 세션 status**: 본 ADR 범위 밖.
  Phase 1 의 `spec-01-recording-state-machine` 에서 `failed` / `cancelled` 상태 추가 검토.
- **generating → saving 이동 시 페이로드 데이터 전달**: generating 이 화면 Props/스토어로 saving 에 데이터를 넘겨야 하므로, 기존 네비게이션 파라미터 구조 확인 필요.

### 후속 태스크

- 코드 구현: `tasks/frontend/PLAN-002-T-004-mobile-session-update-dedup.md` 재발행 예정
