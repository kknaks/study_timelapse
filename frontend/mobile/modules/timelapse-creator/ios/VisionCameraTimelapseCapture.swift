import Foundation
import AVFoundation
import CoreImage
import UIKit

// MARK: - VisionCameraTimelapseCapture
//
// VisionCamera Frame Processor Plugin (adr-09: B-3 패턴).
// VisionCamera 가 카메라 단독 점유. 본 plugin 은 frame stream 에 얹혀 JPEG 저장.
//
// Plugin 통신 패턴 C (stateless per RN args):
//   RN 측 useFrameProcessor worklet 이 매 frame 에 아래 args 를 전달:
//     elapsedSec  — 녹화 경과 초 (RN 에서 useSharedValue 로 관리)
//     goalSec     — 목표 공부 시간(초)
//     outputSec   — 결과 영상 길이(초)
//     outputFps   — 출력 FPS (30 고정)
//     captureDir  — JPEG 저장 디렉토리 경로 (session별 고유)
//     isPaused    — 일시정지 여부 (Bool)
//   Plugin 은 capturedCount + captureDir 만 내부 상태로 유지.
//   captureDir 변경 감지 시 자동 리셋 → 신규 세션 시작.

@objc(VisionCameraTimelapseCapture)
public class VisionCameraTimelapseCapture: FrameProcessorPlugin {

  private var currentCaptureDirPath: String?
  private var captureDir: URL?
  private var capturedCount: Int = 0
  private var prevScheduledSec: Double = 0
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  // throttle: "frame received" 로그를 30프레임당 1회로 억제
  private var frameCallbackCount: Int = 0

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = nil) {
    super.init(proxy: proxy, options: options)
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    frameCallbackCount += 1
    if frameCallbackCount % 30 == 1 {
      NSLog("[Capture] frame received args=%@", arguments?.description ?? "nil")
    }

    guard let args = arguments,
          let elapsedSec     = args["elapsedSec"]   as? Double,
          let goalSec        = args["goalSec"]      as? Double,
          let outputSec      = args["outputSec"]    as? Double,
          let outputFps      = args["outputFps"]    as? Double,
          let captureDirPath = args["captureDir"]   as? String
    else {
      NSLog("[Capture] ERROR missing args")
      return nil
    }

    let isPaused = (args["isPaused"] as? Bool) ?? false
    if isPaused { return nil }

    // 세션 변경(captureDir 변경) → 내부 상태 리셋
    if captureDirPath != currentCaptureDirPath {
      currentCaptureDirPath = captureDirPath
      let dirURL = URL(fileURLWithPath: captureDirPath.replacingOccurrences(of: "file://", with: ""))
      try? FileManager.default.createDirectory(at: dirURL, withIntermediateDirectories: true)
      captureDir = dirURL
      capturedCount = 0
      prevScheduledSec = 0
      frameCallbackCount = 0
      NSLog("[Capture] init captureDir=%@", captureDirPath)
    }

    // Schedule 검사 (sqrt schedule)
    let scheduled = nextCaptureTime(
      currentCount: capturedCount,
      goalSec: goalSec,
      outputSec: outputSec,
      outputFps: outputFps
    )
    let scheduledEnforced = enforceFloor(naturalNextSec: scheduled, prevScheduledSec: prevScheduledSec)

    NSLog("[Capture] elapsed=%.2f scheduled=%.2f count=%d", elapsedSec, scheduledEnforced, capturedCount)

    guard elapsedSec >= scheduledEnforced else { return nil }

    // Frame → JPEG
    let sampleBuffer = frame.buffer
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      NSLog("[Capture] ERROR no pixel buffer")
      return nil
    }
    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else {
      NSLog("[Capture] ERROR createCGImage failed")
      return nil
    }
    let uiImage = UIImage(cgImage: cgImage)
    guard let data = uiImage.jpegData(compressionQuality: JPEG_QUALITY) else {
      NSLog("[Capture] ERROR jpegData nil")
      return nil
    }

    // 저장
    capturedCount += 1
    prevScheduledSec = scheduledEnforced
    let filename = frameFilename(index: capturedCount)
    guard let dir = captureDir else { return nil }
    let url = dir.appendingPathComponent(filename)
    do {
      try data.write(to: url)
      NSLog("[Capture] saved %@ count=%d", filename, capturedCount)
    } catch {
      capturedCount -= 1
      prevScheduledSec = 0
      NSLog("[Capture] ERROR write %@: %@", filename, error.localizedDescription)
      return nil
    }

    return ["count": capturedCount, "filename": filename] as [String: Any]
  }
}
