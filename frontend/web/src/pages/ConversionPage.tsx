import { useState, useEffect } from 'react';
import type { UploadStatus, ConversionStatus } from '@shared/types';
import { uploadVideo, requestTimelapse, pollUntilComplete, getDownloadUrl } from '@shared/api';

interface ConversionPageProps {
  videoBlob: Blob;
  outputSeconds: number;
  onComplete: (downloadUrl: string) => void;
}

export function ConversionPage({ videoBlob, outputSeconds, onComplete }: ConversionPageProps) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function process() {
      try {
        // 1. 업로드
        setUploadStatus('uploading');
        const { fileId } = await uploadVideo(videoBlob, (p) => setUploadProgress(p));
        setUploadStatus('completed');

        // 2. 변환 요청
        setConversionStatus('processing');
        const { taskId } = await requestTimelapse({ fileId, outputSeconds });

        // 3. 변환 완료 대기
        const result = await pollUntilComplete(taskId, (p) => setConversionProgress(p));

        if (result.status === 'completed') {
          setConversionStatus('completed');
          onComplete(result.downloadUrl ?? getDownloadUrl(taskId));
        } else {
          throw new Error('변환에 실패했습니다');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '오류가 발생했습니다');
        setUploadStatus('failed');
        setConversionStatus('failed');
      }
    }

    process();
  }, [videoBlob, outputSeconds, onComplete]);

  return (
    <div className="page conversion-page">
      <h1>타임랩스 생성 중</h1>

      <div className="progress-section">
        <div className="progress-item">
          <span>영상 업로드</span>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span>{uploadStatus === 'completed' ? '✅' : `${uploadProgress}%`}</span>
        </div>

        <div className="progress-item">
          <span>타임랩스 변환</span>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${conversionProgress}%` }}
            />
          </div>
          <span>{conversionStatus === 'completed' ? '✅' : `${conversionProgress}%`}</span>
        </div>
      </div>

      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}
