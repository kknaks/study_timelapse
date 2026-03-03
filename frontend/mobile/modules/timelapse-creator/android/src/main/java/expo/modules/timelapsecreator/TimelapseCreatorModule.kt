package expo.modules.timelapsecreator

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.view.Surface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileInputStream
import kotlin.math.min
import kotlin.math.roundToInt
import androidx.exifinterface.media.ExifInterface

class TimelapseOptions : Record {
  @Field val photoUris: List<String> = emptyList()
  @Field val outputPath: String = ""
  @Field val outputSeconds: Double = 30.0
  @Field val width: Int = 720
  @Field val height: Int = 1280
  @Field val frameRate: Int = 30
  @Field val bitRate: Int = 3_500_000
  @Field val mirrorHorizontally: Boolean = false
  @Field val overlayStyle: String = "none"
  @Field val overlayText: String = ""
  @Field val streak: Int = 0
  @Field val timerMode: String = "countdown"
  @Field val recordingSeconds: Double = 0.0
  @Field val goalSeconds: Double = 0.0
}

class TimelapseCreatorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TimelapseCreator")

    Events("onProgress")

    AsyncFunction("createTimelapse") { options: TimelapseOptions, promise: Promise ->
      Thread {
        try {
          val result = buildTimelapse(options)
          promise.resolve(result)
        } catch (e: Exception) {
          promise.reject(CodedException("ERR_TIMELAPSE", e.message ?: "Unknown error", e))
        }
      }.start()
    }
  }

  private fun buildTimelapse(options: TimelapseOptions): String {
    val width = options.width
    val height = options.height
    val totalFrames = (options.outputSeconds * options.frameRate).toInt()
    val totalImages = options.photoUris.size

    if (totalImages == 0) {
      throw Exception("No photos provided")
    }

    // Remove existing file
    val cleanOutputPath = options.outputPath.removePrefix("file://")
    val outputFile = File(cleanOutputPath)
    if (outputFile.exists()) outputFile.delete()

    // Setup MediaCodec encoder
    val mimeType = MediaFormat.MIMETYPE_VIDEO_AVC
    val format = MediaFormat.createVideoFormat(mimeType, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, options.bitRate)
      setInteger(MediaFormat.KEY_FRAME_RATE, options.frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }

    val encoder = MediaCodec.createEncoderByType(mimeType)
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

    val inputSurface: Surface = encoder.createInputSurface()
    encoder.start()

    val muxer = MediaMuxer(cleanOutputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trackIndex = -1
    var muxerStarted = false

    val bufferInfo = MediaCodec.BufferInfo()

    // Image cache
    var cachedImageIndex = -1
    var cachedBitmap: Bitmap? = null

    // Overlay paint
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = min(width, height) * 0.045f
      isFakeBoldText = true
    }
    val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(153, 0, 0, 0)
      textSize = min(width, height) * 0.045f
      isFakeBoldText = true
    }

    try {
      for (frameIdx in 0 until totalFrames) {
        // Map frame index to image index
        val imageIndex = min(
          (frameIdx.toDouble() / totalFrames * totalImages).toInt(),
          totalImages - 1
        )

        // Load bitmap if needed
        if (imageIndex != cachedImageIndex) {
          cachedBitmap?.recycle()
          val uri = options.photoUris[imageIndex]
          val path = uri.removePrefix("file://")
          val rawBitmap = BitmapFactory.decodeStream(FileInputStream(path))
            ?: throw Exception("Failed to load image at index $imageIndex: $uri")
          cachedBitmap = applyExifRotation(rawBitmap, path)
          cachedImageIndex = imageIndex
        }

        val bitmap = cachedBitmap ?: continue

        // Draw frame onto input surface
        val canvas: Canvas = inputSurface.lockHardwareCanvas()
        canvas.drawColor(Color.BLACK)

        drawCenterCrop(canvas, bitmap, width, height, options.mirrorHorizontally)

        // Draw overlay
        if (options.overlayStyle != "none") {
          drawOverlay(
            canvas, width, height,
            options.overlayStyle, options.streak,
            frameIdx, totalFrames,
            options.timerMode, options.recordingSeconds, options.goalSeconds,
            textPaint, shadowPaint
          )
        }

        inputSurface.unlockCanvasAndPost(canvas)

        // Drain encoder
        drainEncoder(encoder, bufferInfo, muxer, trackIndex, muxerStarted).let { (ti, ms) ->
          trackIndex = ti
          muxerStarted = ms
        }

        // Report progress every 10 frames
        if (frameIdx % 10 == 0) {
          val progress = frameIdx.toDouble() / totalFrames
          sendEvent("onProgress", mapOf("progress" to progress))
        }
      }

      // Signal end of stream
      encoder.signalEndOfInputStream()

      // Drain remaining
      var draining = true
      while (draining) {
        val outIndex = encoder.dequeueOutputBuffer(bufferInfo, 10_000)
        when {
          outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            if (!muxerStarted) {
              trackIndex = muxer.addTrack(encoder.outputFormat)
              muxer.start()
              muxerStarted = true
            }
          }
          outIndex >= 0 -> {
            val encodedData = encoder.getOutputBuffer(outIndex) ?: continue
            if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
              bufferInfo.size = 0
            }
            if (bufferInfo.size > 0 && muxerStarted) {
              encodedData.position(bufferInfo.offset)
              encodedData.limit(bufferInfo.offset + bufferInfo.size)
              muxer.writeSampleData(trackIndex, encodedData, bufferInfo)
            }
            encoder.releaseOutputBuffer(outIndex, false)
            if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
              draining = false
            }
          }
          else -> {
            // INFO_TRY_AGAIN_LATER — keep draining
          }
        }
      }

      sendEvent("onProgress", mapOf("progress" to 1.0))
    } finally {
      cachedBitmap?.recycle()
      encoder.stop()
      encoder.release()
      inputSurface.release()
      if (muxerStarted) {
        muxer.stop()
      }
      muxer.release()
    }

    return cleanOutputPath
  }

  private fun applyExifRotation(bitmap: Bitmap, path: String): Bitmap {
    val exif = ExifInterface(path)
    val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      else -> return bitmap
    }
    val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (rotated !== bitmap) bitmap.recycle()
    return rotated
  }

  private fun drawCenterCrop(canvas: Canvas, bitmap: Bitmap, outW: Int, outH: Int, mirror: Boolean) {
    val imgW = bitmap.width.toFloat()
    val imgH = bitmap.height.toFloat()
    val targetRatio = outW.toFloat() / outH.toFloat()
    val imgRatio = imgW / imgH

    val srcRect: Rect
    if (imgRatio > targetRatio) {
      val cropW = (imgH * targetRatio).toInt()
      val offsetX = ((imgW - cropW) / 2).toInt()
      srcRect = Rect(offsetX, 0, offsetX + cropW, imgH.toInt())
    } else {
      val cropH = (imgW / targetRatio).toInt()
      val offsetY = ((imgH - cropH) / 2).toInt()
      srcRect = Rect(0, offsetY, imgW.toInt(), offsetY + cropH)
    }

    val dstRect = RectF(0f, 0f, outW.toFloat(), outH.toFloat())

    if (mirror) {
      canvas.save()
      canvas.scale(-1f, 1f, outW / 2f, outH / 2f)
      canvas.drawBitmap(bitmap, srcRect, dstRect, null)
      canvas.restore()
    } else {
      canvas.drawBitmap(bitmap, srcRect, dstRect, null)
    }
  }

  private fun drawOverlay(
    canvas: Canvas,
    width: Int,
    height: Int,
    overlayStyle: String,
    streak: Int,
    frameIndex: Int,
    totalFrames: Int,
    timerMode: String,
    recordingSeconds: Double,
    goalSeconds: Double,
    textPaint: Paint,
    shadowPaint: Paint
  ) {
    val padding = 20f
    val elapsed = if (totalFrames > 0) (frameIndex.toDouble() / totalFrames) * recordingSeconds else 0.0

    when (overlayStyle) {
      "timer" -> {
        val displaySeconds = if (timerMode == "countdown") {
          maxOf(0.0, recordingSeconds - elapsed)
        } else {
          elapsed
        }
        val text = formatTime(displaySeconds)
        drawTextOverlay(canvas, width, text, padding, textPaint, shadowPaint)
      }
      "progress" -> {
        val percent = if (recordingSeconds > 0) minOf(1.0, elapsed / recordingSeconds) else 0.0
        drawProgressBar(canvas, width, percent, padding, textPaint)
      }
      "streak" -> {
        val text = "▸ $streak days streak"
        drawTextOverlay(canvas, width, text, padding, textPaint, shadowPaint)
      }
    }
  }

  private fun formatTime(totalSeconds: Double): String {
    val s = totalSeconds.toInt()
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return String.format("%02d:%02d:%02d", h, m, sec)
  }

  private fun drawTextOverlay(
    canvas: Canvas,
    width: Int,
    text: String,
    padding: Float,
    textPaint: Paint,
    shadowPaint: Paint
  ) {
    val textWidth = textPaint.measureText(text)
    val x = width - textWidth - padding
    val y = padding + textPaint.textSize

    canvas.drawText(text, x + 1.5f, y + 1.5f, shadowPaint)
    canvas.drawText(text, x, y, textPaint)
  }

  private fun drawProgressBar(
    canvas: Canvas,
    width: Int,
    percent: Double,
    padding: Float,
    textPaint: Paint
  ) {
    val barWidth = width * 0.25f
    val barHeight = 8f
    val x = width - barWidth - padding
    val y = padding + textPaint.textSize * 0.5f

    // Background bar (semi-transparent)
    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(102, 0, 0, 0)
    }
    canvas.drawRoundRect(RectF(x, y, x + barWidth, y + barHeight), barHeight / 2, barHeight / 2, bgPaint)

    // Filled portion (white)
    val fillWidth = barWidth * percent.toFloat()
    if (fillWidth > 0) {
      val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
      }
      canvas.drawRoundRect(RectF(x, y, x + fillWidth, y + barHeight), barHeight / 2, barHeight / 2, fillPaint)
    }

    // Percentage text below bar
    val pctText = "${(percent * 100).toInt()}%"
    val smallPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = textPaint.textSize * 0.7f
      isFakeBoldText = true
    }
    val pctWidth = smallPaint.measureText(pctText)
    canvas.drawText(pctText, x + barWidth - pctWidth, y + barHeight + 4 + smallPaint.textSize, smallPaint)
  }

  private fun drainEncoder(
    encoder: MediaCodec,
    bufferInfo: MediaCodec.BufferInfo,
    muxer: MediaMuxer,
    trackIndex: Int,
    muxerStarted: Boolean
  ): Pair<Int, Boolean> {
    var ti = trackIndex
    var ms = muxerStarted

    while (true) {
      val outIndex = encoder.dequeueOutputBuffer(bufferInfo, 0)
      when {
        outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (!ms) {
            ti = muxer.addTrack(encoder.outputFormat)
            muxer.start()
            ms = true
          }
        }
        outIndex >= 0 -> {
          val encodedData = encoder.getOutputBuffer(outIndex) ?: break
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            bufferInfo.size = 0
          }
          if (bufferInfo.size > 0 && ms) {
            encodedData.position(bufferInfo.offset)
            encodedData.limit(bufferInfo.offset + bufferInfo.size)
            muxer.writeSampleData(ti, encodedData, bufferInfo)
          }
          encoder.releaseOutputBuffer(outIndex, false)
        }
        else -> break // INFO_TRY_AGAIN_LATER
      }
    }

    return Pair(ti, ms)
  }
}
