import ExpoModulesCore
import AVFoundation
import CoreGraphics
import UIKit
import VisionCamera

// MARK: - Constants (internal: shared with VisionCameraTimelapseCapture)

let JPEG_QUALITY: CGFloat = 0.8
let MIN_INTERVAL_SEC: Double = 0.1

// MARK: - Exported helpers (sqrt schedule — admin review 끝남, 수정 X)

/// sqrt schedule 역함수: 누적 N장 캡처 후 다음 캡처 시각(초)
/// t = goalSec × (nextN / totalFrames)²
func nextCaptureTime(currentCount: Int, goalSec: Double, outputSec: Double, outputFps: Double) -> Double {
  let totalFrames = outputSec * outputFps
  let nextN = Double(currentCount + 1)
  return goalSec * pow(nextN / totalFrames, 2.0)
}

/// 인터벌 floor 적용: 이전 스케줄 시각 기준으로 MIN_INTERVAL_SEC 보장
func enforceFloor(naturalNextSec: Double, prevScheduledSec: Double, minIntervalSec: Double = MIN_INTERVAL_SEC) -> Double {
  return max(naturalNextSec, prevScheduledSec + minIntervalSec)
}

/// 6자리 zero-pad 파일명 (최대 999,999 = 9시간 30fps 까지 sort 보장)
func frameFilename(index: Int) -> String {
  return String(format: "frame_%06d.jpg", index)
}

// MARK: - Records

struct StartCaptureOptions: Record {
  @Field var sessionId: String = ""
  @Field var goalSec: Double = 3600
  @Field var outputSec: Double = 5
  @Field var outputFps: Double = 30
  @Field var cameraFacing: String = "front"
  @Field var baseDir: String = ""
}

struct StopCaptureResult: Record {
  @Field var captureCount: Int = 0
  @Field var captureDir: String = ""
  @Field var elapsedSec: Double = 0
}

struct StitchOverlayMeta: Record {
  @Field var recordingSec: Double = 0
  @Field var goalSec: Double = 0
  @Field var outputSec: Double = 5
  @Field var streak: Int = 0
  @Field var logoPath: String = ""
  @Field var showAppMark: Bool = true   // 좌하단 logo + FocusTimelapse 표시 여부 (Free=true, Pro=false)
}

struct StitchOptions: Record {
  @Field var captureDir: String = ""
  @Field var outputPath: String = ""
  @Field var width: Int = 720
  @Field var height: Int = 1280
  @Field var outputFps: Int = 30
  @Field var overlayStyle: String = "none"
  @Field var overlayMeta: StitchOverlayMeta = StitchOverlayMeta()
}

// MARK: - Module

public class TimelapseCreatorModule: Module {

  // MARK: - Capture state (adr-09: 카메라는 VisionCamera 가 단독 점유)
  // AVCaptureSession / AVCapturePhotoOutput / DispatchSourceTimer 완전 폐기.
  // Module 은 elapsed 시간 추적 + captureDir 관리만 담당.
  private var captureDir: URL?
  private var wallStartAt: Date?
  private var pausedAccumSec: Double = 0
  private var currentPauseStartAt: Date?

  public func definition() -> ModuleDefinition {
    Name("TimelapseCreator")

    // VisionCamera Frame Processor Plugin 등록.
    // ObjC __attribute__((constructor)) 는 dynamic framework 환경에서 호출 시점이 불안정 → registry add 실패 사례.
    // Module 의 OnCreate lifecycle 은 ExpoModulesCore 가 모듈 인스턴스 생성 시 호출 → 항상 RN 측
    // VisionCameraProxy.initFrameProcessorPlugin(...) 호출보다 먼저. 등록 보장.
    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("captureTimelapseFrame") { (proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]?) in
        return VisionCameraTimelapseCapture(proxy: proxy, options: options ?? [:])
      }
      NSLog("[Capture] FrameProcessorPlugin registered: captureTimelapseFrame")
    }

    Events(
      "onCaptureProgress",
      "onStitchProgress",
      "onProgress",
      "onDebugLog"
    )

    // MARK: - startCapture
    AsyncFunction("startCapture") { (options: StartCaptureOptions) async throws in
      NSLog("[Capture] startCapture sessionId=%@ goalSec=%.0f outputSec=%.0f outputFps=%.0f baseDir=%@",
            options.sessionId, options.goalSec, options.outputSec, options.outputFps, options.baseDir)
      try await self.doStartCapture(options: options)
    }

    // MARK: - pauseCapture
    AsyncFunction("pauseCapture") { () throws in
      try self.doPauseCapture()
    }

    // MARK: - resumeCapture
    AsyncFunction("resumeCapture") { () throws in
      try self.doResumeCapture()
    }

    // MARK: - stopCapture
    AsyncFunction("stopCapture") { () throws -> StopCaptureResult in
      return try self.doStopCapture()
    }

    // MARK: - stitchTimelapse
    AsyncFunction("stitchTimelapse") { (options: StitchOptions) async throws -> String in
      return try await self.doStitchTimelapse(options: options)
    }

    // MARK: - Legacy (soft-block)
    AsyncFunction("createTimelapse") { (_: [String: Any]) throws -> String in
      throw NSError(domain: "TimelapseCreator", code: -99,
                    userInfo: [NSLocalizedDescriptionKey: "createTimelapse is deprecated. Use startCapture/stopCapture/stitchTimelapse."])
    }

    AsyncFunction("applyOverlay") { (_: [String: Any]) throws -> String in
      throw NSError(domain: "TimelapseCreator", code: -99,
                    userInfo: [NSLocalizedDescriptionKey: "applyOverlay is deprecated. Use stitchTimelapse with overlayStyle."])
    }
  }

  // MARK: - startCapture Implementation

  private func doStartCapture(options: StartCaptureOptions) async throws {
    let baseDirURL = URL(fileURLWithPath: options.baseDir.replacingOccurrences(of: "file://", with: ""))
    let captureDirURL = baseDirURL.appendingPathComponent("captures")
    try FileManager.default.createDirectory(at: captureDirURL, withIntermediateDirectories: true)

    self.captureDir = captureDirURL
    self.wallStartAt = Date()
    self.pausedAccumSec = 0
    self.currentPauseStartAt = nil

    NSLog("[Capture] startCapture done captureDir=%@", captureDirURL.path)
  }

  // MARK: - pauseCapture Implementation

  private func doPauseCapture() throws {
    NSLog("[Capture] paused at elapsed=%.2fs", currentElapsedSec())
    guard currentPauseStartAt == nil else { return }
    currentPauseStartAt = Date()
  }

  // MARK: - resumeCapture Implementation

  private func doResumeCapture() throws {
    guard let pauseStart = currentPauseStartAt else { return }
    pausedAccumSec += Date().timeIntervalSince(pauseStart)
    currentPauseStartAt = nil
    NSLog("[Capture] resumed pausedAccum=%.2fs", pausedAccumSec)
  }

  // MARK: - stopCapture Implementation

  private func doStopCapture() throws -> StopCaptureResult {
    guard let dir = captureDir, let startAt = wallStartAt else {
      throw NSError(domain: "TimelapseCreator", code: -14,
                    userInfo: [NSLocalizedDescriptionKey: "No active capture session"])
    }

    let elapsed = currentElapsedSec()
    NSLog("[Capture] stopCapture requested elapsed=%.2fs", elapsed)

    // captureDir 의 JPEG 파일 수 집계 (plugin 이 저장한 frame_*.jpg)
    let allFiles = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
    let count = allFiles.filter { $0.hasSuffix(".jpg") || $0.hasSuffix(".jpeg") }.count

    NSLog("[Capture] stopCapture done captureDir=%@ count=%d elapsed=%.2fs", dir.path, count, elapsed)

    let result = StopCaptureResult(
      captureCount: count,
      captureDir: dir.path,
      elapsedSec: max(0, elapsed)
    )

    captureDir = nil
    wallStartAt = nil
    pausedAccumSec = 0
    currentPauseStartAt = nil

    return result
  }

  private func currentElapsedSec() -> Double {
    guard let startAt = wallStartAt else { return 0 }
    var elapsed = Date().timeIntervalSince(startAt) - pausedAccumSec
    if let pauseStart = currentPauseStartAt {
      elapsed -= Date().timeIntervalSince(pauseStart)
    }
    return max(0, elapsed)
  }

  // MARK: - stitchTimelapse Implementation

  private func doStitchTimelapse(options: StitchOptions) async throws -> String {
    await MainActor.run { UIApplication.shared.isIdleTimerDisabled = true }
    defer { DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false } }

    let captureDirURL = URL(fileURLWithPath: options.captureDir.replacingOccurrences(of: "file://", with: ""))
    let outputURL = URL(fileURLWithPath: options.outputPath.replacingOccurrences(of: "file://", with: ""))
    try? FileManager.default.removeItem(at: outputURL)

    let fm = FileManager.default
    let allFiles = (try? fm.contentsOfDirectory(at: captureDirURL, includingPropertiesForKeys: nil)) ?? []
    let jpegFiles = allFiles
      .filter { $0.pathExtension.lowercased() == "jpg" || $0.pathExtension.lowercased() == "jpeg" }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }

    guard !jpegFiles.isEmpty else {
      throw NSError(domain: "TimelapseCreator", code: -20,
                    userInfo: [NSLocalizedDescriptionKey: "No JPEG files found in captureDir: \(options.captureDir)"])
    }

    let totalFrames = jpegFiles.count
    let outW = options.width
    let outH = options.height

    guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
      throw NSError(domain: "TimelapseCreator", code: -21,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to create AVAssetWriter"])
    }

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: outW,
      AVVideoHeightKey: outH,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 3_500_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ]

    let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    writerInput.expectsMediaDataInRealTime = false

    let pixelBufferAdaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: writerInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: outW,
        kCVPixelBufferHeightKey as String: outH,
      ]
    )

    guard writer.canAdd(writerInput) else {
      throw NSError(domain: "TimelapseCreator", code: -22,
                    userInfo: [NSLocalizedDescriptionKey: "Cannot add video input to writer"])
    }
    writer.add(writerInput)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    let fps = CMTimeMake(value: 1, timescale: Int32(options.outputFps))
    let meta = options.overlayMeta

    for (i, fileURL) in jpegFiles.enumerated() {
      // 매 iteration 의 UIImage / renderer 비트맵 / 중간 버퍼를 즉시 release 하기 위해
      // autoreleasepool 로 감싼다. 351 프레임 누적 OOM 방지.
      let bufferOpt: CVPixelBuffer? = autoreleasepool {
        guard let imgData = try? Data(contentsOf: fileURL),
              let uiImage = UIImage(data: imgData) else { return nil }

        // burnInOverlay 항상 호출 → logo 는 style 무관 항상 burn-in (logoPath 빈 string 이면 skip)
        // style="none" 일 때는 timer/progress/streak 텍스트만 skip 됨
        let frameImage = burnInOverlay(
          image: uiImage,
          width: outW, height: outH,
          style: options.overlayStyle,
          frameIndex: i,
          totalFrames: totalFrames,
          meta: meta
        )

        return makePixelBuffer(from: frameImage, width: outW, height: outH)
      }

      guard let buffer = bufferOpt else { continue }

      let presentationTime = CMTimeMultiply(fps, multiplier: Int32(i))

      while !writerInput.isReadyForMoreMediaData {
        try? await Task.sleep(nanoseconds: 5_000_000)
      }
      pixelBufferAdaptor.append(buffer, withPresentationTime: presentationTime)

      let progress = Double(i + 1) / Double(totalFrames)
      sendEvent("onStitchProgress", ["progress": progress])
    }

    writerInput.markAsFinished()
    await writer.finishWriting()

    guard writer.status == .completed else {
      throw NSError(domain: "TimelapseCreator", code: -23,
                    userInfo: [NSLocalizedDescriptionKey: writer.error?.localizedDescription ?? "AVAssetWriter failed"])
    }

    return outputURL.path
  }

  // MARK: - Overlay Burn-in

  private func burnInOverlay(
    image: UIImage,
    width: Int, height: Int,
    style: String,
    frameIndex: Int,
    totalFrames: Int,
    meta: StitchOverlayMeta
  ) -> UIImage {
    let size = CGSize(width: width, height: height)
    let scale = CGFloat(width) / 390.0

    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      let srcAspect = image.size.width / image.size.height
      let dstAspect = CGFloat(width) / CGFloat(height)
      let drawRect: CGRect
      if srcAspect > dstAspect {
        let drawH = CGFloat(height)
        let drawW = drawH * srcAspect
        drawRect = CGRect(x: -(drawW - CGFloat(width)) / 2, y: 0, width: drawW, height: drawH)
      } else {
        let drawW = CGFloat(width)
        let drawH = drawW / srcAspect
        drawRect = CGRect(x: 0, y: -(drawH - CGFloat(height)) / 2, width: drawW, height: drawH)
      }
      image.draw(in: drawRect)

      // 좌하단 logo + FocusTimelapse 워터마크 — showAppMark=true 일 때만 (Free 사용자)
      if meta.showAppMark {
        let wmFontSize = 22.0 * scale
        let wmFont = UIFont.boldSystemFont(ofSize: wmFontSize)
        let wmPaddingL: CGFloat = 16 * scale
        let wmPaddingB: CGFloat = 16 * scale
        let logoSize: CGFloat = 28 * scale
        let gap: CGFloat = 8 * scale
        let wmText = "FocusTimelapse"
        let wmAttrs: [NSAttributedString.Key: Any] = [
          .font: wmFont,
          .foregroundColor: UIColor.white.withAlphaComponent(0.9),
        ]
        let wmTextSize = (wmText as NSString).size(withAttributes: wmAttrs)
        let totalH = max(logoSize, wmTextSize.height)
        let baseY = CGFloat(height) - wmPaddingB - totalH

        var logoW: CGFloat = logoSize
        if !meta.logoPath.isEmpty {
          let path = meta.logoPath.replacingOccurrences(of: "file://", with: "")
          if let logo = UIImage(contentsOfFile: path) {
            let logoAspect = logo.size.width / max(1, logo.size.height)
            logoW = logoSize * logoAspect
            let logoRect = CGRect(x: wmPaddingL, y: baseY + (totalH - logoSize) / 2, width: logoW, height: logoSize)
            logo.draw(in: logoRect, blendMode: .normal, alpha: 0.9)
          }
        }
        let textX = meta.logoPath.isEmpty ? wmPaddingL : (wmPaddingL + logoW + gap)
        let textY = baseY + (totalH - wmTextSize.height) / 2
        (wmText as NSString).draw(at: CGPoint(x: textX, y: textY), withAttributes: wmAttrs)
      }

      let overlayFontSize: CGFloat = 24 * scale
      let overlayFont = UIFont.boldSystemFont(ofSize: overlayFontSize)
      let paddingR: CGFloat = 16 * scale
      let paddingT: CGFloat = 16 * scale
      let playbackRatio = totalFrames > 0 ? Double(frameIndex) / Double(totalFrames) : 0

      switch style {
      case "timer-up":
        let elapsed = playbackRatio * meta.recordingSec
        let text = formatTimeHMS(elapsed)
        drawTextTopRight(text, font: overlayFont, paddingRight: paddingR, paddingTop: paddingT, canvasWidth: CGFloat(width))

      case "timer-down":
        let elapsed = (1 - playbackRatio) * meta.recordingSec
        let text = formatTimeHMS(elapsed)
        drawTextTopRight(text, font: overlayFont, paddingRight: paddingR, paddingTop: paddingT, canvasWidth: CGFloat(width))

      case "progress":
        let finalPercent = meta.goalSec > 0 ? min(1.0, meta.recordingSec / meta.goalSec) : 1.0
        let percent = finalPercent * playbackRatio
        drawProgressBar(
          percent: percent,
          goalSeconds: meta.goalSec,
          paddingRight: paddingR, paddingTop: paddingT,
          fontSize: overlayFontSize,
          canvasWidth: CGFloat(width)
        )

      case "streak":
        let n = meta.streak
        let text = "▸ \(n) day\(n != 1 ? "s" : "") streak"
        drawTextTopRight(text, font: overlayFont, paddingRight: paddingR, paddingTop: paddingT, canvasWidth: CGFloat(width))

      default:
        break
      }
    }
  }

  // MARK: - Image Resize

  private func resizedImage(_ image: UIImage, width: Int, height: Int) -> UIImage {
    let size = CGSize(width: width, height: height)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      let srcAspect = image.size.width / image.size.height
      let dstAspect = CGFloat(width) / CGFloat(height)
      let drawRect: CGRect
      if srcAspect > dstAspect {
        let drawH = CGFloat(height)
        let drawW = drawH * srcAspect
        drawRect = CGRect(x: -(drawW - CGFloat(width)) / 2, y: 0, width: drawW, height: drawH)
      } else {
        let drawW = CGFloat(width)
        let drawH = drawW / srcAspect
        drawRect = CGRect(x: 0, y: -(drawH - CGFloat(height)) / 2, width: drawW, height: drawH)
      }
      image.draw(in: drawRect)
    }
  }

  // MARK: - Pixel Buffer

  private func makePixelBuffer(from image: UIImage, width: Int, height: Int) -> CVPixelBuffer? {
    var pixelBuffer: CVPixelBuffer?
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, attrs as CFDictionary, &pixelBuffer)
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let context = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width, height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else { return nil }

    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: 1.0, y: -1.0)
    UIGraphicsPushContext(context)
    image.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
    UIGraphicsPopContext()
    return buffer
  }

  // MARK: - Drawing Helpers

  private func formatTimeHMS(_ totalSeconds: Double) -> String {
    let s = Int(max(0, totalSeconds))
    let h = s / 3600
    let m = (s % 3600) / 60
    let sec = s % 60
    return String(format: "%02d:%02d:%02d", h, m, sec)
  }

  private func formatGoalText(_ goalSeconds: Double) -> String {
    let totalMins = Int(goalSeconds / 60)
    let h = totalMins / 60
    let m = totalMins % 60
    if h > 0 && m > 0 {
      let hrLabel = h == 1 ? "1 hr" : "\(h) hrs"
      let minLabel = m == 1 ? "1 min" : "\(m) mins"
      return "\(hrLabel) \(minLabel)"
    }
    if h > 0 { return h == 1 ? "1 hr" : "\(h) hrs" }
    return m == 1 ? "1 min" : "\(m) mins"
  }

  private func drawTextTopRight(_ text: String, font: UIFont, paddingRight: CGFloat, paddingTop: CGFloat, canvasWidth: CGFloat) {
    let scale = canvasWidth / 390.0
    let shadow = NSShadow()
    shadow.shadowColor = UIColor.black.withAlphaComponent(0.6)
    shadow.shadowOffset = CGSize(width: 0, height: 1 * scale)
    shadow.shadowBlurRadius = 4 * scale
    let attrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: UIColor.white,
      .shadow: shadow,
    ]
    let textSize = (text as NSString).size(withAttributes: [.font: font])
    let x = canvasWidth - paddingRight - textSize.width
    let y = paddingTop
    (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
  }

  private func drawProgressBar(percent: Double, goalSeconds: Double, paddingRight: CGFloat, paddingTop: CGFloat, fontSize: CGFloat, canvasWidth: CGFloat) {
    let font = UIFont.boldSystemFont(ofSize: fontSize)
    let barHeight: CGFloat = 11
    let barWidth: CGFloat = 140 * (canvasWidth / 390.0)
    let labelGap: CGFloat = 8
    let goalText = formatGoalText(goalSeconds)

    let scale = canvasWidth / 390.0
    let shadow = NSShadow()
    shadow.shadowColor = UIColor.black.withAlphaComponent(0.6)
    shadow.shadowOffset = CGSize(width: 0, height: 1 * scale)
    shadow.shadowBlurRadius = 4 * scale
    let labelAttrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: UIColor.white.withAlphaComponent(0.9),
      .shadow: shadow,
    ]
    let labelSize = (goalText as NSString).size(withAttributes: [.font: font])

    let barX = canvasWidth - paddingRight - barWidth
    let labelX = barX - labelGap - labelSize.width
    let topY = paddingTop

    (goalText as NSString).draw(at: CGPoint(x: labelX, y: topY), withAttributes: labelAttrs)

    let barY = topY + (labelSize.height - barHeight) / 2
    UIColor.black.withAlphaComponent(0.4).setFill()
    UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barWidth, height: barHeight), cornerRadius: barHeight / 2).fill()

    let fillWidth = barWidth * CGFloat(max(0, min(1, percent)))
    if fillWidth > 0 {
      UIColor.white.setFill()
      UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: fillWidth, height: barHeight), cornerRadius: barHeight / 2).fill()
    }
  }
}
