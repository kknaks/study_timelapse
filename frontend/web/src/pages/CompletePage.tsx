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

  const [exportStatus, setExportStatus] = useState<'loading' | 'compositing' | 'done'>('loading');
  const [exportProgress, setExportProgress] = useState(0);
  const [compositedUrl, setCompositedUrl] = useState<string>('');

  const hasOverlay = overlayConfig && overlayConfig.theme !== 'none';

  // 렌더러 초기화
  useEffect(() => {
    if (hasOverlay && overlayConfig) {
      rendererRef.current = new OverlayRenderer(overlayConfig, recordingSeconds, outputSeconds);
    }
  }, [overlayConfig, recordingSeconds, outputSeconds, hasOverlay]);

  // 영상 로드되면 자동 합성 시작
  const handleVideoLoaded = useCallback(async () => {
    const video = videoRef.current;
    const renderer = rendererRef.current;

    if (!video) return;

    // 오버레이 없으면 원본 URL 바로 사용
    if (!hasOverlay || !renderer) {
      setCompositedUrl(downloadUrl);
      setExportStatus('done');
      return;
    }

    renderer.setVideoDuration(video.duration);
    console.log(`🎬 영상 duration: ${video.duration}초, 원본 녹화: ${recordingSeconds}초`);

    // 자동 합성 시작
    setExportStatus('compositing');
    setExportProgress(0);

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
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setCompositedUrl(url);
      setExportStatus('done');
      console.log('✅ 오버레이 합성 완료');
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

    video.onended = () => {
      setExportProgress(100);
      setTimeout(() => recorder.stop(), 200);
    };

    await video.play();
    captureFrame();
  }, [downloadUrl, hasOverlay, recordingSeconds]);

  // 프리뷰용 오버레이 렌더 루프
  const renderPreviewFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;

    if (!video || !canvas || !renderer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderer.render(ctx, canvas.width, canvas.height, video.currentTime);

    if (!video.paused && !video.ended) {
      animFrameRef.current = requestAnimationFrame(renderPreviewFrame);
    }
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const handleDownload = () => {
    if (!compositedUrl) return;
    const ext = compositedUrl.startsWith('blob:') ? 'mp4' : 'mp4';
    const a = document.createElement('a');
    a.href = compositedUrl;
    a.download = `study-timelapse.${ext}`;
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

      {/* 합성용 비디오 (숨김) */}
      {hasOverlay && exportStatus !== 'done' && (
        <video
          ref={videoRef}
          src={downloadUrl}
          playsInline
          muted
          crossOrigin="anonymous"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          onLoadedData={handleVideoLoaded}
        />
      )}

      {/* 합성 진행 중 */}
      {exportStatus === 'loading' && (
        <div className="export-progress">
          <p>영상 로딩 중...</p>
        </div>
      )}

      {exportStatus === 'compositing' && (
        <div className="export-progress">
          <p>🎨 오버레이 합성 중...</p>
          <div className="progress-bar" style={{ width: '100%' }}>
            <div className="progress-fill" style={{ width: `${exportProgress}%` }} />
          </div>
          <span>{exportProgress}%</span>
        </div>
      )}

      {/* 합성 완료 → 프리뷰 */}
      {exportStatus === 'done' && (
        <div className="preview-container">
          {hasOverlay ? (
            <>
              <video
                ref={videoRef}
                src={compositedUrl}
                controls
                playsInline
                className="timelapse-preview"
              />
            </>
          ) : (
            <video
              ref={videoRef}
              src={downloadUrl}
              controls
              playsInline
              className="timelapse-preview"
              onLoadedData={handleVideoLoaded}
            />
          )}
        </div>
      )}

      {mins > 0 && (
        <p>{mins}분 녹화 → {outputSeconds}초 타임랩스</p>
      )}

      <div className="actions">
        <button
          onClick={handleDownload}
          disabled={exportStatus !== 'done'}
          className="download-button"
        >
          {exportStatus === 'done' ? '📥 다운로드' : '합성 중...'}
        </button>
        <button onClick={onRetry}>다시 촬영</button>
      </div>
    </div>
  );
}
