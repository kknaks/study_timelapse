import type { OverlayConfig } from '../../../packages/shared/types';
import { OverlayRenderer } from './overlayRenderer';

interface ClientTimelapseOptions {
  videoBlob: Blob;
  recordingSeconds: number;
  outputSeconds: number;
  overlayConfig: OverlayConfig | null;
  onProgress: (percent: number) => void;
}

/**
 * 프론트엔드에서 타임랩스 생성 (서버 불필요)
 * - video.playbackRate로 배속 재생
 * - Canvas에 프레임 + 오버레이 그리기
 * - MediaRecorder로 최종 영상 캡처
 */
export async function createClientTimelapse({
  videoBlob,
  recordingSeconds,
  outputSeconds,
  overlayConfig,
  onProgress,
}: ClientTimelapseOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(videoBlob);

    video.onloadeddata = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;

      // 배속 계산
      const speed = video.duration / outputSeconds;
      // 브라우저 playbackRate 최대 16x, 그 이상은 프레임 스킵으로
      const playbackRate = Math.min(speed, 16);

      console.log(`🎬 클라이언트 타임랩스: ${video.duration.toFixed(1)}초 → ${outputSeconds}초 (${speed.toFixed(1)}x, playbackRate=${playbackRate}x)`);

      // 오버레이 렌더러
      let renderer: OverlayRenderer | null = null;
      const hasOverlay = overlayConfig && overlayConfig.theme !== 'none';
      if (hasOverlay && overlayConfig) {
        renderer = new OverlayRenderer(overlayConfig, recordingSeconds, outputSeconds);
        renderer.setVideoDuration(video.duration);
      }

      // MediaRecorder 설정
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
        URL.revokeObjectURL(video.src);
        resolve(blob);
      };

      recorder.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('타임랩스 생성 실패'));
      };

      // 배속이 16x 초과면 프레임 스킵 방식
      if (speed > 16) {
        recorder.start(100);
        await renderByFrameSkip(video, canvas, ctx, renderer, speed, outputSeconds, onProgress);
        setTimeout(() => recorder.stop(), 200);
      } else {
        // playbackRate 방식 (부드러움)
        video.playbackRate = playbackRate;
        recorder.start(100);

        const captureFrame = () => {
          if (video.ended || video.paused) {
            onProgress(100);
            setTimeout(() => recorder.stop(), 200);
            return;
          }

          ctx.drawImage(video, 0, 0);
          if (renderer) {
            renderer.render(ctx, canvas.width, canvas.height, video.currentTime);
          }

          const progress = Math.round((video.currentTime / video.duration) * 100);
          onProgress(progress);

          requestAnimationFrame(captureFrame);
        };

        video.onended = () => {
          onProgress(100);
          setTimeout(() => recorder.stop(), 200);
        };

        await video.play();
        captureFrame();
      }
    };

    video.onerror = () => reject(new Error('영상 로드 실패'));
  });
}

/**
 * 프레임 스킵 방식 (16x 초과 배속용)
 * 일정 간격으로 시크 → 캡처 반복
 */
async function renderByFrameSkip(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  renderer: OverlayRenderer | null,
  speed: number,
  outputSeconds: number,
  onProgress: (percent: number) => void,
) {
  const fps = 30;
  const totalFrames = outputSeconds * fps;
  const timeStep = video.duration / totalFrames;
  void speed; // used for logging only

  for (let i = 0; i < totalFrames; i++) {
    const seekTime = i * timeStep;

    // 시크 후 프레임 캡처
    await new Promise<void>((resolve) => {
      video.currentTime = seekTime;
      video.onseeked = () => {
        ctx.drawImage(video, 0, 0);
        if (renderer) {
          renderer.render(ctx, canvas.width, canvas.height, video.currentTime);
        }
        resolve();
      };
    });

    // 30fps 타이밍 유지 (Canvas captureStream이 프레임 캡처하도록)
    await new Promise((r) => setTimeout(r, 1000 / fps));

    if (i % 10 === 0) {
      onProgress(Math.round((i / totalFrames) * 100));
    }
  }
}
