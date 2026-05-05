---
id: adr-07
type: adr
title: 정지 확인 UX — 인디케이터 + 모달 조합
status: accepted
created: 2026-05-04
updated: 2026-05-04
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
  - "[[planning-01-recording-pipeline]]"
depends_on:
  - "[[adr-04-recording-paradigm]]"
  - "[[adr-05-capture-schedule-function]]"
tags: [adr, stop, ux, recording, timelapse, mobile]
---

# 정지 확인 UX — 인디케이터 + 모달 조합

## Summary

**A+B 조합 채택 — 화면 실시간 인디케이터(현재 예상 결과 길이 표시) + 정지 버튼 탭 시 확인 모달.** 사용자가 정지 전에 결과를 인지하고, 실수로 정지하는 것도 방지.

---

## Context

`adr-04`(프레임 샘플링) + `adr-05`(sqrt 스케줄) 채택으로 정지 시점에 따라 결과 영상 길이가 달라짐:
- 4시간 설정, 30분에 정지 → sqrt(30/240) × 60초 ≈ **16.7초** 타임랩스
- 4시간 설정, 2시간에 정지 → sqrt(120/240) × 60초 ≈ **42.4초** 타임랩스

현재 `focus.tsx`:
- 정지 버튼 탭 → `handleStop()` 즉시 호출 (확인 없음)
- 화면에 결과 길이 예상치 표시 없음
- `showExitModal` 은 "세션 종료(데이터 삭제)" 용도로, "정지 후 타임랩스 생성"과 별개

사용자 위험:
1. 잘못 정지해서 짧은 타임랩스 생성 → 실망
2. 결과 길이를 모르고 정지 → 기대와 다른 출력

---

## Options

| 안 | 동작 | 장점 | 단점 |
|---|---|---|---|
| A | 화면 인디케이터만 (실시간 예상 결과 길이 표시) | 항상 인지 가능 | 잘못 누름 방지 안 됨 |
| B | 정지 모달만 (탭 시 "결과 약 Z초. 정지/계속") | 잘못 누름 방지 | 평소엔 결과 길이 인지 안 됨 |
| **A+B** | 인디케이터 상시 표시 + 정지 탭 시 모달 | 인지 + 방지 모두 보장 | 모달 1단계 추가 (UX 마찰 미미) |
| C | result 화면 사후 안내 | 구현 없음 | 정지 후에야 결과 알 수 있음 — 늦음 |

---

## Decision

**A+B 채택**

**A. 실시간 인디케이터**:
- `focus.tsx` 녹화 화면에 상시 표시
- 표시 내용: `"정지 시 결과 영상 약 {Z}초"` — Z = `schedule(elapsed) / outputFps`
- 계산: `adr-05` 의 `schedule(t) = floor(N_total × √(elapsed / goalSec)) / outputFps`
- 갱신 주기: 매초 (현재 timer interval과 동일)

**B. 정지 확인 모달**:
```
── 정지하시겠어요? ─────────────────
 목표 {goalMin}분 중 {elapsedMin}분 진행
 지금 정지하면 약 {Z}초 타임랩스가 생성됩니다.

[계속하기]  [정지하고 타임랩스 생성]
────────────────────────────────
```
- "계속하기" → 모달 닫기, 녹화 재개
- "정지하고 타임랩스 생성" → `handleStop()` → generating 화면으로

Why:
1. A 단독: sqrt 스케줄 특성상 초반 짧은 녹화 = 매우 짧은 타임랩스. 사용자가 의도치 않게 정지하면 기대와 다른 결과.
2. B 단독: 평소 결과 길이를 인지 못함 → 인디케이터와 시너지 없음
3. A+B: 인디케이터로 평상시 상태 인지 + 모달로 최종 확인. UX 마찰은 모달 1회 탭 추가뿐

**Z 계산 정의**:
```
elapsed_frames = floor(N_total × √(elapsed / goalSec))
Z = elapsed_frames / outputFps  (소수점 1자리, 예: 16.7초)
```

---

## Consequences

### 구현 영향

| 항목 | 변경 내용 |
|---|---|
| `focus.tsx` 녹화 화면 | 상시 인디케이터 텍스트 추가 (`"정지 시 약 Z초"`) |
| `focus.tsx` 정지 버튼 핸들러 | 즉시 `handleStop()` → 모달 표시 → 사용자 확인 후 `handleStop()` |
| `focus.tsx` 기존 `showExitModal` | 유지 ("세션 종료 / 데이터 삭제" 용도 별개) |
| Z 계산 헬퍼 | `calcPreviewDuration(elapsed, goalSec, N_total, outputFps)` 추가 |

### 후속 작업

- `spec-01-recording-state-machine`: 정지 플로우 상태 전이 명세에 모달 단계 포함
- 모달 카피 최종 확정 / 디자인 (spec-01 UX 섹션 또는 별도 design spec)
- 자동 정지(타이머 만료) 시에는 모달 없이 즉시 정지 (의도된 정지이므로)
- 백그라운드 진입 강제 정지(`adr-06`)도 모달 없이 즉시 정지
