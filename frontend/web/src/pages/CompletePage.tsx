import { useRef, useEffect, useState, useCallback } from 'react';
import type { OverlayConfig } from '../../../packages/shared/types';
import { OverlayRenderer } from '../utils/overlayRenderer';

interface CompletePageProps {
  downloadUrl: string;
  overlayConfig: OverlayConfig | null;
  recordingSeconds: number;
  outputSeconds: number;
  onRetry: () => void;
}

export function CompletePage({
  downloadUrl,
  overlayConfig,
  recordingSeconds,
  outputSeconds,
  onRetry,
}: CompletePageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const rendererRef = useRef<OverlayRenderer | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  const hasOverlay = overlayConfig && overlayConfig.theme !== 'none';

  useEffect(() => {
    if (hasOverlay && overlayConfig) {
      rendererRef.current = new OverlayRenderer(overlayConfig, recordingSeconds, outputSeconds);
    }
  }, [overlayConfig, recordingSeconds, outputSeconds, hasOverlay]);

  // Canvas 오버레이 렌더 루프
  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;

    if (!video || !canvas || !renderer) return;
    if (video.paused && video.currentTime === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas를 비디오 위에 정확히 겹치기 위해 사이즈 맞춤
    const rect = video.getBoundingClientRect();
    canvas.width = video.videoWidth || rect.width;
    canvas.height = video.videoHeight || rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderer.render(ctx, canvas.width, canvas.height, video.currentTime);

    if (!video.paused && !video.ended) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
  }, []);

  const handlePlay = () => {
    if (hasOverlay) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
  };

  const handlePause = () => {
    cancelAnimationFrame(animFrameRef.current);
    // 마지막 프레임 유지
    renderFrame();
  };

  const handleTimeUpdate = () => {
    if (hasOverlay && videoRef.current?.paused) {
      renderFrame();
    }
  };

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // 합성 영상 내보내기
  const handleExport = async () => {
    const video = videoRef.current;
    const renderer = rendererRef.current;

    if (!video || !renderer) return;

    setIsExporting(true);
    setExportProgress(0);

    // 오프스크린 캔버스로 합성
    const offCanvas = document.createElement('canvas');
    offCanvas.width = video.videoWidth;
    offCanvas.height = video.videoHeight;
    const ctx = offCanvas.getContext('2d')!;

    video.currentTime = 0;
    video.muted = true;

    const stream = offCanvas.captureStream(30);
    const chunks: Blob[] = [];

    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : 'video/webm;codecs=vp8';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `study-timelapse.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    };

    recorder.start(100);

    const captureFrame = () => {
      if (video.ended || video.paused) {
        setTimeout(() => recorder.stop(), 200);
        return;
      }

      ctx.drawImage(video, 0, 0);
      renderer.render(ctx, offCanvas.width, offCanvas.height, video.currentTime);
      setExportProgress(Math.round((video.currentTime / video.duration) * 100));
      requestAnimationFrame(captureFrame);
    };

    await video.play();
    captureFrame();

    video.onended = () => {
      setTimeout(() => recorder.stop(), 200);
    };
  };

  const handleDirectDownload = () => {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'study-timelapse.mp4';
    a.click();
  };

  const mins = Math.floor(recordingSeconds / 60);

  return (
    <div className="page complete-page">
      <h1>🎉 타임랩스 완성!</h1>

      {overlayConfig && overlayConfig.theme !== 'none' && (
        <p className="theme-badge">
          테마: {overlayConfig.theme} | 위치: {overlayConfig.position} | 크기: {overlayConfig.size.toUpperCase()}
        </p>
      )}

      <div className="preview-container">
        <video
          ref={videoRef}
          src={downloadUrl}
          controls
          playsInline
          crossOrigin="anonymous"
          className="timelapse-preview"
          onPlay={handlePlay}
          onPause={handlePause}
          onTimeUpdate={handleTimeUpdate}
          onLoadedData={() => setVideoReady(true)}
        />
        {hasOverlay && videoReady && (
          <canvas
            ref={canvasRef}
            className="overlay-canvas"
          />
        )}
      </div>

      {mins > 0 && (
        <p>{mins}분 녹화 → {outputSeconds}초 타임랩스</p>
      )}

      {isExporting && (
        <div className="export-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${exportProgress}%` }} />
          </div>
          <span>합성 중... {exportProgress}%</span>
        </div>
      )}

      <div className="actions">
        {hasOverlay ? (
          <button
            onClick={handleExport}
            disabled={isExporting || !videoReady}
            className="download-button"
          >
            {isExporting ? '합성 중...' : '📥 오버레이 합성 다운로드'}
          </button>
        ) : (
          <button onClick={handleDirectDownload} className="download-button">
            📥 다운로드
          </button>
        )}
        <button onClick={onRetry}>다시 촬영</button>
      </div>
    </div>
  );
}
