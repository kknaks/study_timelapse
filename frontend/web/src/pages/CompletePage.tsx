import type { OverlayConfig } from '../../../packages/shared/types';

interface CompletePageProps {
  downloadUrl: string;
  overlayConfig: OverlayConfig | null;
  recordingSeconds: number;
  outputSeconds: number;
  onRetry: () => void;
}

export function CompletePage({ downloadUrl, overlayConfig, recordingSeconds, outputSeconds, onRetry }: CompletePageProps) {
  return (
    <div className="page complete-page">
      <h1>🎉 타임랩스 완성!</h1>

      {overlayConfig && overlayConfig.theme !== 'none' && (
        <p className="theme-badge">
          테마: {overlayConfig.theme} | 위치: {overlayConfig.position} | 크기: {overlayConfig.size.toUpperCase()}
        </p>
      )}

      <video
        src={downloadUrl}
        controls
        playsInline
        className="timelapse-preview"
      />

      <p>
        {recordingSeconds > 0 && `${Math.floor(recordingSeconds / 60)}분 녹화 → ${outputSeconds}초 타임랩스`}
      </p>

      <div className="actions">
        <a
          href={downloadUrl}
          download="study-timelapse.mp4"
          className="download-button"
        >
          다운로드
        </a>
        <button onClick={onRetry}>다시 촬영</button>
      </div>
    </div>
  );
}
