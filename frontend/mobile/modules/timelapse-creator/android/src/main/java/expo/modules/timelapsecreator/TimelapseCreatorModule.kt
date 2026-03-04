package expo.modules.timelapsecreator

import android.graphics.*
import android.media.*
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.ByteBuffer

// ── Records ──────────────────────────────────────────────────────────────────

class TimelapseOptions : Record {
  @Field val videoUri: String = ""
  @Field val outputPath: String = ""
  @Field val outputSeconds: Double = 30.0
  @Field val width: Int = 720
  @Field val height: Int = 1280
  @Field val frameRate: Int = 30
  @Field val bitRate: Int = 3_500_000
  @Field val overlayStyle: String = "none"
  @Field val overlayText: String = ""
  @Field val streak: Int = 0
  @Field val timerMode: String = "countdown"
  @Field val recordingSeconds: Double = 0.0
  @Field val goalSeconds: Double = 0.0
  @Field val cameraFacing: String = "front"
}

class OverlayOptions : Record {
  @Field val videoUri: String = ""
  @Field val outputPath: String = ""
  @Field val overlayStyle: String = "none"
  @Field val overlayText: String = ""
  @Field val streak: Int = 0
  @Field val recordingSeconds: Double = 0.0
  @Field val goalSeconds: Double = 0.0
  @Field val timerMode: String = "countdown"
  @Field val width: Int = 720
  @Field val height: Int = 1280
}

// ── Module ────────────────────────────────────────────────────────────────────

class TimelapseCreatorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TimelapseCreator")

    Events("onProgress")

    AsyncFunction("createTimelapse") { options: TimelapseOptions ->
      withContext(Dispatchers.IO) {
        buildTimelapse(options)
      }
    }

    AsyncFunction("applyOverlay") { options: OverlayOptions ->
      withContext(Dispatchers.IO) {
        buildOverlay(options)
      }
    }
  }

  // ── createTimelapse ──────────────────────────────────────────────────────

  private fun buildTimelapse(options: TimelapseOptions): String {
    val outputFile = File(options.outputPath.removePrefix("file://"))
    outputFile.parentFile?.mkdirs()
    if (outputFile.exists()) outputFile.delete()

    val inputPath = options.videoUri.removePrefix("file://")
    val width = options.width
    val height = options.height
    val frameRate = options.frameRate
    val totalFrames = (options.outputSeconds * frameRate).toInt()

    // 1. 소스 영상 정보 추출
    val retriever = MediaMetadataRetriever()
    retriever.setDataSource(inputPath)
    val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
      ?.toLongOrNull() ?: throw Exception("Cannot read video duration")
    val rotationDeg = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
      ?.toIntOrNull() ?: 0

    // 2. MediaCodec 인코더 설정
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, options.bitRate)
      setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }

    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    encoder.start()

    val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trackIndex = -1
    var muxerStarted = false

    val bufferInfo = MediaCodec.BufferInfo()
    val usPerFrame = 1_000_000L / frameRate

    try {
      for (frameIdx in 0 until totalFrames) {
        // 소스 영상에서 프레임 추출
        val videoTimeMs = (frameIdx.toLong() * durationMs / totalFrames)
        val bitmap = retriever.getFrameAtTime(
          videoTimeMs * 1000L,
          MediaMetadataRetriever.OPTION_CLOSEST_SYNC
        ) ?: continue

        // rotation 적용 + aspect-fill crop → 출력 크기로 렌더링
        val rotatedBitmap = rotateBitmap(bitmap, rotationDeg)
        val croppedBitmap = cropAndScale(rotatedBitmap, width, height)
        bitmap.recycle()
        if (rotatedBitmap !== bitmap) rotatedBitmap.recycle()

        // 오버레이 드로잉
        val canvas = Canvas(croppedBitmap)
        if (options.overlayStyle != "none") {
          drawOverlay(
            canvas = canvas,
            width = width.toFloat(),
            height = height.toFloat(),
            style = options.overlayStyle,
            streak = options.streak,
            frameIndex = frameIdx,
            totalFrames = totalFrames,
            timerMode = options.timerMode,
            recordingSeconds = options.recordingSeconds,
            overlayText = options.overlayText,
          )
        }

        // Bitmap → YUV420 → encoder
        val yuvData = bitmapToYuv420(croppedBitmap, width, height)
        croppedBitmap.recycle()

        val inputBufferIdx = encoder.dequeueInputBuffer(10_000L)
        if (inputBufferIdx >= 0) {
          val inputBuffer = encoder.getInputBuffer(inputBufferIdx)!!
          inputBuffer.clear()
          inputBuffer.put(yuvData)
          val pts = frameIdx.toLong() * usPerFrame
          encoder.queueInputBuffer(inputBufferIdx, 0, yuvData.size, pts, 0)
        }

        // drain encoder
        drainEncoder(encoder, muxer, bufferInfo, false) { idx ->
          trackIndex = idx
          muxerStarted = true
        }

        if (frameIdx % 10 == 0) {
          sendEvent("onProgress", mapOf("progress" to (frameIdx.toDouble() / totalFrames)))
        }
      }

      // EOS
      val inputBufferIdx = encoder.dequeueInputBuffer(10_000L)
      if (inputBufferIdx >= 0) {
        encoder.queueInputBuffer(inputBufferIdx, 0, 0, 0L, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      }
      drainEncoder(encoder, muxer, bufferInfo, true) { idx ->
        trackIndex = idx
        muxerStarted = true
      }

    } finally {
      retriever.release()
      encoder.stop()
      encoder.release()
      if (muxerStarted) muxer.stop()
      muxer.release()
    }

    sendEvent("onProgress", mapOf("progress" to 1.0))
    return options.outputPath
  }

  // ── applyOverlay ─────────────────────────────────────────────────────────

  private fun buildOverlay(options: OverlayOptions): String {
    // overlay가 none이면 원본 그대로 copy
    val inputPath = options.videoUri.removePrefix("file://")
    val outputPath = options.outputPath.removePrefix("file://")
    val outputFile = File(outputPath)
    outputFile.parentFile?.mkdirs()
    if (outputFile.exists()) outputFile.delete()

    if (options.overlayStyle == "none") {
      File(inputPath).copyTo(outputFile, overwrite = true)
      return options.outputPath
    }

    val width = options.width
    val height = options.height

    // decode → overlay → re-encode
    val extractor = MediaExtractor()
    extractor.setDataSource(inputPath)

    var videoTrackIdx = -1
    var inputFormat: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val fmt = extractor.getTrackFormat(i)
      if (fmt.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true) {
        videoTrackIdx = i
        inputFormat = fmt
        break
      }
    }
    if (videoTrackIdx < 0) throw Exception("No video track found")
    extractor.selectTrack(videoTrackIdx)

    val durationUs = inputFormat!!.getLong(MediaFormat.KEY_DURATION)
    val frameRate = try { inputFormat.getInteger(MediaFormat.KEY_FRAME_RATE) } catch (e: Exception) { 30 }
    val totalFrames = ((durationUs / 1_000_000.0) * frameRate).toInt().coerceAtLeast(1)

    // encoder
    val encFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, 4_000_000)
      setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    encoder.configure(encFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    encoder.start()

    val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxerTrackIdx = -1
    var muxerStarted = false
    val bufferInfo = MediaCodec.BufferInfo()
    val usPerFrame = 1_000_000L / frameRate

    // retriever for frame-by-frame extraction (simpler than full decode pipeline)
    val retriever = MediaMetadataRetriever()
    retriever.setDataSource(inputPath)
    val rotationDeg = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
      ?.toIntOrNull() ?: 0

    try {
      for (frameIdx in 0 until totalFrames) {
        val videoTimeUs = frameIdx.toLong() * usPerFrame
        val bitmap = retriever.getFrameAtTime(videoTimeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
          ?: continue

        val rotated = rotateBitmap(bitmap, rotationDeg)
        val cropped = cropAndScale(rotated, width, height)
        bitmap.recycle()
        if (rotated !== bitmap) rotated.recycle()

        val canvas = Canvas(cropped)
        drawOverlay(
          canvas = canvas,
          width = width.toFloat(),
          height = height.toFloat(),
          style = options.overlayStyle,
          streak = options.streak,
          frameIndex = frameIdx,
          totalFrames = totalFrames,
          timerMode = options.timerMode,
          recordingSeconds = options.recordingSeconds,
          overlayText = options.overlayText,
        )

        // watermark
        drawWatermark(canvas, width.toFloat(), height.toFloat())

        val yuv = bitmapToYuv420(cropped, width, height)
        cropped.recycle()

        val inputBufIdx = encoder.dequeueInputBuffer(10_000L)
        if (inputBufIdx >= 0) {
          val buf = encoder.getInputBuffer(inputBufIdx)!!
          buf.clear(); buf.put(yuv)
          encoder.queueInputBuffer(inputBufIdx, 0, yuv.size, frameIdx.toLong() * usPerFrame, 0)
        }

        drainEncoder(encoder, muxer, bufferInfo, false) { idx ->
          muxerTrackIdx = idx; muxerStarted = true
        }
      }

      val inputBufIdx = encoder.dequeueInputBuffer(10_000L)
      if (inputBufIdx >= 0) {
        encoder.queueInputBuffer(inputBufIdx, 0, 0, 0L, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      }
      drainEncoder(encoder, muxer, bufferInfo, true) { idx ->
        muxerTrackIdx = idx; muxerStarted = true
      }

    } finally {
      retriever.release()
      extractor.release()
      encoder.stop()
      encoder.release()
      if (muxerStarted) muxer.stop()
      muxer.release()
    }

    return options.outputPath
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** rotation degree(0/90/180/270)에 따라 Bitmap 회전 */
  private fun rotateBitmap(bitmap: Bitmap, degrees: Int): Bitmap {
    if (degrees == 0) return bitmap
    val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  /** aspect-fill center-crop → 출력 크기로 스케일 */
  private fun cropAndScale(src: Bitmap, outW: Int, outH: Int): Bitmap {
    val srcW = src.width.toFloat()
    val srcH = src.height.toFloat()
    val targetRatio = outW.toFloat() / outH
    val srcRatio = srcW / srcH

    val cropRect: Rect
    if (srcRatio > targetRatio) {
      // 소스가 더 넓음 → 좌우 crop
      val cropW = (srcH * targetRatio).toInt()
      val left = ((srcW - cropW) / 2).toInt()
      cropRect = Rect(left, 0, left + cropW, srcH.toInt())
    } else {
      // 소스가 더 좁음 → 상하 crop
      val cropH = (srcW / targetRatio).toInt()
      val top = ((srcH - cropH) / 2).toInt()
      cropRect = Rect(0, top, srcW.toInt(), top + cropH)
    }

    val cropped = Bitmap.createBitmap(src, cropRect.left, cropRect.top, cropRect.width(), cropRect.height())
    val scaled = Bitmap.createScaledBitmap(cropped, outW, outH, true)
    if (cropped !== src) cropped.recycle()
    return scaled
  }

  /** Bitmap(ARGB_8888) → YUV420 ByteArray */
  private fun bitmapToYuv420(bitmap: Bitmap, width: Int, height: Int): ByteArray {
    val argb = IntArray(width * height)
    bitmap.getPixels(argb, 0, width, 0, 0, width, height)

    val yuv = ByteArray(width * height * 3 / 2)
    val ySize = width * height
    var yIdx = 0; var uvIdx = ySize

    for (j in 0 until height) {
      for (i in 0 until width) {
        val pixel = argb[j * width + i]
        val r = (pixel shr 16) and 0xFF
        val g = (pixel shr 8) and 0xFF
        val b = pixel and 0xFF

        val y = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
        yuv[yIdx++] = y.coerceIn(0, 255).toByte()

        if (j % 2 == 0 && i % 2 == 0) {
          val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
          val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
          yuv[uvIdx++] = u.coerceIn(0, 255).toByte()
          yuv[uvIdx++] = v.coerceIn(0, 255).toByte()
        }
      }
    }
    return yuv
  }

  /** encoder output drain → muxer write */
  private fun drainEncoder(
    encoder: MediaCodec,
    muxer: MediaMuxer,
    bufferInfo: MediaCodec.BufferInfo,
    endOfStream: Boolean,
    onTrackAdded: (Int) -> Unit,
  ) {
    var trackIndex = -1
    while (true) {
      val outputBufIdx = encoder.dequeueOutputBuffer(bufferInfo, 10_000L)
      when {
        outputBufIdx == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) break
        }
        outputBufIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          trackIndex = muxer.addTrack(encoder.outputFormat)
          muxer.start()
          onTrackAdded(trackIndex)
        }
        outputBufIdx >= 0 -> {
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            encoder.releaseOutputBuffer(outputBufIdx, false)
            continue
          }
          if (bufferInfo.size > 0 && trackIndex >= 0) {
            val outputBuffer = encoder.getOutputBuffer(outputBufIdx)!!
            outputBuffer.position(bufferInfo.offset)
            outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
            muxer.writeSampleData(trackIndex, outputBuffer, bufferInfo)
          }
          encoder.releaseOutputBuffer(outputBufIdx, false)
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
      }
    }
  }

  // ── Overlay Drawing ───────────────────────────────────────────────────────

  private fun drawOverlay(
    canvas: Canvas,
    width: Float,
    height: Float,
    style: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    timerMode: String,
    recordingSeconds: Double,
    overlayText: String,
  ) {
    val fontSize = minOf(width, height) * 0.045f
    val padding = 20f
    val elapsed = if (totalFrames > 0) (frameIndex.toDouble() / totalFrames) * recordingSeconds else 0.0

    when (style) {
      "timer" -> {
        val displaySeconds = if (timerMode == "countdown") maxOf(0.0, recordingSeconds - elapsed) else elapsed
        drawText(canvas, formatTime(displaySeconds), fontSize, padding, width)
      }
      "progress" -> {
        val percent = if (recordingSeconds > 0) minOf(1.0, elapsed / recordingSeconds) else 0.0
        drawProgressBar(canvas, percent.toFloat(), padding, width, fontSize)
      }
      "streak" -> {
        drawText(canvas, "▸ $streak days streak", fontSize, padding, width)
      }
    }

    drawWatermark(canvas, width, height)
  }

  private fun drawText(canvas: Canvas, text: String, fontSize: Float, padding: Float, width: Float) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = fontSize
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      color = Color.WHITE
      textAlign = Paint.Align.RIGHT
    }
    val shadowPaint = Paint(paint).apply { color = Color.argb(153, 0, 0, 0) }
    val x = width - padding
    val y = padding + fontSize
    canvas.drawText(text, x + 1.5f, y + 1.5f, shadowPaint)
    canvas.drawText(text, x, y, paint)
  }

  private fun drawProgressBar(canvas: Canvas, percent: Float, padding: Float, width: Float, fontSize: Float) {
    val barW = width * 0.25f
    val barH = 8f
    val x = width - barW - padding
    val y = padding + fontSize * 0.5f

    // background
    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(102, 0, 0, 0) }
    canvas.drawRoundRect(x, y, x + barW, y + barH, barH / 2, barH / 2, bgPaint)

    // fill
    if (percent > 0f) {
      val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
      canvas.drawRoundRect(x, y, x + barW * percent, y + barH, barH / 2, barH / 2, fillPaint)
    }

    // percent text
    val pctText = "${(percent * 100).toInt()}%"
    val smallPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = fontSize * 0.7f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      color = Color.WHITE
      textAlign = Paint.Align.RIGHT
    }
    canvas.drawText(pctText, x + barW, y + barH + 4 + fontSize * 0.7f, smallPaint)
  }

  private fun drawWatermark(canvas: Canvas, width: Float, height: Float) {
    val wmFontSize = minOf(width, height) * 0.025f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = wmFontSize
      color = Color.argb(230, 255, 255, 255)
      typeface = Typeface.DEFAULT
    }
    canvas.drawText("FocusTimelapse", 12f, height - 12f, paint)
  }

  private fun formatTime(totalSeconds: Double): String {
    val s = totalSeconds.toInt()
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return "%02d:%02d:%02d".format(h, m, sec)
  }
}
