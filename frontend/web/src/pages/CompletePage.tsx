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

  const hasOverlay = overlayConfig && overlayConfig.theme !== 'none';

  // 렌더러 초기화
  useEffect(() => {
    if (hasOverlay && overlayConfig) {
      rendererRef.current = new OverlayRenderer(overlayConfig, recordingSeconds, outputSeconds);
    }
  }, [overlayConfig, recordingSeconds, outputSeconds, hasOverlay]);

  // 비디오 위에 Canvas 오버레이 실시간 렌더
  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;

    if (!video || !canvas || !renderer || video.paused || video.ended) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 비디오 프레임 그리기
    ctx.drawImage(video, 0, 0);
    // 오버레이 그리기
    renderer.render(ctx, canvas.width, canvas.height, video.currentTime);

    animFrameRef.current = requestAnimationFrame(renderFrame);
  }, []);

  const handlePlay = () => {
    if (hasOverlay) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
  };

  const handlePause = () => {
    cancelAnimationFrame(animFrameRef.current);
  };

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // 합성 영상 내보내기 (Canvas → MediaRecorder → Blob)
  const handleExport = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;

    if (!video || !canvas || !renderer) return;

    setIsExporting(true);
    setExportProgress(0);

    // 비디오를 처음부터 재생
    video.currentTime = 0;
    video.muted = true;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Canvas에서 MediaRecorder로 녹화
    const stream = canvas.captureStream(30); // 30fps
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

    return new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        // 다운로드 트리거
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `study-timelapse.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
        resolve();
      };

      recorder.start(100);

      // 재생하면서 프레임 캡처
      const captureFrame = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }

        ctx.drawImage(video, 0, 0);
        renderer.render(ctx, canvas.width, canvas.height, video.currentTime);

        setExportProgress(Math.round((video.currentTime / video.duration) * 100));
        requestAnimationFrame(captureFrame);
      };

      video.play().then(() => {
        captureFrame();
      });

      video.onended = () => {
        setTimeout(() => recorder.stop(), 200);
      };
    });
  };

  // 오버레이 없으면 기존 방식
  const handleDirectDownload = () => {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'study-timelapse.mp4';
    a.click();
  };

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
          className={`timelapse-preview ${hasOverlay ? 'hidden-video' : ''}`}
          onPlay={handlePlay}
          onPause={handlePause}
        />
        {hasOverlay && (
          <canvas
            ref={canvasRef}
            className="overlay-canvas"
          />
        )}
      </div>

      <p>
        {recordingSeconds > 0 && `${Math.floor(recordingSeconds / 60)}분 녹화 → ${outputSeconds}초 타임랩스`}
      </p>

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
            disabled={isExporting}
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
