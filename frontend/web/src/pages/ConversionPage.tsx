import { useState, useEffect } from 'react';
import type { OverlayConfig } from '../../../packages/shared/types';
import type { FrameCapture } from '../utils/frameCapture';
import { OverlayRenderer } from '../utils/overlayRenderer';

interface ConversionPageProps {
  frameCapture: FrameCapture;
  outputSeconds: number;
  recordingSeconds: number;
  overlayConfig: OverlayConfig | null;
  onComplete: (downloadUrl: string) => void;
}

export function ConversionPage({
  frameCapture,
  outputSeconds,
  recordingSeconds,
  overlayConfig,
  onComplete,
}: ConversionPageProps) {
  const [step, setStep] = useState<'timelapse' | 'overlay' | 'done'>('timelapse');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hasOverlay = overlayConfig && overlayConfig.theme !== 'none';

  useEffect(() => {
    async function process() {
      try {
        // 1. 프레임 → 타임랩스 영상 생성
        setStep('timelapse');
        const timelapseBlob = await frameCapture.createTimelapse(setProgress);

        // 2. 오버레이 합성
        if (hasOverlay && overlayConfig) {
          setStep('overlay');
          setProgress(0);
          const compositedBlob = await compositeOverlay(timelapseBlob, overlayConfig);
          const url = URL.createObjectURL(compositedBlob);
          setStep('done');
          onComplete(url);
        } else {
          const url = URL.createObjectURL(timelapseBlob);
          setStep('done');
          onComplete(url);
        }

        // 메모리 해제
        frameCapture.dispose();
      } catch (err) {
        console.error('변환 실패:', err);
        setError(err instanceof Error ? err.message : '오류가 발생했습니다');
      }
    }

    process();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function compositeOverlay(timelapseBlob: Blob, config: OverlayConfig): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.src = URL.createObjectURL(timelapseBlob);

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

        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          URL.revokeObjectURL(video.src);
          resolve(blob);
        };

        recorder.onerror = () => {
          URL.revokeObjectURL(video.src);
          reject(new Error('오버레이 합성 실패'));
        };

        recorder.start(100);

        const captureFrame = () => {
          if (video.ended || video.paused) {
            setTimeout(() => recorder.stop(), 200);
            return;
          }
          ctx.drawImage(video, 0, 0);
          renderer.render(ctx, canvas.width, canvas.height, video.currentTime);
          setProgress(Math.round((video.currentTime / video.duration) * 100));
          requestAnimationFrame(captureFrame);
        };

        video.onended = () => {
          setProgress(100);
          setTimeout(() => recorder.stop(), 200);
        };

        await video.play();
        captureFrame();
      };

      video.onerror = () => reject(new Error('영상 로드 실패'));
    });
  }

  return (
    <div className="page conversion-page">
      <h1>타임랩스 생성 중</h1>

      <div className="progress-section">
        <div className="progress-item">
          <span>{hasOverlay ? '프레임 조립' : '타임랩스 생성'}</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${step === 'timelapse' ? progress : 100}%` }} />
          </div>
          <span>{step !== 'timelapse' ? '✅' : `${progress}%`}</span>
        </div>

        {hasOverlay && (
          <div className="progress-item">
            <span>오버레이 합성</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${step === 'overlay' ? progress : step === 'done' ? 100 : 0}%` }} />
            </div>
            <span>{step === 'done' ? '✅' : step === 'overlay' ? `${progress}%` : '대기'}</span>
          </div>
        )}
      </div>

      <p className="conversion-info">
        📸 {frameCapture.frameCount}프레임 → {outputSeconds}초 타임랩스
        {hasOverlay && ` + ${overlayConfig!.theme} 오버레이`}
      </p>

      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}
