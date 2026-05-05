---
id: spec-02
type: spec
title: 캡처 파이프라인 — Native 모듈 인터페이스·캡처 타이머·Stitch 명세
status: accepted
created: 2026-05-04
updated: 2026-05-04
status_note: "2026-05-04 사용자 합의 — D-SPEC-2-1=B (stitch 시점 burn-in), D-SPEC-2-2=B (documentDirectory), D-SPEC-2-3=A (outputFps 30 고정). 2026-05-04 추가: adr-09 (VisionCamera frame processor plugin) 반영. DispatchSourceTimer + 자체 AVCaptureSession 폐기."
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
  - "[[planning-01-recording-pipeline]]"
depends_on:
  - "[[adr-04-recording-paradigm]]"
  - "[[adr-05-capture-schedule-function]]"
  - "[[adr-07-stop-confirmation-ux]]"
  - "[[adr-08-cache-lifecycle]]"
  - "[[adr-09-camera-integration]]"
related_to:
  - "[[spec-01-recording-state-machine]]"
tags: [spec, capture, pipeline, timelapse, native, swift, ios, mobile]
---

# 캡처 파이프라인 — Native 모듈 인터페이스·캡처 타이머·Stitch 명세

## Summary

기존 `buildTimelapse` + `applyOverlay` (연속 녹화 + scaleTimeRange) 폐기 후 프레임 샘플링 기반 신규 파이프라인 명세. N초마다 JPEG 1장 캡처 → AVAssetWriter stitch → 옵션 burn-in 으로 교체.

> **status: ✅ accepted** (2026-05-04 사용자 합의)
> - D-SPEC-2-1 = **B** (오버레이는 stitch 시점에 burn-in. captures/ 는 raw JPEG. preview.mp4 = 오버레이 없음. final.mp4 = burn-in)
> - D-SPEC-2-2 = **B** (`documentDirectory/sessions/{sessionId}/`. iOS 가 cache 임의 정리 시 4시간 캡처 소실 방지. 앱이 5분 TTL 로만 정리)
> - D-SPEC-2-3 = **A** (outputFps 30 고정. sqrt schedule 의 N_total 입력 변수 안정. 변동 시 함수 연동 복잡)
> - 추가: 앱 시작 시 documentDirectory 의 stale captures 자동 정리 루틴 (앱 강제 종료로 5분 cleanup 못 돈 케이스). policy-01 에서 명세.
> 추가 (2026-05-04, adr-09): 카메라 점유 = VisionCamera 단독. 우리 모듈은 frame processor plugin 으로 동작. DispatchSourceTimer 폐기, frame processor delegate 가 schedule 검사.

---

## 1. Native 모듈 함수 시그니처

### 기존 폐기 함수
```swift
// 폐기 (adr-04)
buildTimelapse(options: TimelapseOptions) -> String   // scaleTimeRange 방식
applyOverlay(options: OverlayOptions) -> String       // CALayer burn-in 방식
```

> **[adr-09 반영]** 카메라 device 자체는 VisionCamera 단독 점유. `startCapture` 는 captureDir 생성 + 누적 상태 초기화만, `stopCapture` 는 누적 count/dir 반환만 수행. VisionCamera 의 `isActive` prop 이 카메라 실제 시작/중단 트리거.

### 신규 함수 (TS wrapper + Swift 구현)

```ts
// ===== 1. 캡처 세션 =====

interface CaptureStartOptions {
  sessionId: string;       // 디렉토리 구분용
  goalSec: number;         // 목표 시간 (초)
  outputSec: number;       // 출력 타임랩스 길이 (초)
  outputFps: number;       // 출력 FPS — D-SPEC-2-3 결정 (기본 30)
  aspectRatio: string;     // '9:16' | '1:1' | '16:9' | '4:5' | '3:4'
  cameraFacing: 'front' | 'back';
  captureDir: string;      // 저장 디렉토리 — D-SPEC-2-2 결정
  jpegQuality: number;     // 0.0~1.0, 기본 0.85
}

interface CaptureResult {
  captureCount: number;    // 실제 저장된 프레임 수
  captureDir: string;      // 캡처 디렉토리 경로
  elapsedSec: number;      // 실제 경과 시간
}

// 캡처 시작 (focus.tsx startRecording 대체)
startCapture(opts: CaptureStartOptions): Promise<void>

// 일시정지 / 재개 (spec-01 paused 상태)
pauseCapture(): Promise<void>
resumeCapture(): Promise<void>

// 정지 (spec-01 generating 진입 트리거)
stopCapture(): Promise<CaptureResult>

// ===== 2. Stitch =====

interface StitchOptions {
  captureDir: string;       // 캡처 디렉토리 (frame_NNNNN.jpg 시퀀스)
  outputPath: string;       // 출력 MP4 경로
  outputSec: number;        // 목표 출력 길이
  outputFps: number;        // 출력 FPS
  aspectRatio: string;      // 해상도 결정용
  overlayStyle: 'none' | 'timer' | 'progress' | 'streak';
  overlayMeta: {
    recordingSec: number;
    goalSec: number;
    streak: number;
    timerMode: 'countdown' | 'countup';
    logoPath?: string;
    overlayLayoutJson?: string;
  };
  // D-SPEC-2-1: 'none' 이면 오버레이 없이 preview stitch, 기타면 burn-in
}

// 타임랩스 합성 (generating + saving 양쪽에서 호출)
stitchTimelapse(opts: StitchOptions): Promise<string>
```

### 이벤트

```ts
// 캡처 진행 (매 캡처 후 emit)
onCaptureProgress: {
  count: number;         // 현재 누적 캡처 수
  totalEstimate: number; // = outputSec × outputFps (목표 총 프레임)
  nextAtMs: number;      // 다음 캡처까지 남은 시간 (ms)
  previewSec: number;    // 현재 정지 시 예상 출력 길이 = count / outputFps
}

// Stitch 진행 (AVAssetWriter 진행률)
onStitchProgress: {
  progress: number;      // 0.0 ~ 1.0
}

// 에러 (비동기 실패, reject 외 추가 채널)
onCaptureError: {
  code: string;          // 'disk_full' | 'camera_unavailable' | 'permission_denied'
  message: string;
}
```

---

## 2. 캡처 타이머 메커니즘 (adr-05 + adr-09 연동)

> **[adr-09 반영, 2026-05-04]** `DispatchSourceTimer` 폐기. **frame processor delegate** 방식으로 전면 교체.

### 신규 메커니즘 — Frame Processor Delegate

VisionCamera 가 preview frame 을 실시간으로 흘려보내며 (예: 30fps), 우리 plugin 이 **매 frame 마다** 호출된다. 각 호출에서 `elapsedSec >= nextCaptureTime(...)` 조건을 검사하고:
- **통과**: frame → JPEG 저장 + 다음 schedule 갱신
- **미통과**: 즉시 drop (no-op)

Timer 자체 불필요. cancel/nil 트랩 위험 없음.

### sqrt 스케줄 순수 함수 (adr-05, 유지)

```swift
let N_total = Int(outputSec * Double(outputFps))  // 목표 총 캡처 수 (예: 1800)

// N번째 캡처가 발생해야 하는 시각 (초) — frame processor 안에서 호출
func nextCaptureTime(_ n: Int, _ goalSec: Double, _ outputSec: Double, _ outputFps: Double) -> Double {
  let N_total = outputSec * outputFps
  let ratio = Double(n) / N_total
  return goalSec * ratio * ratio  // t_N = goalSec × (N / N_total)²
}

func enforceFloor(_ interval: Double) -> Double { max(interval, 0.1) }

func frameFilename(_ n: Int) -> String { String(format: "frame_%06d.jpg", n) }
```

### Frame Processor Plugin (iOS Swift, 신규)

```swift
// VisionCameraTimelapseCapture.swift
public class VisionCameraTimelapseCapture: FrameProcessorPlugin {
  private var capturedCount = 0

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    guard let elapsedSec = arguments?["elapsedSec"] as? Double,
          let goalSec = arguments?["goalSec"] as? Double,
          let outputSec = arguments?["outputSec"] as? Double,
          let outputFps = arguments?["outputFps"] as? Double,
          let captureDirPath = arguments?["captureDir"] as? String
    else { return nil }

    let scheduled = nextCaptureTime(capturedCount, goalSec, outputSec, outputFps)
    guard elapsedSec >= scheduled else { return nil }  // drop

    // frame.imageBuffer → JPEG → captureDir/frame_NNNNNN.jpg
    let filename = frameFilename(capturedCount)
    // ... 저장 로직 ...
    capturedCount += 1
    return ["count": capturedCount, "savedFilename": filename]
  }
}
```

**일시정지/재개** (adr-09):
```swift
// frame processor 내부 플래그 토글 또는 VisionCamera isActive 토글
// pauseCapture: isActive = false → frame 흐름 자체 중단
// resumeCapture: isActive = true → frame 재개
// elapsed 계산 시 pause 구간 제외 (RN 측 pausedDuration 누적)
```

---

## 3. 정적 오버레이 그리기 (D-SPEC-2-1 연동)

### D-SPEC-2-1 결정에 따른 분기 (아래 §8 참조)

**권장: B — stitch 시점 burn-in**

```swift
// stitchTimelapse 내부: 각 프레임 write 시 오버레이 합성

func renderFrame(jpeg: UIImage, frameIndex: Int, totalFrames: Int,
                 overlayStyle: String, overlayMeta: OverlayMeta,
                 size: CGSize) -> CGImage? {
  if overlayStyle == "none" { return jpeg.cgImage }

  let renderer = UIGraphicsImageRenderer(size: size)
  let img = renderer.image { _ in
    jpeg.draw(in: CGRect(origin: .zero, size: size))
    drawOverlayAtFrame(
      index: frameIndex, total: totalFrames,
      style: overlayStyle, meta: overlayMeta,
      size: size
    )
  }
  return img.cgImage
}
```

기존 `buildCAOverlay` (CAKeyframeAnimation 방식) **폐기** — 이미지 시퀀스 → AVAssetWriter 방식으로 대체. 각 프레임에 직접 UIGraphicsImageRenderer로 그림.

**오버레이 위치/크기**: 기존 `OverlayLayoutPx` 구조 재사용 가능. `overlayLayoutJson` 파싱 로직 유지.

---

## 4. AVAssetWriter Stitch

### 입력 → 출력

```
captureDir/frame_00001.jpg ... frame_01800.jpg
→ AVAssetWriter
→ outputPath (MP4, H.264)
```

### 해상도 매핑 (planning §2-2 그대로 유지)

```swift
let SIZE_MAP: [String: CGSize] = [
  "9:16":  CGSize(width: 720,  height: 1280),
  "1:1":   CGSize(width: 720,  height: 720),
  "16:9":  CGSize(width: 1280, height: 720),
  "4:5":   CGSize(width: 720,  height: 900),
  "3:4":   CGSize(width: 810,  height: 1080),
]
```

### Stitch 구현 윤곽

```swift
func stitchTimelapse(opts: StitchOptions) async throws -> String {
  let outputURL = URL(fileURLWithPath: opts.outputPath)
  let writer = try AVAssetWriter(url: outputURL, fileType: .mp4)

  let fps = CMTimeMake(value: 1, timescale: Int32(opts.outputFps))
  let videoInput = AVAssetWriterInput(mediaType: .video,
    outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: Int(size.width),
      AVVideoHeightKey: Int(size.height),
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 3_500_000,  // 3.5 Mbps (기존 유지)
      ]
    ])
  videoInput.expectsMediaDataInRealTime = false

  let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: videoInput,
    sourcePixelBufferAttributes: nil)

  writer.add(videoInput)
  writer.startWriting()
  writer.startSession(atSourceTime: .zero)

  let frames = sortedJPEGPaths(in: opts.captureDir)  // frame_NNNNN.jpg 정렬
  let totalFrames = frames.count
  // 실제 캡처 수가 N_total보다 적으면 (조기 정지) → 그 수만큼만 출력
  let frameDuration = CMTimeMake(value: 1, timescale: Int32(opts.outputFps))

  for (i, path) in frames.enumerated() {
    let jpeg = UIImage(contentsOfFile: path)!
    let cgImage = renderFrame(jpeg: jpeg, frameIndex: i, totalFrames: totalFrames,
                              overlayStyle: opts.overlayStyle, overlayMeta: opts.overlayMeta,
                              size: size)!
    let buffer = pixelBuffer(from: cgImage, size: size)!
    let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(i))
    // await videoInput.append...
    adaptor.append(buffer, withPresentationTime: presentationTime)
    sendEvent("onStitchProgress", ["progress": Double(i) / Double(totalFrames)])
  }

  videoInput.markAsFinished()
  await writer.finishWriting()
  return outputURL.absoluteString
}
```

**음성 트랙**: 없음 (adr-04 D-PLAN-7). `AVAssetWriterInput` 오디오 입력 추가하지 않음.

---

## 5. 진행률 이벤트

### 캡처 중 (`focus.tsx` 진행 표시)

`onCaptureProgress` 수신 시:
```ts
// focus.tsx (또는 네이티브 모듈 wrapper)
const subscription = addCaptureProgressListener((event) => {
  setCaptureCount(event.count);
  setPreviewSec(event.previewSec);  // adr-07 인디케이터용 Z값
  setNextCaptureMs(event.nextAtMs);
});
```

### Stitch 중 (`generating.tsx` / `saving.tsx` 진행 표시)

```ts
const subscription = addStitchProgressListener((event) => {
  setProgress(Math.round(event.progress * 100));
});
```

기존 `addProgressListener` 인터페이스를 `addStitchProgressListener` 로 rename 또는 통합.

---

## 6. 디렉토리 구조 (adr-08 연동)

```
{baseDir}/                        ← D-SPEC-2-2 결정 (cacheDir vs docDir)
  sessions/
    {sessionId}/
      captures/
        frame_00001.jpg           ← 1번 캡처 (t_1)
        frame_00002.jpg
        ...
        frame_01800.jpg           ← 1800번 캡처 (4시간 기준)
      preview.mp4                 ← generating 단계 stitch (D-SPEC-1-1 A안 시)
      stitched.mp4                ← saving 단계 최종 stitch
      meta.json (선택)            ← {goalSec, outputSec, captureCount, elapsedSec}
```

**cleanup 책임**:
- `captures/` + `preview.mp4`: saving 완료 후 **5분 TTL** → `saving.tsx`에서 `setTimeout(cleanupSession, 5 * 60 * 1000)` (adr-08)
- `stitched.mp4`: saving 완료 즉시 삭제 (`saving.tsx`) (adr-08)
- 취소(user_exit_confirm): 즉시 전체 삭제 (`focus.tsx confirmExit`)

---

## 7. Pro 가드 TODO 주석 위치 (plan-01 §4-2)

```ts
// result.tsx — Progress bar 옵션 선택 시
// TODO(monetization): if (!user.is_pro) → paywall redirect; 현재 Pro-default 통과.

// result.tsx — 워터마크 토글 시
// TODO(monetization): if (!user.is_pro) → 토글 비활성, 워터마크 강제 표시.

// saving.tsx — 저장 시작 직전
// TODO(monetization): if (!user.is_pro && dailyQuotaUsed >= 1) → 일일 한도 안내.
```

---

## 8. 에러 처리

> **[adr-09 반영]** "캡처 timer 실패" 항목 → "frame processor 호출 누락" 으로 대체.

| 에러 케이스 | 발생 위치 | 동작 | spec-01 상태 전이 |
|---|---|---|---|
| 캡처 중 디스크 부족 | frame processor callback | 현재까지 캡처 보존 + `onCaptureError(disk_full)` emit | recording → generating (부분 캡처) |
| frame processor 호출 누락 (frame stream 끊김) | VisionCamera frame callback | `onCaptureError(camera_unavailable)` + stopCapture (드물지만 frame stream 중단 가능) | recording → cancelled |
| stitch 중 OOM | `stitchTimelapse()` | throws error | generating → failed |
| stitch 중 디스크 부족 | `stitchTimelapse()` | throws error, captures/ 유지 (5분 TTL) | generating → failed |
| 0장 캡처 상태에서 stitch 시도 | `stitchTimelapse()` | throws `empty_capture_dir` | generating → failed |
| 진행률 timeout | generating/saving 화면 | N초 이상 progress 없으면 "응답 없음" 안내 | — (사용자 판단) |

**최소 캡처 수 보장**:
```swift
// stopCapture() 내
if capturedCount == 0 {
  throw NSError(domain: "CaptureModule", code: -10,
    userInfo: [NSLocalizedDescriptionKey: "No frames captured. Minimum recording time is 10 seconds."])
}
```

---

## 9. 결정 필요 항목

### D-SPEC-2-1: burn-in 시점 (사용자 승인 필요)

**슬로건: B안 권장 — stitch 시점 burn-in으로 오버레이 옵션 자유도 보장**

| 안 | burn-in 시점 | 오버레이 변경 자유도 | stitch 비용 | 비고 |
|---|---|---|---|---|
| A | 캡처 시점 (JPEG에 미리 그림) | ❌ 변경 불가 (raw 없음) | stitch 빠름 | 옵션 사전 결정 필요 |
| **B (권장)** | **stitch 시점 (raw JPEG → stitch 시 renderFrame 호출)** | ✅ 자유 변경 | stitch 시 프레임마다 렌더 (수십초) | raw JPEG 보존 |

**권장: B**

Why: 오버레이 옵션(none/timer/progress/streak)은 result 화면에서 사용자가 결정. A안은 캡처 시작 전에 오버레이를 정해야 하므로 UX 순서가 뒤바뀜. raw JPEG 보존 비용은 이미 adr-08에서 5분 TTL로 관리.

**승인 질문**: B(stitch-time burn-in) 채택 확인.

---

### D-SPEC-2-2: 캡처 디렉토리 위치 (사용자 승인 필요)

**슬로건: B(documentDirectory) 권장 — 시스템 임의 정리로 adr-08 5분 TTL 침해 방지**

| 안 | 위치 | 시스템 임의 정리 | 5분 TTL 보장 | 사용자 접근 |
|---|---|---|---|---|
| A | `FileSystem.cacheDirectory` | ✅ 시스템이 임의 삭제 가능 | ❌ 침해 위험 | 불가 |
| **B (권장)** | **`FileSystem.documentDirectory`** | ❌ 앱이 명시적 삭제 | ✅ 앱 제어 하에 보장 | 파일 앱에서 보임 (ITunes 공유 시) |

**권장: B**

Why: cacheDirectory는 iOS가 디스크 부족 시 임의 정리 가능. 4시간 세션의 ~1.8GB captures가 갑자기 사라지면 stitch 불가 (adr-08 정책 위반). documentDirectory는 앱이 5분 TTL에 따라 직접 삭제 → 정책 보장.

`sessions/` 서브디렉토리를 분리하여 사용자가 파일 앱에서 실수로 건드리는 것 최소화.

**승인 질문**: B(documentDirectory) 채택 확인.

---

### D-SPEC-2-3: outputFps 정책 (사용자 승인 필요)

**슬로건: 30 고정 권장 — 단순성 + 현행 유지**

| 안 | FPS | N_total (4h/60s) | 장점 | 단점 |
|---|---|---|---|---|
| **A (권장)** | **30 고정** | **1800장** | 단순, 현행 유지 | 낮은 압축비에서 과도한 프레임 |
| B | 압축비 자동 (24/30) | 1440~1800 | 긴 녹화 시 파일↓ | N_total 변동 → schedule 재계산 복잡 |
| C | 사용자 설정 | 가변 | 최대 자유도 | UI 복잡, 검증 부담 |

**권장: A (30 고정)**

Why: 프레임 샘플링에서 outputFps가 N_total(총 캡처 수)을 결정. FPS 변동이 schedule 함수와 연동되어 복잡도 증가. 현행 `generating.tsx`의 `optimalFPS` 로직은 scaleTimeRange export 시간 단축용이었으나 프레임 샘플링에서 export 시간은 이미 짧으므로 불필요.

**승인 질문**: A(30fps 고정) 채택 확인. 또는 B(압축비 자동) 선호 시 inputFPS 임계값 지정.

---

## 10. Camera 점유 정책 (adr-09 인용)

> **[신규 섹션, 2026-05-04, adr-09 반영]**

| 항목 | 정책 |
|---|---|
| 카메라 device 점유 | **VisionCamera 단독** |
| 우리 native 모듈 역할 | VisionCamera frame processor plugin 으로만 동작. 자체 `AVCaptureSession` 생성 금지. |
| 카메라 시작 트리거 | VisionCamera `<Camera isActive={true} />` |
| 카메라 중단 트리거 | VisionCamera `<Camera isActive={false} />` |
| pause/resume | frame processor 내부 플래그 토글 또는 VisionCamera `isActive` 토글 |
| 백그라운드 처리 | adr-06 의 VisionCamera + AppState listener 조합 그대로 유지 |

**근거**: adr-09 — 자체 `AVCaptureSession` 이 VisionCamera 와 같은 device 를 잡으려 하면 iOS 레벨에서 device contention 발생 (preview 멈춤 + 캡처 실패). VisionCamera 단독 점유 후 frame stream 에 얹는 방식으로 원천 회피.
