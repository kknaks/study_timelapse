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
    @Field var photoUris: [String] = []
    @Field var outputPath: String = ""
    @Field var outputSeconds: Double = 30
    @Field var width: Int = 720
    @Field var height: Int = 1280
    @Field var frameRate: Int = 30
    @Field var bitRate: Int = 3_500_000
    @Field var mirrorHorizontally: Bool = false
    @Field var overlayStyle: String = "none"
    @Field var overlayText: String = ""
    @Field var streak: Int = 0
  }

  // MARK: - Build Timelapse

  private func buildTimelapse(options: TimelapseOptions) async throws -> String {
    let outputURL = URL(fileURLWithPath: options.outputPath)

    // Remove existing file if any
    try? FileManager.default.removeItem(at: outputURL)

    let width = options.width
    let height = options.height

    // AVAssetWriter setup
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

    let totalFrames = options.outputSeconds * Double(options.frameRate)
    let totalImages = options.photoUris.count

    guard totalImages > 0 else {
      throw NSError(domain: "TimelapseCreator", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "No photos provided"])
    }

    // Image cache: keep last loaded image to avoid reloading same index
    var cachedImageIndex = -1
    var cachedImage: UIImage?

    let frameDuration = CMTimeMake(value: 1, timescale: Int32(options.frameRate))

    for frameIdx in 0..<Int(totalFrames) {
      // Wait until the writer input is ready
      while !writerInput.isReadyForMoreMediaData {
        try await Task.sleep(nanoseconds: 10_000_000) // 10ms
      }

      // Map frame index to image index (linear)
      let imageIndex = min(
        Int(Double(frameIdx) / totalFrames * Double(totalImages)),
        totalImages - 1
      )

      // Load image if needed
      if imageIndex != cachedImageIndex {
        let uri = options.photoUris[imageIndex]
        let url = URL(fileURLWithPath: uri.replacingOccurrences(of: "file://", with: ""))
        guard let data = try? Data(contentsOf: url),
              let image = UIImage(data: data) else {
          throw NSError(domain: "TimelapseCreator", code: -3,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to load image at index \(imageIndex): \(uri)"])
        }
        cachedImage = image
        cachedImageIndex = imageIndex
      }

      guard let image = cachedImage else { continue }

      // Create pixel buffer
      guard let pixelBuffer = createPixelBuffer(
        from: image,
        width: width,
        height: height,
        mirror: options.mirrorHorizontally,
        overlayStyle: options.overlayStyle,
        overlayText: options.overlayText,
        streak: options.streak,
        frameIndex: frameIdx,
        totalFrames: Int(totalFrames),
        outputSeconds: options.outputSeconds,
        frameRate: options.frameRate
      ) else {
        continue
      }

      let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(frameIdx))
      adaptor.append(pixelBuffer, withPresentationTime: presentationTime)

      // Report progress every 10 frames
      if frameIdx % 10 == 0 {
        let progress = Double(frameIdx) / totalFrames
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
    mirror: Bool,
    overlayStyle: String,
    overlayText: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    outputSeconds: Double,
    frameRate: Int
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

    // Draw with optional mirror
    if mirror {
      context.saveGState()
      context.translateBy(x: outW, y: outH)
      context.scaleBy(x: -1, y: -1)
      context.draw(croppedCG, in: CGRect(x: 0, y: 0, width: outW, height: outH))
      context.restoreGState()
    } else {
      // CGContext has origin at bottom-left, flip Y
      context.translateBy(x: 0, y: outH)
      context.scaleBy(x: 1, y: -1)
      context.draw(croppedCG, in: CGRect(x: 0, y: 0, width: outW, height: outH))
    }

    // Draw overlay
    if overlayStyle != "none" && !overlayText.isEmpty {
      drawOverlay(
        context: context,
        width: outW,
        height: outH,
        style: overlayStyle,
        text: overlayText,
        streak: streak,
        frameIndex: frameIndex,
        totalFrames: totalFrames,
        outputSeconds: outputSeconds,
        frameRate: frameRate
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
    text: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    outputSeconds: Double,
    frameRate: Int
  ) {
    // Use UIGraphicsPushContext to enable NSString drawing in our CGContext
    // Reset transforms for overlay text (always drawn non-mirrored)
    context.saveGState()
    // Flip to UIKit coordinates for text drawing
    context.translateBy(x: 0, y: height)
    context.scaleBy(x: 1, y: -1)

    UIGraphicsPushContext(context)

    let fontSize: CGFloat = min(width, height) * 0.045
    let font = UIFont.systemFont(ofSize: fontSize, weight: .bold)
    let textColor = UIColor.white
    let shadowColor = UIColor.black.withAlphaComponent(0.6)

    let padding: CGFloat = 20
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

    // Drop shadow
    (text as NSString).draw(at: CGPoint(x: x + 1.5, y: y + 1.5), withAttributes: shadowAttrs)
    // Main text
    (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)

    UIGraphicsPopContext()
    context.restoreGState()
  }
}
