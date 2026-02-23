import { useState, useEffect } from 'react';
import type { AspectRatio, OverlayConfig } from '../../../packages/shared/types';
import { createClientTimelapse } from '../utils/clientTimelapse';

interface ConversionPageProps {
  videoBlob: Blob;
  outputSeconds: number;
  recordingSeconds: number;
  aspectRatio: AspectRatio;
  overlayConfig: OverlayConfig | null;
  onComplete: (downloadUrl: string) => void;
}

export function ConversionPage({
  videoBlob,
  outputSeconds,
  recordingSeconds,
  aspectRatio: _aspectRatio,
  overlayConfig,
  onComplete,
}: ConversionPageProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function process() {
      try {
        console.log(`🚀 클라이언트 타임랩스 시작: ${recordingSeconds}초 → ${outputSeconds}초`);

        const resultBlob = await createClientTimelapse({
          videoBlob,
          recordingSeconds,
          outputSeconds,
          overlayConfig,
          onProgress: setProgress,
        });

        console.log(`✅ 타임랩스 완료: ${(resultBlob.size / 1024 / 1024).toFixed(1)}MB`);

        const url = URL.createObjectURL(resultBlob);
        setStatus('completed');
        onComplete(url);
      } catch (err) {
        console.error('타임랩스 실패:', err);
        setError(err instanceof Error ? err.message : '오류가 발생했습니다');
        setStatus('failed');
      }
    }

    process();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page conversion-page">
      <h1>타임랩스 생성 중</h1>

      <div className="progress-section">
        <div className="progress-item">
          <span>타임랩스 변환</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span>{status === 'completed' ? '✅' : `${progress}%`}</span>
        </div>
      </div>

      <p className="conversion-info">
        {recordingSeconds > 0 && `${Math.floor(recordingSeconds / 60)}분 → ${outputSeconds}초`}
        {overlayConfig && overlayConfig.theme !== 'none' && ` + ${overlayConfig.theme} 오버레이`}
      </p>

      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}
