---
id: adr-09
type: adr
title: 카메라 점유 통합 — VisionCamera frame processor plugin
status: accepted
created: 2026-05-04
updated: 2026-05-04
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
  - "[[planning-01-recording-pipeline]]"
related_to:
  - "[[adr-04-recording-paradigm]]"
  - "[[spec-02-capture-pipeline]]"
tags: [adr, camera, vision-camera, mobile, ios, integration]
---

# 카메라 점유 통합 — VisionCamera frame processor plugin

## Summary

`adr-04` 의 "시간 단위 캡처 (프레임 샘플링)" 결정은 유지하되, "1장을 **어떻게** 얻을지" 의 캡처 방법을 결정한다. T-010 워커의 자체 `AVCapturePhotoOutput` 구현이 셔터음 강제·VisionCamera 점유 충돌·timer crash 를 유발한 것을 근거로, VisionCamera frame processor plugin (B-3) 을 채택한다.

> **status: ✅ accepted** (2026-05-04 사용자 합의)

---

## Context

`adr-04` 에서 "시간 단위 캡처 (프레임 샘플링, 8초마다 1장)" 를 결정했으나, **"1장을 어떻게 얻을지"** 의 캡처 방법은 명시하지 않았다.

T-010 워커가 임의로 `AVCapturePhotoOutput` (사진 셔터 방식) 를 선택했고, 실기기 검증 결과 3가지 치명적 문제가 확인되었다:

| 문제 | 원인 | 영향 |
|---|---|---|
| 셔터음 강제 재생 | iOS 정책 — `AVCapturePhotoOutput` 은 항상 셔터음 발생 | 8초 × 4시간 = 1,800 회 셔터음 |
| VisionCamera preview 멈춤 | VisionCamera 가 preview 위해 카메라 점유 중, 우리 모듈이 별도 `AVCaptureSession` 으로 같은 device 접근 시도 → device 충돌 | "Preview Layer stopped previewing" 로그, 캡처 실패 |
| EXC_BREAKPOINT crash | `DispatchSourceTimer` 의 resume 누락 → cancel + nil deinit 시 trap 발생 (line 219) | 앱 강제 종료 |

### 두 결정 축 분리

이번 결정은 `adr-04` 와 **별개의 축**이다:

| 축 | 결정 | ADR |
|---|---|---|
| 캡처 단위 (얼마나 자주) | 시간 단위 = 프레임 샘플링 (8초마다 1장) | adr-04 ✅ (변경 없음) |
| **캡처 방법 (어떻게 1장을 얻나)** | **VisionCamera frame processor plugin** | **본 adr-09** |

---

## Options

| 안 | 동작 | 셔터음 | VisionCamera 충돌 | 평가 |
|---|---|---|---|---|
| B-1 | `AVCapturePhotoOutput` (T-010 의 잘못된 선택) | 🔊 강제 | ❌ 카메라 점유 충돌 | **탈락** — 셔터음 + 충돌 |
| B-2 | 우리 native 가 자체 `AVCaptureVideoDataOutput` + delegate | ❌ 무음 | ❌ VisionCamera 와 device 점유 충돌 (preview 깨짐) | **탈락** — 점유 충돌 잔존 |
| **B-3 (채택)** | **VisionCamera frame processor plugin** — VisionCamera 가 카메라 점유, 우리 plugin 이 frame 마다 호출됨. schedule 시점에 frame → JPEG 저장 | ❌ 무음 | ✅ 카메라 1개 (VisionCamera 단독 점유), preview 유지 | **권장** |

---

## Decision

**B-3 — VisionCamera frame processor plugin**

### Why

VisionCamera 와 카메라 점유 충돌을 *원천 회피* — 카메라는 VisionCamera 만 잡고, 우리 plugin 은 그 frame stream 에 *얹어서* 동작한다. 셔터음 없음, preview 유지, capture pipeline 단순화.

### 대안 폐기 사유

- **B-1**: 셔터음은 iOS 시스템 정책 차원이므로 우회 불가.
- **B-2**: 카메라 point-of-truth 를 두 곳으로 분리하면 device contention 이 항상 발생한다. iOS 가 어느 쪽 AVCaptureSession 을 끊을지 보장되지 않음.

---

## Consequences

### 코드 변경 범위 (T-010-fix2 에서 수행)

**삭제** (T-010 워커가 만든 부분):
- 자체 `AVCaptureSession` + `AVCapturePhotoOutput` 코드
- `DispatchSourceTimer` 기반 timer 패턴
- `AVCapturePhotoCaptureDelegate` / 관련 메서드

**신규** (frame processor plugin 패턴):

```swift
// VisionCameraTimelapsePlugin.swift (신규)
import VisionCamera

@objc(VisionCameraTimelapseCapture)
public class VisionCameraTimelapseCapture: FrameProcessorPlugin {
  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    guard let elapsedSec = arguments?["elapsedSec"] as? Double,
          let goalSec = arguments?["goalSec"] as? Double,
          let outputSec = arguments?["outputSec"] as? Double,
          let outputFps = arguments?["outputFps"] as? Double,
          let captureDirPath = arguments?["captureDir"] as? String
    else { return nil }

    // schedule 시점 도달 검사 (adr-05 sqrt 수식 nextCaptureTime 사용)
    guard elapsedSec >= nextCaptureTime(currentCount, goalSec, outputSec, outputFps) else { return nil }

    // frame.imageBuffer → CIImage → CGImage → JPEG
    // captureDir 에 frame_NNNNNN.jpg 저장
    return ["count": currentCount, "savedFilename": filename]
  }
}
```

```ts
// focus.tsx
const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  const result = TimelapseCapture(frame, {
    elapsedSec: elapsed,
    goalSec,
    outputSec,
    outputFps: 30,
    captureDir,
  });
  if (result?.count) {
    runOnJS(updateProgress)(result.count);
  }
}, [goalSec, outputSec, captureDir]);

<Camera frameProcessor={frameProcessor} isActive={isRecording} ... />
```

### Native 모듈 역할 재정의

| 항목 | 변경 전 (T-010) | 변경 후 (B-3) |
|---|---|---|
| 카메라 점유 | 우리 모듈 `AVCaptureSession` | **VisionCamera 단독** |
| 캡처 트리거 | `DispatchSourceTimer` 발화 | **VisionCamera frame callback 마다** schedule 검사 |
| `startCapture` | AVCaptureSession 시작 | captureDir 생성 + 누적 상태 초기화만 |
| `stopCapture` | AVCaptureSession 중단 + 반환 | 누적 count/dir 반환만 (VisionCamera `isActive=false` 가 진짜 트리거) |
| pause/resume | timer suspend/resume | frame processor 내부 플래그 토글 또는 VisionCamera `isActive` 토글 |

### 영향 범위

- **backend/api**: × 영향 없음
- **frontend/web-fe**: × 영향 없음
- **frontend/mobile-fe**: ○ — `focus.tsx` 에 `frameProcessor` prop 추가, `useFrameProcessor` 훅 작성. VisionCamera Plugin 등록 (Swift 측)
- **frontend/shared-fe**: × 영향 없음

### 코드 규모 변화

- T-010 native 모듈 코드 ~50% 폐기 후 신규 (DispatchSourceTimer / AVCaptureSession / photoOutput 삭제)
- `nextCaptureTime` / `enforceFloor` / `frameFilename` (adr-05 순수 함수) 는 유지 — frame processor 안에서 호출
- VisionCamera 가 frame stream 을 잡으므로 우리 모듈은 ~150~250줄 수준으로 경량화

### 후속 작업 (코드)

- T-013: native `VisionCameraTimelapseCapture` plugin 구현 (`AVCapturePhotoOutput` / `DispatchSourceTimer` 삭제 + frame processor plugin 신규)
- T-014: `focus.tsx` frame processor 통합 (`useFrameProcessor` 훅 + `<Camera frameProcessor>` prop)

### 알려진 한계

- VisionCamera frame processor plugin 의 정확한 expo-modules-core 통합 패턴 (Plugin 등록 방식) 은 T-013 코드 단계에서 검증 필요. 현 시점에서 완전한 구현 확신 X.
