import ExpoModulesCore
import AVFoundation
import CoreGraphics
import UIKit
import QuartzCore

public class TimelapseCreatorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TimelapseCreator")

    Events("onProgress", "onDebugLog")

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
    @Field var overlayLayoutJson: String = "{}"
  }

  // MARK: - Overlay Layout (px 단위, JS buildScaledLayout에서 전달)
  struct OverlayWatermarkPx: Codable {
    let paddingLeft: Double
    let paddingBottom: Double
    let logoSize: Double
    let gap: Double
    let fontSize: Double
  }

  struct OverlayProgressPx: Codable {
    let paddingRight: Double
    let paddingTop: Double
    let fontSize: Double
    let labelGap: Double
    let barWidth: Double
    let barHeight: Double
  }

  struct OverlayTimerPx: Codable {
    let paddingRight: Double
    let paddingTop: Double
    let fontSize: Double
  }

  struct OverlayStreakPx: Codable {
    let paddingRight: Double
    let paddingTop: Double
    let fontSize: Double
  }

  struct OverlayLayoutPx: Codable {
    let watermark: OverlayWatermarkPx
    let progress: OverlayProgressPx
    let timer: OverlayTimerPx
    let streak: OverlayStreakPx
  }

  private func parseOverlayLayout(_ json: String, videoWidth: CGFloat) -> OverlayLayoutPx? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(OverlayLayoutPx.self, from: data)
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
    // 디버깅용: 0=순수export, 1=videoComposition추가, 2=transform추가, 3=crop추가(기본)
    @Field var debugStep: Int = 3
  }

  // MARK: - Build Timelapse

  // MARK: - Apply Overlay (AVVideoCompositionCoreAnimationTool — single-pass CALayer overlay)

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

    let outW = CGFloat(options.width)
    let outH = CGFloat(options.height)
    let renderSize = CGSize(width: outW, height: outH)

    // ── Asset 로드 ──
    let asset = AVAsset(url: inputURL)
    let duration = try await asset.load(.duration)
    let durationSeconds = CMTimeGetSeconds(duration)
    guard durationSeconds > 0 else {
      throw NSError(domain: "TimelapseCreator", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "Video has zero duration"])
    }

    let videoTracks = try await asset.loadTracks(withMediaType: .video)
    guard let videoTrack = videoTracks.first else {
      throw NSError(domain: "TimelapseCreator", code: -3,
                    userInfo: [NSLocalizedDescriptionKey: "No video track found"])
    }

    // ── AVMutableComposition ──
    let composition = AVMutableComposition()
    guard let compTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw NSError(domain: "TimelapseCreator", code: -5,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to create composition track"])
    }
    try compTrack.insertTimeRange(
      CMTimeRange(start: .zero, duration: duration),
      of: videoTrack,
      at: .zero
    )

    // ── CALayer 구조 (bottom-left origin) ──
    let parentLayer = CALayer()
    parentLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.isGeometryFlipped = true // UIKit-style top-left origin

    let videoLayer = CALayer()
    videoLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.addSublayer(videoLayer)

    let overlayLayer = CALayer()
    overlayLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.addSublayer(overlayLayer)

    // ── overlayLayoutJson 파싱 ──
    let layout: OverlayLayoutPx
    if let parsed = parseOverlayLayout(options.overlayLayoutJson, videoWidth: outW) {
      layout = parsed
    } else {
      // fallback: compute from 390pt reference
      let scale = Double(outW) / 390.0
      layout = OverlayLayoutPx(
        watermark: OverlayWatermarkPx(paddingLeft: 16*scale, paddingBottom: 16*scale, logoSize: 28*scale, gap: 8*scale, fontSize: 22*scale),
        progress: OverlayProgressPx(paddingRight: 16*scale, paddingTop: 16*scale, fontSize: 24*scale, labelGap: 8*scale, barWidth: 140*scale, barHeight: 11*scale),
        timer: OverlayTimerPx(paddingRight: 16*scale, paddingTop: 16*scale, fontSize: 24*scale),
        streak: OverlayStreakPx(paddingRight: 16*scale, paddingTop: 16*scale, fontSize: 24*scale)
      )
    }

    // ── 오버레이 CALayer 구성 ──
    buildCAOverlay(
      on: overlayLayer,
      width: outW,
      height: outH,
      style: options.overlayStyle,
      streak: options.streak,
      timerMode: options.timerMode,
      recordingSeconds: options.recordingSeconds,
      goalSeconds: options.goalSeconds,
      logoPath: options.logoPath,
      videoDuration: durationSeconds,
      layout: layout
    )

    // ── AVMutableVideoComposition with CoreAnimationTool ──
    let videoPreferredTransform = try await videoTrack.load(.preferredTransform)
    let nominalFrameRate = try await videoTrack.load(.nominalFrameRate)
    let fps = nominalFrameRate > 0 ? Int32(nominalFrameRate) : 30

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTimeMake(value: 1, timescale: fps)
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
      postProcessingAsVideoLayer: videoLayer,
      in: parentLayer
    )

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compTrack)
    layerInstruction.setTransform(videoPreferredTransform, at: .zero)
    instruction.layerInstructions = [layerInstruction]
    videoComposition.instructions = [instruction]

    // ── Export ──
    guard let exportSession = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetHighestQuality
    ) else {
      throw NSError(domain: "TimelapseCreator", code: -6,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
    }
    exportSession.videoComposition = videoComposition
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.shouldOptimizeForNetworkUse = true

    self.sendEvent("onProgress", ["progress": 0.0])
    let progressTask = Task {
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 100_000_000)
        self.sendEvent("onProgress", ["progress": Double(exportSession.progress)])
      }
    }

    await exportSession.export()
    progressTask.cancel()

    guard exportSession.status == .completed else {
      throw NSError(domain: "TimelapseCreator", code: -4,
                    userInfo: [NSLocalizedDescriptionKey: exportSession.error?.localizedDescription ?? "Export failed"])
    }

    self.sendEvent("onProgress", ["progress": 1.0])
    return outputURL.absoluteString
  }

  // MARK: - CALayer Overlay Builder (UIGraphicsImageRenderer)

  private func buildCAOverlay(
    on layer: CALayer,
    width: CGFloat, height: CGFloat,
    style: String, streak: Int,
    timerMode: String, recordingSeconds: Double,
    goalSeconds: Double, logoPath: String,
    videoDuration: Double, layout: OverlayLayoutPx
  ) {
    if style == "pure" { return }
    let size = CGSize(width: width, height: height)

    // ── 1. Watermark (static) ──
    let wmImage = renderWatermark(size: size, logoPath: logoPath, layout: layout)
    let wmLayer = CALayer()
    wmLayer.frame = CGRect(origin: .zero, size: size)
    wmLayer.contents = wmImage?.cgImage
    wmLayer.contentsGravity = .resize
    layer.addSublayer(wmLayer)

    // ── 2. Animated overlay ──
    switch style {
    case "timer":
      addUIKitTimerLayer(to: layer, size: size, timerMode: timerMode,
        recordingSeconds: recordingSeconds, videoDuration: videoDuration, layout: layout)
    case "progress":
      addUIKitProgressLayer(to: layer, size: size,
        recordingSeconds: recordingSeconds, goalSeconds: goalSeconds,
        videoDuration: videoDuration, layout: layout)
    case "streak":
      let sImg = renderStreakImage(size: size, streak: streak, layout: layout)
      let sLayer = CALayer()
      sLayer.frame = CGRect(origin: .zero, size: size)
      sLayer.contents = sImg?.cgImage
      sLayer.contentsGravity = .resize
      layer.addSublayer(sLayer)
    default:
      break
    }
  }

  // MARK: - UIGraphicsImageRenderer Helpers

  private func renderWatermark(size: CGSize, logoPath: String, layout: OverlayLayoutPx) -> UIImage? {
    let wm = layout.watermark
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { ctx in
      // load logo
      let logoImage: UIImage?
      if !logoPath.isEmpty {
        let path = logoPath.replacingOccurrences(of: "file://", with: "")
        logoImage = UIImage(contentsOfFile: path)
      } else {
        logoImage = nil
      }
      let logoSize = CGFloat(wm.logoSize)
      let paddingLeft = CGFloat(wm.paddingLeft)
      let paddingBottom = CGFloat(wm.paddingBottom)
      let gap = CGFloat(wm.gap)
      let fontSize = CGFloat(wm.fontSize)
      let font = UIFont.boldSystemFont(ofSize: fontSize)
      let textAttrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: UIColor.white.withAlphaComponent(0.9)
      ]
      let text = "FocusTimelapse"
      let textSize = (text as NSString).size(withAttributes: textAttrs)
      let totalH = max(logoSize, textSize.height)
      let baseY = size.height - paddingBottom - totalH

      // draw logo
      if let logo = logoImage {
        let logoRect = CGRect(x: paddingLeft, y: baseY + (totalH - logoSize) / 2, width: logoSize, height: logoSize)
        logo.draw(in: logoRect)
      }

      // draw text
      let textX = logoImage != nil ? (paddingLeft + logoSize + gap) : paddingLeft
      let textY = baseY + (totalH - textSize.height) / 2
      (text as NSString).draw(at: CGPoint(x: textX, y: textY), withAttributes: textAttrs)
    }
  }

  private func renderStreakImage(size: CGSize, streak: Int, layout: OverlayLayoutPx) -> UIImage? {
    let s = layout.streak
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      let font = UIFont.boldSystemFont(ofSize: CGFloat(s.fontSize))
      let text = "▸ \(streak) day\(streak != 1 ? "s" : "") streak"
      let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
      let shadowAttrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.black.withAlphaComponent(0.6)]
      let textSize = (text as NSString).size(withAttributes: attrs)
      let x = size.width - CGFloat(s.paddingRight) - textSize.width
      let y = CGFloat(s.paddingTop)
      (text as NSString).draw(at: CGPoint(x: x+1.5, y: y+1.5), withAttributes: shadowAttrs)
      (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
    }
  }

  private func addUIKitTimerLayer(
    to layer: CALayer, size: CGSize,
    timerMode: String, recordingSeconds: Double,
    videoDuration: Double, layout: OverlayLayoutPx
  ) {
    let t = layout.timer
    let font = UIFont.boldSystemFont(ofSize: CGFloat(t.fontSize))
    let totalSteps = max(1, Int(videoDuration))
    var images: [CGImage] = []
    var keyTimes: [NSNumber] = []

    for i in 0...totalSteps {
      let progress = Double(i) / Double(totalSteps)
      let elapsed = progress * recordingSeconds
      let displaySeconds = timerMode == "countdown" ? max(0, recordingSeconds - elapsed) : elapsed
      let text = formatTime(displaySeconds)
      let renderer = UIGraphicsImageRenderer(size: size)
      let img = renderer.image { _ in
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
        let shadowAttrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.black.withAlphaComponent(0.6)]
        let textSize = (text as NSString).size(withAttributes: attrs)
        let x = size.width - CGFloat(t.paddingRight) - textSize.width
        let y = CGFloat(t.paddingTop)
        (text as NSString).draw(at: CGPoint(x: x+1.5, y: y+1.5), withAttributes: shadowAttrs)
        (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
      }
      if let cgImg = img.cgImage { images.append(cgImg) }
      keyTimes.append(NSNumber(value: progress))
    }

    let timerLayer = CALayer()
    timerLayer.frame = CGRect(origin: .zero, size: size)
    timerLayer.contents = images.first
    timerLayer.contentsGravity = .resize

    let anim = CAKeyframeAnimation(keyPath: "contents")
    anim.values = images
    anim.keyTimes = keyTimes
    anim.duration = videoDuration
    anim.calculationMode = .discrete
    anim.isRemovedOnCompletion = false
    anim.fillMode = .forwards
    anim.beginTime = AVCoreAnimationBeginTimeAtZero

    timerLayer.add(anim, forKey: "timerAnimation")
    layer.addSublayer(timerLayer)
  }

  private func addUIKitProgressLayer(
    to layer: CALayer, size: CGSize,
    recordingSeconds: Double, goalSeconds: Double,
    videoDuration: Double, layout: OverlayLayoutPx
  ) {
    let p = layout.progress
    let font = UIFont.boldSystemFont(ofSize: CGFloat(p.fontSize))
    let totalSteps = max(1, Int(videoDuration))
    let finalPercent = goalSeconds > 0 ? min(1.0, recordingSeconds / goalSeconds) : 1.0
    var images: [CGImage] = []
    var keyTimes: [NSNumber] = []

    let goalText = formatGoalText(goalSeconds)
    let barMaxWidth = CGFloat(p.barWidth)
    let barHeight = CGFloat(p.barHeight)
    let labelGap = CGFloat(p.labelGap)
    let paddingRight = CGFloat(p.paddingRight)
    let paddingTop = CGFloat(p.paddingTop)

    for i in 0...totalSteps {
      let progress = Double(i) / Double(totalSteps)
      let currentPercent = finalPercent * progress
      let fillWidth = barMaxWidth * CGFloat(currentPercent)
      let renderer = UIGraphicsImageRenderer(size: size)
      let img = renderer.image { _ in
        // goal label
        let labelAttrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white.withAlphaComponent(0.9)]
        let shadowAttrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.black.withAlphaComponent(0.5)]
        let labelSize = (goalText as NSString).size(withAttributes: labelAttrs)
        let barX = size.width - paddingRight - barMaxWidth
        let labelX = barX - labelGap - labelSize.width
        let topY = paddingTop
        (goalText as NSString).draw(at: CGPoint(x: labelX+1, y: topY+1), withAttributes: shadowAttrs)
        (goalText as NSString).draw(at: CGPoint(x: labelX, y: topY), withAttributes: labelAttrs)
        // bar background
        let barY = topY + (labelSize.height - barHeight) / 2
        UIColor.black.withAlphaComponent(0.4).setFill()
        UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barMaxWidth, height: barHeight), cornerRadius: barHeight/2).fill()
        // bar fill
        if fillWidth > 0 {
          UIColor.white.setFill()
          UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: fillWidth, height: barHeight), cornerRadius: barHeight/2).fill()
        }
      }
      if let cgImg = img.cgImage { images.append(cgImg) }
      keyTimes.append(NSNumber(value: progress))
    }

    let progressLayer = CALayer()
    progressLayer.frame = CGRect(origin: .zero, size: size)
    progressLayer.contents = images.first
    progressLayer.contentsGravity = .resize

    let anim = CAKeyframeAnimation(keyPath: "contents")
    anim.values = images
    anim.keyTimes = keyTimes
    anim.duration = videoDuration
    anim.calculationMode = .discrete
    anim.isRemovedOnCompletion = false
    anim.fillMode = .forwards
    anim.beginTime = AVCoreAnimationBeginTimeAtZero

    progressLayer.add(anim, forKey: "progressAnimation")
    layer.addSublayer(progressLayer)
  }

  /// JS formatGoalLabel()과 동일한 규칙:
  ///   1 hr / 2 hrs  (시간 단수복수)
  ///   1 min / 2 mins (분 단수복수)
  ///   1 hr 30 mins  (시간+분 조합)
  private func formatGoalText(_ goalSeconds: Double) -> String {
    let totalMins = Int(goalSeconds / 60)
    let h = totalMins / 60
    let m = totalMins % 60
    if h > 0 && m > 0 {
      let hrLabel = h == 1 ? "1 hr" : "\(h) hrs"
      let minLabel = m == 1 ? "1 min" : "\(m) mins"
      return "\(hrLabel) \(minLabel)"
    }
    if h > 0 {
      return h == 1 ? "1 hr" : "\(h) hrs"
    }
    return m == 1 ? "1 min" : "\(m) mins"
  }

  // MARK: - Build Timelapse (AVMutableComposition + scaleTimeRange + AVAssetExportSession)
  // Phase 1: 랜덤 seek 방식(AVAssetImageGenerator)을 제거하고
  //          AVFoundation 내부 최적화(순차 decode + HW 가속)를 활용.
  //          4시간 영상 기준 10~30분 → 1~3분으로 단축.

  private func buildTimelapse(options: TimelapseOptions) async throws -> String {
    await MainActor.run { UIApplication.shared.isIdleTimerDisabled = true }
    defer { DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false } }

    let outputURL = URL(fileURLWithPath: options.outputPath.replacingOccurrences(of: "file://", with: ""))
    try? FileManager.default.removeItem(at: outputURL)

    let videoURL = URL(fileURLWithPath: options.videoUri.replacingOccurrences(of: "file://", with: ""))
    let asset = AVAsset(url: videoURL)

    // 1. 원본 정보 로드
    let sourceDuration = try await asset.load(.duration)
    let sourceDurationSeconds = CMTimeGetSeconds(sourceDuration)
    guard sourceDurationSeconds > 0 else {
      throw NSError(domain: "TimelapseCreator", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "Video has zero duration"])
    }

    let videoTracks = try await asset.loadTracks(withMediaType: .video)
    guard let sourceTrack = videoTracks.first else {
      throw NSError(domain: "TimelapseCreator", code: -3,
                    userInfo: [NSLocalizedDescriptionKey: "No video track found"])
    }
    let preferredTransform = try await sourceTrack.load(.preferredTransform)
    let naturalSize = try await sourceTrack.load(.naturalSize)

    // ── 디버그 로그: 실제 값 확인 (onDebugLog 이벤트로 JS에 전달) ──
    let displaySize = naturalSize.applying(preferredTransform)
    let debugLog = """
    naturalSize: \(naturalSize.width) x \(naturalSize.height)
    preferredTransform: a=\(preferredTransform.a) b=\(preferredTransform.b) c=\(preferredTransform.c) d=\(preferredTransform.d) tx=\(preferredTransform.tx) ty=\(preferredTransform.ty)
    displaySize (after transform): \(abs(displaySize.width)) x \(abs(displaySize.height))
    options: width=\(options.width) height=\(options.height) cameraFacing=\(options.cameraFacing)
    """
    self.sendEvent("onDebugLog", ["log": debugLog])

    // 2. AVMutableComposition 생성 — 원본 전체를 삽입
    let composition = AVMutableComposition()
    guard let compTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw NSError(domain: "TimelapseCreator", code: -5,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to create composition track"])
    }
    try compTrack.insertTimeRange(
      CMTimeRange(start: .zero, duration: sourceDuration),
      of: sourceTrack,
      at: .zero
    )
    // preferredTransform을 compTrack에도 설정 → propertiesOf가 rotation 인식
    compTrack.preferredTransform = preferredTransform

    // 3. scaleTimeRange
    let outputDuration = CMTime(seconds: options.outputSeconds, preferredTimescale: 600)
    compTrack.scaleTimeRange(
      CMTimeRange(start: .zero, duration: sourceDuration),
      toDuration: outputDuration
    )

    // ── debugStep 분기 ──
    // 0: videoComposition 없이 순수 export (기준 테스트)
    // 1: videoComposition 추가 (frameDuration/renderSize만, transform 없음)
    // 2: transform 추가 (crop 없음)
    // 3: transform + crop (전체 로직, 기본값)

    let exportSession: AVAssetExportSession

    if options.debugStep == 0 {
      // ── Step 0: 순수 export — videoComposition 없음 ──
      guard let session = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPresetPassthrough  // 재인코딩 없이 그대로
      ) else {
        throw NSError(domain: "TimelapseCreator", code: -6,
                      userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
      }
      session.outputURL = outputURL
      session.outputFileType = .mp4
      exportSession = session

    } else {
      // ── Step 1~3: videoComposition 사용 ──
      let videoComposition = AVMutableVideoComposition()
      videoComposition.frameDuration = CMTimeMake(value: 1, timescale: Int32(options.frameRate))

      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: .zero, duration: outputDuration)
      let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compTrack)

      if options.debugStep == 1 {
        // Step 1: AVFoundation 자동 설정 (propertiesOf) — rotation/scale 자동 처리
        // renderSize만 출력 해상도로 오버라이드
        let autoComposition = AVMutableVideoComposition(propertiesOf: composition)
        autoComposition.frameDuration = CMTimeMake(value: 1, timescale: Int32(options.frameRate))
        autoComposition.renderSize = CGSize(width: CGFloat(options.width), height: CGFloat(options.height))

        guard let session = AVAssetExportSession(
          asset: composition,
          presetName: AVAssetExportPresetHighestQuality
        ) else {
          throw NSError(domain: "TimelapseCreator", code: -6,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
        }
        session.videoComposition = autoComposition
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        self.sendEvent("onProgress", ["progress": 0.0])
        let pt = Task { while !Task.isCancelled { try? await Task.sleep(nanoseconds: 100_000_000); self.sendEvent("onProgress", ["progress": Double(session.progress)]) } }
        await session.export()
        pt.cancel()
        guard session.status == .completed else {
          throw NSError(domain: "TimelapseCreator", code: -4, userInfo: [NSLocalizedDescriptionKey: session.error?.localizedDescription ?? "Export failed"])
        }
        self.sendEvent("onProgress", ["progress": 1.0])
        return outputURL.absoluteString

      } else if options.debugStep == 2 {
        // Step 2: propertiesOf로 transform 자동 처리 + aspect-fill crop
        // 1) propertiesOf로 rotation/transform 자동 계산
        let autoComposition = AVMutableVideoComposition(propertiesOf: composition)
        autoComposition.frameDuration = CMTimeMake(value: 1, timescale: Int32(options.frameRate))

        // 2) propertiesOf renderSize는 rotation 미반영(1920x1080 landscape 그대로)
        //    → preferredTransform 적용 후 실제 portrait 크기를 src 기준으로 직접 계산
        let autoRenderSize = autoComposition.renderSize
        let dispSize = naturalSize.applying(preferredTransform)
        let srcW = abs(dispSize.width)    // 1080 (portrait width)
        let srcH = abs(dispSize.height)   // 1920 (portrait height)
        let outW = CGFloat(options.width)
        let outH = CGFloat(options.height)
        self.sendEvent("onDebugLog", ["log": "propertiesOf renderSize: \(autoRenderSize.width) x \(autoRenderSize.height)\ndisplaySize (used as src): \(srcW) x \(srcH)\noutput: \(outW) x \(outH)"])

        // 3) aspect-fill: src를 out에 꽉 채우는 scale
        let scale = max(outW / srcW, outH / srcH)
        let scaledW = srcW * scale
        let scaledH = srcH * scale
        // 중앙 crop offset
        let cropX = (scaledW - outW) / 2
        let cropY = (scaledH - outH) / 2

        // 4) preferredTransform 기반으로 새 layerInstruction 구성
        //    propertiesOf의 기존 instruction 대신 직접 계산 (getTransformRamp 불안정 회피)
        //    preferredTransform(rotation) → scale → crop 순서로 적용
        let newInstruction = AVMutableVideoCompositionInstruction()
        newInstruction.timeRange = CMTimeRange(start: .zero, duration: outputDuration)
        let newLayer = AVMutableVideoCompositionLayerInstruction(assetTrack: compTrack)

        // preferredTransform: rotation만 포함 (tx/ty는 portrait 기준 origin 보정 필요)
        // displaySize 기준으로 origin이 (0,0)이 되도록 translation 보정
        // preferredTransform 적용 후 영상이 화면 밖으로 나가지 않도록 보정
        // raw 영상의 네 꼭짓점을 transform 적용 후 최소 x, y 계산
        let rawW = naturalSize.width
        let rawH = naturalSize.height
        let corners = [
          CGPoint(x: 0,    y: 0),
          CGPoint(x: rawW, y: 0),
          CGPoint(x: 0,    y: rawH),
          CGPoint(x: rawW, y: rawH),
        ].map { $0.applying(preferredTransform) }
        let minX = corners.map { $0.x }.min() ?? 0
        let minY = corners.map { $0.y }.min() ?? 0

        var t = preferredTransform
        // 최소 좌표가 (0,0)이 되도록 이동
        t = t.concatenating(CGAffineTransform(translationX: -minX, y: -minY))
        // scale + crop
        t = t.concatenating(CGAffineTransform(scaleX: scale, y: scale))
        t = t.concatenating(CGAffineTransform(translationX: -cropX, y: -cropY))
        newLayer.setTransform(t, at: .zero)
        newInstruction.layerInstructions = [newLayer]
        autoComposition.instructions = [newInstruction]

        // 5) renderSize를 출력 해상도로 교체
        autoComposition.renderSize = CGSize(width: outW, height: outH)

        guard let session = AVAssetExportSession(
          asset: composition,
          presetName: AVAssetExportPresetHighestQuality
        ) else {
          throw NSError(domain: "TimelapseCreator", code: -6,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
        }
        session.videoComposition = autoComposition
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        self.sendEvent("onProgress", ["progress": 0.0])
        let pt2 = Task { while !Task.isCancelled { try? await Task.sleep(nanoseconds: 100_000_000); self.sendEvent("onProgress", ["progress": Double(session.progress)]) } }
        await session.export()
        pt2.cancel()
        guard session.status == .completed else {
          throw NSError(domain: "TimelapseCreator", code: -4, userInfo: [NSLocalizedDescriptionKey: session.error?.localizedDescription ?? "Export failed"])
        }
        self.sendEvent("onProgress", ["progress": 1.0])
        return outputURL.absoluteString

      } else {
        // Step 3 (기본): transform + aspect-fill crop to output resolution
        let outW = CGFloat(options.width)
        let outH = CGFloat(options.height)
        videoComposition.renderSize = CGSize(width: outW, height: outH)

        let rawW = naturalSize.width
        let rawH = naturalSize.height
        let displaySize = naturalSize.applying(preferredTransform)
        let dispW = abs(displaySize.width)
        let dispH = abs(displaySize.height)

        // aspect-fill scale
        let scale = max(outW / dispW, outH / dispH)
        let scaledW = dispW * scale
        let scaledH = dispH * scale
        let offsetX = (scaledW - outW) / 2
        let offsetY = (scaledH - outH) / 2

        var t = preferredTransform
        let origin = CGPoint.zero.applying(t)
        t = t.concatenating(CGAffineTransform(translationX: -origin.x, y: -origin.y))
        t = t.concatenating(CGAffineTransform(scaleX: scale, y: scale))
        t = t.concatenating(CGAffineTransform(translationX: -offsetX, y: -offsetY))
        layerInstruction.setTransform(t, at: .zero)
        instruction.layerInstructions = [layerInstruction]
        videoComposition.instructions = [instruction]
      }

      guard let session = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPresetHighestQuality
      ) else {
        throw NSError(domain: "TimelapseCreator", code: -6,
                      userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
      }
      session.videoComposition = videoComposition
      session.outputURL = outputURL
      session.outputFileType = .mp4
      session.shouldOptimizeForNetworkUse = true
      exportSession = session
    }

    // 진행률 폴링
    self.sendEvent("onProgress", ["progress": 0.0])
    let progressTask = Task {
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 100_000_000)
        let p = Double(exportSession.progress)
        self.sendEvent("onProgress", ["progress": p])
      }
    }

    await exportSession.export()
    progressTask.cancel()

    guard exportSession.status == .completed else {
      let errMsg = exportSession.error?.localizedDescription ?? "Export failed"
      throw NSError(domain: "TimelapseCreator", code: -4,
                    userInfo: [NSLocalizedDescriptionKey: errMsg])
    }

    self.sendEvent("onProgress", ["progress": 1.0])
    // expo-video는 file:// prefix 필요 → absoluteString 반환
    return outputURL.absoluteString
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

    // 입력 영상은 이미 buildTimelapse에서 출력 해상도로 crop 완료 → 그대로 full-fill
    let drawRect = CGRect(x: 0, y: 0, width: outW, height: outH)

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
      // 영상 재생 진행에 따라 0 → (recordingSeconds/goalSeconds) 로 채워짐
      let finalPercent = goalSeconds > 0 ? min(1.0, recordingSeconds / goalSeconds) : 1.0
      let playbackProgress = totalFrames > 0 ? Double(frameIndex) / Double(totalFrames) : 0
      let percent = finalPercent * playbackProgress
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
    let barHeight: CGFloat = 10

    // 목표 시간 텍스트 — formatGoalText()로 통일 (JS formatGoalLabel과 동일 규칙)
    let goalText = formatGoalText(goalSeconds)

    let labelAttrs: [NSAttributedString.Key: Any] = [
      .font: UIFont.boldSystemFont(ofSize: fontSize),
      .foregroundColor: UIColor.white.withAlphaComponent(0.9),
    ]
    let shadowAttrs: [NSAttributedString.Key: Any] = [
      .font: UIFont.boldSystemFont(ofSize: fontSize),
      .foregroundColor: UIColor.black.withAlphaComponent(0.5),
    ]
    let labelSize = (goalText as NSString).size(withAttributes: labelAttrs)

    let labelGap: CGFloat = 12
    // 전체 레이아웃: [padding] [라벨] [gap] [바→우측끝-padding]
    let y = padding
    let textX = padding
    let barX = textX + labelSize.width + labelGap
    let barWidth = width - barX - padding  // 우측 끝까지

    // 라벨 그림자 + 본문
    (goalText as NSString).draw(at: CGPoint(x: textX + 1, y: y + 1), withAttributes: shadowAttrs)
    (goalText as NSString).draw(at: CGPoint(x: textX, y: y), withAttributes: labelAttrs)

    // 바: 라벨 세로 중앙 정렬
    let barY = y + (labelSize.height - barHeight) / 2

    // Background
    UIColor.black.withAlphaComponent(0.35).setFill()
    UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barWidth, height: barHeight), cornerRadius: barHeight / 2).fill()

    // Fill
    let fillWidth = barWidth * CGFloat(percent)
    if fillWidth > 0 {
      UIColor.white.setFill()
      UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: fillWidth, height: barHeight), cornerRadius: barHeight / 2).fill()
    }
  }
}
