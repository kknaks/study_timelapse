interface CompletePageProps {
  downloadUrl: string;
  onRetry: () => void;
}

export function CompletePage({ downloadUrl, onRetry }: CompletePageProps) {
  return (
    <div className="page complete-page">
      <h1>🎉 타임랩스 완성!</h1>

      <video
        src={downloadUrl}
        controls
        playsInline
        className="timelapse-preview"
      />

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
