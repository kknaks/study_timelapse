---
id: adr-04
type: adr
title: 녹화 패러다임 — 연속 녹화 vs 프레임 샘플링 + 음성 포함 여부
status: accepted
created: 2026-05-04
updated: 2026-05-04
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
  - "[[planning-01-recording-pipeline]]"
related_to:
  - "[[adr-05-capture-schedule-function]]"
  - "[[adr-06-background-recording-policy]]"
tags: [adr, recording, paradigm, timelapse, mobile, swift]
---

# 녹화 패러다임 — 연속 녹화 vs 프레임 샘플링 + 음성 포함 여부

## Summary

**프레임 샘플링(음성 제외) + Native 모듈 재작성 채택.** 음성을 포기함으로써 디스크 1/4, 변환 시간 1/10, 발열·배터리 대폭 개선 + WYSIWYG 자동 보장.

---

## Context

현행 구현:
- `focus.tsx:141` — VisionCamera `startRecording()`, H.264 30fps 연속 녹화, `audio=true`
- `TimelapseCreatorModule.swift:543-546` — `compTrack.scaleTimeRange(…, toDuration:outputDuration)` 배속 변환
- `TimelapseCreatorModule.swift:104` — `applyOverlay()` — CALayer burn-in 오버레이 합성
- `result.tsx` — RN `<View>/<Text>` 오버레이 시뮬레이션(preview) ≠ Swift 실제 합성본 → WYSIWYG 불일치

문제:
- 4시간 녹화 기준 원본 파일 크기 4~8GB, 변환 시간 4~12분(추정), 변환 중 발열·배터리 부담
- `applyOverlay` CALayer 렌더링과 RN preview 렌더링 차이(Phase 2 WYSIWYG 버그 근원)
- PLAN-001에서 발생한 fontSize 오차가 이중 렌더 경로에서 유래

D-PLAN-7(음성 포함 여부), D-PLAN-8(패러다임), D-PLAN-9(native 모듈 형태) 세 결정이 직렬 의존하므로 하나의 ADR에 통합.

---

## Options

| 안 | 음성 | 녹화 방식 | 변환 방식 | 원본 크기(4h) | 변환 시간(4h) | WYSIWYG | 코드 변경 |
|---|---|---|---|---|---|---|---|
| **A** | 포함 | 연속 30fps | scaleTimeRange (현행) | 4~8GB | 4~12분 | 이중 경로 유지 | 없음 |
| **B** | 미포함 | N초마다 1캡처 | AVAssetWriter stitch | ~1.8GB | 수십초 | 자동 보장 | buildTimelapse+applyOverlay 폐기 → 재작성 |
| **C** | 미포함 | N초마다 1캡처 | ffmpeg-kit-react-native | ~1.8GB | 수십초 | 자동 보장 | 외부 패키지 의존 추가 |

---

## Decision

**B 채택 — 음성 미포함 + 프레임 샘플링 + Native 모듈 재작성**

Why:
1. 음성 제거로 모든 비기능 지표가 A 대비 대폭 개선 (디스크 약 1/4, 변환 수십초, 발열·배터리 ↓)
2. 캡처 시점에 정적 오버레이를 JPEG에 burn-in 가능 → RN preview와 저장본 일치 → Phase 2 WYSIWYG 문제 근원 해소
3. C(ffmpeg-kit)는 외부 패키지 의존 + 기존 AVFoundation HW 가속 포기 → B보다 불리
4. `planning-01 §2-1` "음성 포함 현행 유지" 기존 합의를 **본 ADR로 갱신**. 타임랩스 콘텐츠는 SNS 공유용 무음 영상이 표준이므로 사용자 가치 손실 미미.

---

## Consequences

### 구현 영향

| 항목 | 변경 내용 |
|---|---|
| `TimelapseCreatorModule.swift` `buildTimelapse`(~200줄) | **폐기** |
| `TimelapseCreatorModule.swift` `applyOverlay`(~300줄) | **폐기** |
| 신규 Swift | 캡처 타이머 + JPEG write + 정적 오버레이 burn-in + AVAssetWriter stitch (추정 300~400줄) |
| `focus.tsx` | `audio={false}`, 마이크 권한 요청 제거 |
| `Info.plist` | `NSMicrophoneUsageDescription` 제거 (시나리오 E4 자동 해소) |
| `planning-01 §2-1` | 음성 정책 → "미포함(음소거 타임랩스)" 으로 갱신 필요 |

### 후속 작업

- `spec-02-capture-pipeline`: 캡처 타이머·JPEG write·stitch 상세 명세 (본 ADR 입력)
- `adr-05-capture-schedule-function`: 캡처 인터벌 스케줄 함수 결정
- Android Phase 4 이식 시 MediaCodec stitch 구현 단순화 (scaleTimeRange 의존 없어짐)
