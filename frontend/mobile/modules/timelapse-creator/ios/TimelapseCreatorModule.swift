import ExpoModulesCore
import AVFoundation
import CoreGraphics
import UIKit
import QuartzCore

public class TimelapseCreatorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TimelapseCreator")

    Events("onProgress")

    AsyncFunction("createTimelapse") { (options: TimelapseOptions) -> String in
      return try await self.buildTimelapse(options: options)
    }

    AsyncFunction("applyOverlay") { (options: OverlayOptions) -> String in
      return try await self.buildOverlay(options: options)
    }
  }

  // MARK: - Options Records

  struct OverlayOptions: Record {
    @Field var videoUri: String = ""
    @Field var outputPath: String = ""
    @Field var overlayStyle: String = "none"
    @Field var overlayText: String = ""
    @Field var streak: Int = 0
    @Field var recordingSeconds: Double = 0
    @Field var goalSeconds: Double = 0
    @Field var timerMode: String = "countdown"
    @Field var width: Int = 720
    @Field var height: Int = 1280
    @Field var logoPath: String = ""
  }

  struct TimelapseOptions: Record {
    @Field var videoUri: String = ""
    @Field var outputPath: String = ""
    @Field var outputSeconds: Double = 30
    @Field var width: Int = 720
    @Field var height: Int = 1280
    @Field var frameRate: Int = 30
    @Field var bitRate: Int = 3_500_000
    @Field var overlayStyle: String = "none"
    @Field var overlayText: String = ""
    @Field var streak: Int = 0
    @Field var timerMode: String = "countdown"
    @Field var recordingSeconds: Double = 0
    @Field var goalSeconds: Double = 0
    @Field var cameraFacing: String = "front"
  }

  // MARK: - Build Timelapse

  // MARK: - Apply Overlay (frame-by-frame, animated overlay)

  private func buildOverlay(options: OverlayOptions) async throws -> String {
    // overlay가 none이면 원본 그대로 복사
    if options.overlayStyle == "none" {
      let src = URL(fileURLWithPath: options.videoUri.replacingOccurrences(of: "file://", with: ""))
      let dst = URL(fileURLWithPath: options.outputPath.replacingOccurrences(of: "file://", with: ""))
      try? FileManager.default.removeItem(at: dst)
      try FileManager.default.copyItem(at: src, to: dst)
      return options.outputPath
    }

    await MainActor.run { UIApplication.shared.isIdleTimerDisabled = true }
    defer { DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false } }

    let inputURL = URL(fileURLWithPath: options.videoUri.replacingOccurrences(of: "file://", with: ""))
    let outputURL = URL(fileURLWithPath: options.outputPath.replacingOccurrences(of: "file://", with: ""))
    try? FileManager.default.removeItem(at: outputURL)

    let width = options.width
    let height = options.height
    let frameRate = 30

    let asset = AVAsset(url: inputURL)
    let duration = try await asset.load(.duration)
    let durationSeconds = CMTimeGetSeconds(duration)
    guard durationSeconds > 0 else {
      throw NSError(domain: "TimelapseCreator", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "Video has zero duration"])
    }

    // preferredTransform 로드
    let videoTrackForXform = try await asset.loadTracks(withMediaType: .video).first
    let preferredTransform = try await videoTrackForXform?.load(.preferredTransform) ?? .identity

    // frame generator
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = false
    generator.maximumSize = CGSize(width: width, height: height)
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)

    // encoder
    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 4_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ]
    let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    writerInput.expectsMediaDataInRealTime = false
    let sourcePixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: writerInput,
      sourcePixelBufferAttributes: sourcePixelBufferAttributes
    )
    writer.add(writerInput)
    guard writer.startWriting() else {
      throw NSError(domain: "TimelapseCreator", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to start writing"])
    }
    writer.startSession(atSourceTime: .zero)

    let totalFrames = Int(durationSeconds * Double(frameRate))
    let frameDuration = CMTimeMake(value: 1, timescale: Int32(frameRate))

    for frameIdx in 0..<totalFrames {
      while !writerInput.isReadyForMoreMediaData {
        try await Task.sleep(nanoseconds: 10_000_000)
      }

      let videoTime = (Double(frameIdx) / Double(totalFrames)) * durationSeconds
      let cmTime = CMTime(seconds: videoTime, preferredTimescale: 600)

      var actualTime = CMTime.zero
      let cgImage: CGImage
      do {
        cgImage = try generator.copyCGImage(at: cmTime, actualTime: &actualTime)
      } catch { continue }

      let image = UIImage(cgImage: cgImage)

      guard let pixelBuffer = createPixelBuffer(
        from: image,
        width: width,
        height: height,
        preferredTransform: preferredTransform,
        overlayStyle: options.overlayStyle,
        streak: options.streak,
        frameIndex: frameIdx,
        totalFrames: totalFrames,
        timerMode: options.timerMode,
        recordingSeconds: options.recordingSeconds,
        goalSeconds: options.goalSeconds,
        logoPath: options.logoPath
      ) else { continue }

      let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(frameIdx))
      adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
    }

    writerInput.markAsFinished()
    await writer.finishWriting()

    guard writer.status == .completed else {
      throw NSError(domain: "TimelapseCreator", code: -4,
                    userInfo: [NSLocalizedDescriptionKey: writer.error?.localizedDescription ?? "Export failed"])
    }

    return options.outputPath
  }

  // MARK: - Build Timelapse

  private func buildTimelapse(options: TimelapseOptions) async throws -> String {
    // Prevent screen auto-lock during heavy processing
    await MainActor.run { UIApplication.shared.isIdleTimerDisabled = true }
    defer {
      DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
    }

    let outputURL = URL(fileURLWithPath: options.outputPath.replacingOccurrences(of: "file://", with: ""))

    // Remove existing file if any
    try? FileManager.default.removeItem(at: outputURL)

    let width = options.width
    let height = options.height

    // 1. Load source video
    let videoURL = URL(fileURLWithPath: options.videoUri.replacingOccurrences(of: "file://", with: ""))
    let asset = AVAsset(url: videoURL)
    let duration = try await asset.load(.duration)
    let durationSeconds = CMTimeGetSeconds(duration)

    guard durationSeconds > 0 else {
      throw NSError(domain: "TimelapseCreator", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "Video has zero duration"])
    }

    // 2. preferredTransform 로드 (픽셀 버퍼 드로잉 시 직접 적용)
    let videoTrackForXform = try await asset.loadTracks(withMediaType: .video).first
    let preferredTransform = try await videoTrackForXform?.load(.preferredTransform) ?? .identity

    // Setup AVAssetImageGenerator
    // appliesPreferredTrackTransform=false → 원본 픽셀 그대로, createPixelBuffer에서 직접 회전 처리
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = false
    generator.maximumSize = CGSize(width: width, height: height)
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)

    // 3. AVAssetWriter setup
    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: options.bitRate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ]

    let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    writerInput.expectsMediaDataInRealTime = false

    let sourcePixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
    ]

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: writerInput,
      sourcePixelBufferAttributes: sourcePixelBufferAttributes
    )

    writer.add(writerInput)
    guard writer.startWriting() else {
      throw NSError(domain: "TimelapseCreator", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to start writing: \(writer.error?.localizedDescription ?? "unknown")"])
    }
    writer.startSession(atSourceTime: .zero)

    let totalFrames = Int(options.outputSeconds * Double(options.frameRate))
    let frameDuration = CMTimeMake(value: 1, timescale: Int32(options.frameRate))

    // 4. Extract frames and encode
    for frameIdx in 0..<totalFrames {
      // Wait until the writer input is ready
      while !writerInput.isReadyForMoreMediaData {
        try await Task.sleep(nanoseconds: 10_000_000) // 10ms
      }

      // Map frame index to source video time
      let videoTime = (Double(frameIdx) / Double(totalFrames)) * durationSeconds
      let cmTime = CMTime(seconds: videoTime, preferredTimescale: 600)

      // Extract frame
      var actualTime = CMTime.zero
      let cgImage: CGImage
      do {
        cgImage = try generator.copyCGImage(at: cmTime, actualTime: &actualTime)
      } catch {
        // Skip frames that fail to extract
        continue
      }

      // preferredTransform을 createPixelBuffer에 전달해 직접 회전 적용
      let image = UIImage(cgImage: cgImage)

      guard let pixelBuffer = createPixelBuffer(
        from: image,
        width: width,
        height: height,
        preferredTransform: preferredTransform,
        overlayStyle: options.overlayStyle,
        streak: options.streak,
        frameIndex: frameIdx,
        totalFrames: totalFrames,
        timerMode: options.timerMode,
        recordingSeconds: options.recordingSeconds,
        goalSeconds: options.goalSeconds,
        logoPath: ""
      ) else {
        continue
      }

      let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(frameIdx))
      adaptor.append(pixelBuffer, withPresentationTime: presentationTime)

      // Report progress every 10 frames
      if frameIdx % 10 == 0 {
        let progress = Double(frameIdx) / Double(totalFrames)
        self.sendEvent("onProgress", ["progress": progress])
      }
    }

    // Finish
    writerInput.markAsFinished()
    await writer.finishWriting()

    if writer.status == .failed {
      throw NSError(domain: "TimelapseCreator", code: -4,
                    userInfo: [NSLocalizedDescriptionKey: "Writer failed: \(writer.error?.localizedDescription ?? "unknown")"])
    }

    self.sendEvent("onProgress", ["progress": 1.0])
    return options.outputPath
  }

  // MARK: - Pixel Buffer Creation

  private func createPixelBuffer(
    from image: UIImage,
    width: Int,
    height: Int,
    preferredTransform: CGAffineTransform,
    overlayStyle: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    timerMode: String,
    recordingSeconds: Double,
    goalSeconds: Double,
    logoPath: String = ""
  ) -> CVPixelBuffer? {
    var pixelBuffer: CVPixelBuffer?
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    let status = CVPixelBufferCreate(
      kCFAllocatorDefault,
      width, height,
      kCVPixelFormatType_32ARGB,
      attrs as CFDictionary,
      &pixelBuffer
    )
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let context = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else { return nil }

    guard let cgImage = image.cgImage else { return nil }

    let outW = CGFloat(width)
    let outH = CGFloat(height)

    // UIImage를 올바른 orientation으로 렌더링하기 위해 UIGraphicsImageRenderer 사용
    // preferredTransform → UIImage.Orientation 변환
    let orientation = uiImageOrientation(from: preferredTransform)
    let orientedImage = UIImage(cgImage: cgImage, scale: 1.0, orientation: orientation)

    // orientation이 반영된 size 계산
    let imgW = orientedImage.size.width
    let imgH = orientedImage.size.height

    // Center-crop (aspect fill)
    let targetRatio = outW / outH
    let imgRatio = imgW / imgH

    var drawRect: CGRect
    if imgRatio > targetRatio {
      // 이미지가 더 넓음 → 좌우 crop
      let scaledH = outH
      let scaledW = outH * imgRatio
      drawRect = CGRect(x: -(scaledW - outW) / 2, y: 0, width: scaledW, height: scaledH)
    } else {
      // 이미지가 더 좁음 → 상하 crop
      let scaledW = outW
      let scaledH = outW / imgRatio
      drawRect = CGRect(x: 0, y: -(scaledH - outH) / 2, width: scaledW, height: scaledH)
    }

    // ── 이미지 드로잉: CGContext Y-flip 적용 ──
    context.saveGState()
    context.translateBy(x: 0, y: outH)
    context.scaleBy(x: 1.0, y: -1.0)
    context.clip(to: CGRect(x: 0, y: 0, width: outW, height: outH))
    UIGraphicsPushContext(context)
    orientedImage.draw(in: drawRect)
    UIGraphicsPopContext()
    context.restoreGState()

    // ── 오버레이: 항상 drawOverlay 호출 (워터마크는 항상, 선택 오버레이는 style에 따라) ──
    // CGContext는 bottom-left origin → Y-flip 적용해야 UIKit 텍스트가 바로 나옴
    context.saveGState()
    context.translateBy(x: 0, y: outH)
    context.scaleBy(x: 1.0, y: -1.0)
    UIGraphicsPushContext(context)
    drawOverlay(
      width: outW,
      height: outH,
      style: overlayStyle,
      streak: streak,
      frameIndex: frameIndex,
      totalFrames: totalFrames,
      timerMode: timerMode,
      recordingSeconds: recordingSeconds,
      goalSeconds: goalSeconds,
      logoPath: logoPath
    )
    UIGraphicsPopContext()
    context.restoreGState()

    return buffer
  }

  // MARK: - Overlay Drawing

  /// UIKit 좌표계(top-left origin)에서 오버레이를 그림
  /// 호출 전에 UIGraphicsPushContext(context) 필요
  private func drawOverlay(
    width: CGFloat,
    height: CGFloat,
    style: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    timerMode: String,
    recordingSeconds: Double,
    goalSeconds: Double,
    logoPath: String = ""
  ) {
    let fontSize: CGFloat = min(width, height) * 0.045
    let font = UIFont.systemFont(ofSize: fontSize, weight: .bold)
    let padding: CGFloat = 20

    let elapsed = totalFrames > 0
      ? (Double(frameIndex) / Double(totalFrames)) * recordingSeconds
      : 0

    // "pure" = generating 단계에서 워터마크 없는 순수 영상 생성용
    if style == "pure" { return }

    switch style {
    case "timer":
      let displaySeconds = timerMode == "countdown"
        ? max(0, recordingSeconds - elapsed)
        : elapsed
      drawText(formatTime(displaySeconds), font: font, padding: padding, width: width)

    case "progress":
      // 목표 시간 대비 실제 진행 비율 (고정값 — 프레임마다 변하지 않음)
      let percent = goalSeconds > 0 ? min(1.0, recordingSeconds / goalSeconds) : 1.0
      drawProgressBar(percent: percent, goalSeconds: goalSeconds, padding: padding, width: width, fontSize: fontSize)

    case "streak":
      drawText("▸ \(streak) days streak", font: font, padding: padding, width: width)

    default:
      break
    }

    // 워터마크: 로고 이미지 + "FocusTimelapse" 텍스트 (좌하단)
    let wmFontSize = min(width, height) * 0.045
    let wmPadding: CGFloat = 12
    let logoSize = wmFontSize * 1.4
    let wmAttrs: [NSAttributedString.Key: Any] = [
      .font: UIFont.boldSystemFont(ofSize: wmFontSize),
      .foregroundColor: UIColor.white.withAlphaComponent(0.9),
    ]
    let textSize = ("FocusTimelapse" as NSString).size(withAttributes: wmAttrs)
    let wmY = height - logoSize - wmPadding

    // 로고 이미지 그리기 (JS에서 전달받은 로컬 파일 경로로 로드)
    let logoImage: UIImage? = {
      if !logoPath.isEmpty {
        let path = logoPath.replacingOccurrences(of: "file://", with: "")
        return UIImage(contentsOfFile: path)
      }
      return nil
    }()

    if let logo = logoImage {
      let logoRect = CGRect(x: wmPadding, y: wmY, width: logoSize, height: logoSize)
      logo.draw(in: logoRect, blendMode: .normal, alpha: 0.9)
    }

    // 텍스트 그리기 (로고 오른쪽, 로고 없으면 왼쪽 패딩부터)
    let textX = (logoImage != nil) ? (wmPadding + logoSize + 5) : wmPadding
    let textY = wmY + (logoSize - textSize.height) / 2
    ("FocusTimelapse" as NSString).draw(at: CGPoint(x: textX, y: textY), withAttributes: wmAttrs)
  }

  // MARK: - CGAffineTransform → UIImage.Orientation

  /// AVAsset의 preferredTransform을 UIImage.Orientation으로 변환
  private func uiImageOrientation(from transform: CGAffineTransform) -> UIImage.Orientation {
    // iOS 카메라 영상의 transform 패턴:
    // Portrait (back):   (0, 1, -1, 0)  → .right  (90° CCW)
    // Portrait (front):  (0, -1, 1, 0)  → .leftMirrored (90° CW + mirror) 또는 .left
    // Landscape right:   (1, 0, 0, 1)   → .up
    // Landscape left:    (-1, 0, 0, -1) → .down (180°)
    // Upside down:       (0, -1, 1, 0)  → .left
    let a = transform.a
    let b = transform.b
    let c = transform.c
    let d = transform.d

    if a == 0 && b == 1 && c == -1 && d == 0 {
      return .right          // Portrait, 후면 카메라
    } else if a == 0 && b == -1 && c == 1 && d == 0 {
      return .left           // Portrait upside-down / 전면 카메라 일부
    } else if a == 1 && b == 0 && c == 0 && d == 1 {
      return .up             // Landscape right
    } else if a == -1 && b == 0 && c == 0 && d == -1 {
      return .down           // Landscape left
    } else {
      return .up             // 기본값
    }
  }

  // MARK: - Overlay Helpers

  private func formatTime(_ totalSeconds: Double) -> String {
    let s = Int(totalSeconds)
    let h = s / 3600
    let m = (s % 3600) / 60
    let sec = s % 60
    return String(format: "%02d:%02d:%02d", h, m, sec)
  }

  /// UIKit 좌표계 기준 텍스트 드로잉 (우상단, top-left origin)
  private func drawText(_ text: String, font: UIFont, padding: CGFloat, width: CGFloat) {
    let attrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: UIColor.white,
    ]
    let shadowAttrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: UIColor.black.withAlphaComponent(0.6),
    ]
    let textSize = (text as NSString).size(withAttributes: attrs)
    let x = width - textSize.width - padding
    let y = padding  // top-left origin → 위에서 padding
    (text as NSString).draw(at: CGPoint(x: x + 1.5, y: y + 1.5), withAttributes: shadowAttrs)
    (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
  }

  /// UIKit 좌표계 기준 프로그레스 바 드로잉 (우상단, top-left origin)
  /// 좌측에 목표 시간 텍스트 표시 (예: "2 hrs", "30 min")
  private func drawProgressBar(percent: Double, goalSeconds: Double, padding: CGFloat, width: CGFloat, fontSize: CGFloat) {
    let barHeight: CGFloat = 8

    // 목표 시간 텍스트 (예: "2 hrs", "30 min")
    let goalText: String
    let totalMins = Int(goalSeconds / 60)
    if totalMins >= 60 {
      let h = totalMins / 60
      let m = totalMins % 60
      if m > 0 {
        goalText = "\(h)h \(m)m"
      } else {
        goalText = h == 1 ? "1 hr" : "\(h) hrs"
      }
    } else {
      goalText = "\(totalMins) min"
    }

    let labelFontSize = fontSize * 0.7
    let labelAttrs: [NSAttributedString.Key: Any] = [
      .font: UIFont.boldSystemFont(ofSize: labelFontSize),
      .foregroundColor: UIColor.white.withAlphaComponent(0.9),
    ]
    let labelSize = (goalText as NSString).size(withAttributes: labelAttrs)

    // 바 너비: 전체에서 라벨 + 여백 제외
    let labelGap: CGFloat = 8
    let barWidth = width * 0.25
    let totalBlockWidth = labelSize.width + labelGap + barWidth
    let startX = width - totalBlockWidth - padding
    let y = padding

    // 라벨 그리기
    let labelY = y + (barHeight - labelSize.height) / 2
    (goalText as NSString).draw(at: CGPoint(x: startX, y: labelY), withAttributes: labelAttrs)

    // 바 시작 X
    let barX = startX + labelSize.width + labelGap

    // Background
    UIColor.black.withAlphaComponent(0.4).setFill()
    UIBezierPath(roundedRect: CGRect(x: barX, y: y, width: barWidth, height: barHeight), cornerRadius: barHeight / 2).fill()

    // Fill
    let fillWidth = barWidth * CGFloat(percent)
    if fillWidth > 0 {
      UIColor.white.setFill()
      UIBezierPath(roundedRect: CGRect(x: barX, y: y, width: fillWidth, height: barHeight), cornerRadius: barHeight / 2).fill()
    }
  }
}
