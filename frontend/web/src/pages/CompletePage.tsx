import type { OverlayConfig } from '../../../packages/shared/types';

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
  const mins = Math.floor(recordingSeconds / 60);

  const handleDownload = () => {
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
          테마: {overlayConfig.theme} | 크기: {overlayConfig.size.toUpperCase()}
        </p>
      )}

      <div className="preview-container">
        <video
          src={downloadUrl}
          controls
          playsInline
          className="timelapse-preview"
        />
      </div>

      {mins > 0 && (
        <p>{mins}분 녹화 → {outputSeconds}초 타임랩스</p>
      )}

      <div className="actions">
        <button onClick={handleDownload} className="download-button">
          📥 다운로드
        </button>
        <button onClick={onRetry}>다시 촬영</button>
      </div>
    </div>
  );
}
