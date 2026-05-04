import Foundation
import AVFoundation
import CoreImage
import UIKit
import VisionCamera

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

    // Frame → JPEG (sensor orientation 적용해서 픽셀 회전)
    let sampleBuffer = frame.buffer
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      NSLog("[Capture] ERROR no pixel buffer")
      return nil
    }

    // 진단 로그: frame.orientation 값을 raw int 로 찍어서 어떤 회전이 들어오는지 확인
    // UIImageOrientation: 0=up, 1=down, 2=left, 3=right, 4=upMirrored, 5=downMirrored, 6=leftMirrored, 7=rightMirrored
    if capturedCount < 3 {
      NSLog("[Capture] frame.orientation rawValue=%d isMirrored=%@", frame.orientation.rawValue, frame.isMirrored ? "Y" : "N")
    }

    // CIImage 의 oriented(...) 로 픽셀 회전을 한 번만 적용.
    // ciImage.oriented 는 transform 을 metadata 가 아닌 픽셀 좌표계에 적용 → createCGImage 후 결과가 portrait.
    // 이전 패턴 (UIImage(cgImage:scale:orientation:) + draw) 은 frame 이 이미 정렬된 경우 이중 회전 위험.
    // EXIF 5 적용 후 horizontal flip 추가
    // CIImage.transformed 의 scaleX: -1 만 적용 (translation 불필요 — extent 자동 추적).
    let ciImageRaw = CIImage(cvPixelBuffer: pixelBuffer)
    let ciImage5 = ciImageRaw.oriented(forExifOrientation: 5)
    let ciImageOriented = ciImage5.transformed(by: CGAffineTransform(scaleX: -1, y: 1))
    guard let cgImage = ciContext.createCGImage(ciImageOriented, from: ciImageOriented.extent) else {
      NSLog("[Capture] ERROR createCGImage failed")
      return nil
    }

    let uiImage = UIImage(cgImage: cgImage)  // orientation = .up 이미 픽셀 회전됨
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

  // MARK: - Helpers

  /// frame.orientation + isMirrored 를 합쳐 정확한 UIImage.Orientation 으로 변환.
  /// VisionCamera v4 는 base orientation 과 mirror flag 를 분리 표시 → 우리가 합쳐야 함.
  private func combineOrientation(orientation: UIImage.Orientation, isMirrored: Bool) -> UIImage.Orientation {
    if !isMirrored { return orientation }
    switch orientation {
    case .up:    return .upMirrored
    case .down:  return .downMirrored
    case .left:  return .leftMirrored
    case .right: return .rightMirrored
    case .upMirrored, .downMirrored, .leftMirrored, .rightMirrored:
      return orientation  // 이미 mirrored
    @unknown default: return orientation
    }
  }

  /// UIImageOrientation → EXIF orientation int
  /// EXIF 표준: 1=up, 2=upMirrored, 3=down, 4=downMirrored, 5=leftMirrored, 6=right, 7=rightMirrored, 8=left
  private func cgImagePropertyOrientation(from uiOrientation: UIImage.Orientation) -> Int32 {
    switch uiOrientation {
    case .up:             return 1
    case .upMirrored:     return 2
    case .down:           return 3
    case .downMirrored:   return 4
    case .leftMirrored:   return 5
    case .right:          return 6
    case .rightMirrored:  return 7
    case .left:           return 8
    @unknown default:     return 1
    }
  }
}
