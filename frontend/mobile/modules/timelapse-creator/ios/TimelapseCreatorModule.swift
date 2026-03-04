import ExpoModulesCore
import AVFoundation
import CoreGraphics
import UIKit

public class TimelapseCreatorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TimelapseCreator")

    Events("onProgress")

    AsyncFunction("createTimelapse") { (options: TimelapseOptions) -> String in
      return try await self.buildTimelapse(options: options)
    }
  }

  // MARK: - Options Record

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

    // 2. Setup AVAssetImageGenerator
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: width, height: height)  // 출력 크기와 동일하게 제한
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

      let image = UIImage(cgImage: cgImage)

      // Create pixel buffer (mirror=false, generator handles orientation)
      guard let pixelBuffer = createPixelBuffer(
        from: image,
        width: width,
        height: height,
        overlayStyle: options.overlayStyle,
        streak: options.streak,
        frameIndex: frameIdx,
        totalFrames: totalFrames,
        timerMode: options.timerMode,
        recordingSeconds: options.recordingSeconds,
        goalSeconds: options.goalSeconds
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
    overlayStyle: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    timerMode: String,
    recordingSeconds: Double,
    goalSeconds: Double
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

    let imgW = CGFloat(cgImage.width)
    let imgH = CGFloat(cgImage.height)
    let outW = CGFloat(width)
    let outH = CGFloat(height)

    // Center-crop (aspect fill)
    let targetRatio = outW / outH
    let imgRatio = imgW / imgH
    var srcRect: CGRect
    if imgRatio > targetRatio {
      let cropW = imgH * targetRatio
      srcRect = CGRect(x: (imgW - cropW) / 2, y: 0, width: cropW, height: imgH)
    } else {
      let cropH = imgW / targetRatio
      srcRect = CGRect(x: 0, y: (imgH - cropH) / 2, width: imgW, height: cropH)
    }

    // Crop the source image
    guard let croppedCG = cgImage.cropping(to: srcRect) else { return nil }

    // Flip Y for CGContext (bottom-left origin) vs UIImage (top-left origin)
    context.translateBy(x: 0, y: outH)
    context.scaleBy(x: 1.0, y: -1.0)

    context.draw(croppedCG, in: CGRect(x: 0, y: 0, width: outW, height: outH))

    // Draw overlay
    if overlayStyle != "none" {
      drawOverlay(
        context: context,
        width: outW,
        height: outH,
        style: overlayStyle,
        streak: streak,
        frameIndex: frameIndex,
        totalFrames: totalFrames,
        timerMode: timerMode,
        recordingSeconds: recordingSeconds,
        goalSeconds: goalSeconds
      )
    }

    return buffer
  }

  // MARK: - Overlay Drawing

  private func drawOverlay(
    context: CGContext,
    width: CGFloat,
    height: CGFloat,
    style: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    timerMode: String,
    recordingSeconds: Double,
    goalSeconds: Double
  ) {
    context.saveGState()
    // Flip to UIKit coordinates for text drawing
    context.translateBy(x: 0, y: height)
    context.scaleBy(x: 1, y: -1)

    UIGraphicsPushContext(context)

    let fontSize: CGFloat = min(width, height) * 0.045
    let font = UIFont.systemFont(ofSize: fontSize, weight: .bold)
    let padding: CGFloat = 20

    let elapsed = totalFrames > 0
      ? (Double(frameIndex) / Double(totalFrames)) * recordingSeconds
      : 0

    switch style {
    case "timer":
      let displaySeconds: Double
      if timerMode == "countdown" {
        displaySeconds = max(0, recordingSeconds - elapsed)
      } else {
        displaySeconds = elapsed
      }
      let text = formatTime(displaySeconds)
      drawText(text, font: font, padding: padding, width: width, context: context)

    case "progress":
      let percent = recordingSeconds > 0 ? min(1.0, elapsed / recordingSeconds) : 0
      drawProgressBar(percent: percent, padding: padding, width: width, fontSize: fontSize, context: context)

    case "streak":
      let text = "▸ \(streak) days streak"
      drawText(text, font: font, padding: padding, width: width, context: context)

    default:
      break
    }

    UIGraphicsPopContext()
    context.restoreGState()
  }

  // MARK: - Overlay Helpers

  private func formatTime(_ totalSeconds: Double) -> String {
    let s = Int(totalSeconds)
    let h = s / 3600
    let m = (s % 3600) / 60
    let sec = s % 60
    return String(format: "%02d:%02d:%02d", h, m, sec)
  }

  private func drawText(_ text: String, font: UIFont, padding: CGFloat, width: CGFloat, context: CGContext) {
    let textColor = UIColor.white
    let shadowColor = UIColor.black.withAlphaComponent(0.6)

    let attrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: textColor,
    ]
    let shadowAttrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: shadowColor,
    ]

    let textSize = (text as NSString).size(withAttributes: attrs)
    let x = width - textSize.width - padding
    let y = padding

    (text as NSString).draw(at: CGPoint(x: x + 1.5, y: y + 1.5), withAttributes: shadowAttrs)
    (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
  }

  private func drawProgressBar(percent: Double, padding: CGFloat, width: CGFloat, fontSize: CGFloat, context: CGContext) {
    let barWidth = width * 0.25
    let barHeight: CGFloat = 8
    let x = width - barWidth - padding
    let y = padding + fontSize * 0.5

    // Background (semi-transparent)
    let bgRect = CGRect(x: x, y: y, width: barWidth, height: barHeight)
    context.setFillColor(UIColor.black.withAlphaComponent(0.4).cgColor)
    UIColor.black.withAlphaComponent(0.4).setFill()
    UIBezierPath(roundedRect: bgRect, cornerRadius: barHeight / 2).fill()

    // Filled portion (white)
    let fillWidth = barWidth * CGFloat(percent)
    if fillWidth > 0 {
      let fillRect = CGRect(x: x, y: y, width: fillWidth, height: barHeight)
      UIColor.white.setFill()
      UIBezierPath(roundedRect: fillRect, cornerRadius: barHeight / 2).fill()
    }

    // Percentage text below bar
    let pctText = "\(Int(percent * 100))%"
    let smallFont = UIFont.systemFont(ofSize: fontSize * 0.7, weight: .semibold)
    let pctAttrs: [NSAttributedString.Key: Any] = [
      .font: smallFont,
      .foregroundColor: UIColor.white,
    ]
    let pctSize = (pctText as NSString).size(withAttributes: pctAttrs)
    let pctX = x + barWidth - pctSize.width
    let pctY = y + barHeight + 4
    (pctText as NSString).draw(at: CGPoint(x: pctX, y: pctY), withAttributes: pctAttrs)
  }
}
