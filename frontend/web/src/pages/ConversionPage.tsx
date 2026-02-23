import { useState, useEffect } from 'react';
import type { UploadStatus, ConversionStatus, AspectRatio, OverlayConfig } from '../../../packages/shared/types';
import { uploadVideo, requestTimelapse, pollUntilComplete } from '../../../packages/shared/api';
import { API_BASE_URL } from '../../../packages/shared/constants';
import { OverlayRenderer } from '../utils/overlayRenderer';

type CompositeStatus = 'idle' | 'processing' | 'completed' | 'failed';

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
  aspectRatio,
  overlayConfig,
  onComplete,
}: ConversionPageProps) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus>('idle');
  const [compositeStatus, setCompositeStatus] = useState<CompositeStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [compositeProgress, setCompositeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hasOverlay = overlayConfig && overlayConfig.theme !== 'none';

  useEffect(() => {
    async function process() {
      try {
        // 1. 업로드
        setUploadStatus('uploading');
        const { fileId } = await uploadVideo(videoBlob, (p) => setUploadProgress(p));
        setUploadStatus('completed');

        // 2. 변환 요청
        setConversionStatus('processing');
        const { taskId } = await requestTimelapse({ fileId, outputSeconds, recordingSeconds, aspectRatio });

        // 3. 변환 완료 대기
        const result = await pollUntilComplete(taskId, (p) => setConversionProgress(p));

        if (result.status !== 'completed') {
          throw new Error('변환에 실패했습니다');
        }

        setConversionStatus('completed');
        const timelapseUrl = result.downloadUrl
          ? `${API_BASE_URL}${result.downloadUrl}`
          : `${API_BASE_URL}/api/download/${taskId}`;

        // 4. 오버레이 합성
        if (hasOverlay && overlayConfig) {
          setCompositeStatus('processing');
          const compositedUrl = await compositeOverlay(timelapseUrl, overlayConfig);
          setCompositeStatus('completed');
          onComplete(compositedUrl);
        } else {
          setCompositeStatus('completed');
          onComplete(timelapseUrl);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '오류가 발생했습니다');
        setUploadStatus('failed');
        setConversionStatus('failed');
        setCompositeStatus('failed');
      }
    }

    process();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas 오버레이 합성
  async function compositeOverlay(videoUrl: string, config: OverlayConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl;

      video.onloadeddata = async () => {
        const renderer = new OverlayRenderer(config, recordingSeconds, outputSeconds);
        renderer.setVideoDuration(video.duration);

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;

        const stream = canvas.captureStream(30);
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
          resolve(url);
        };

        recorder.onerror = () => reject(new Error('오버레이 합성 실패'));

        recorder.start(100);

        const captureFrame = () => {
          if (video.ended || video.paused) {
            setTimeout(() => recorder.stop(), 200);
            return;
          }

          ctx.drawImage(video, 0, 0);
          renderer.render(ctx, canvas.width, canvas.height, video.currentTime);
          setCompositeProgress(Math.round((video.currentTime / video.duration) * 100));
          requestAnimationFrame(captureFrame);
        };

        video.onended = () => {
          setCompositeProgress(100);
          setTimeout(() => recorder.stop(), 200);
        };

        await video.play();
        captureFrame();
      };

      video.onerror = () => reject(new Error('타임랩스 영상 로드 실패'));
    });
  }

  return (
    <div className="page conversion-page">
      <h1>타임랩스 생성 중</h1>

      <div className="progress-section">
        <div className="progress-item">
          <span>영상 업로드</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span>{uploadStatus === 'completed' ? '✅' : `${uploadProgress}%`}</span>
        </div>

        <div className="progress-item">
          <span>타임랩스 변환</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${conversionProgress}%` }} />
          </div>
          <span>{conversionStatus === 'completed' ? '✅' : `${conversionProgress}%`}</span>
        </div>

        {hasOverlay && (
          <div className="progress-item">
            <span>오버레이 합성</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${compositeProgress}%` }} />
            </div>
            <span>{compositeStatus === 'completed' ? '✅' : `${compositeProgress}%`}</span>
          </div>
        )}
      </div>

      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}
