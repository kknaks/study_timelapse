const TARGET_FPS = 30;

interface FrameCaptureOptions {
  /** 총 녹화 예정 시간 (초) */
  durationSeconds: number;
  /** 타임랩스 출력 시간 (초) */
  outputSeconds: number;
}

/**
 * 녹화 중 일정 간격으로 프레임을 캡처하는 클래스
 * 
 * 원본 영상을 저장하지 않고, 필요한 프레임만 캡처 → 메모리 절약
 * 녹화 종료 후 캡처된 프레임으로 바로 타임랩스 생성
 */
export class FrameCapture {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frames: Blob[] = [];
  private captureInterval: number | null = null;
  private intervalMs: number;
  private totalNeededFrames: number;
  private videoElement: HTMLVideoElement | null = null;

  /** 현재까지 캡처된 프레임 수 */
  get frameCount(): number {
    return this.frames.length;
  }

  /** 캡처 간격 (ms) */
  get captureIntervalMs(): number {
    return this.intervalMs;
  }

  constructor(options: FrameCaptureOptions) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;

    // 필요한 총 프레임 수
    this.totalNeededFrames = TARGET_FPS * options.outputSeconds;

    // 캡처 간격 계산
    // 예: 3600초 녹화, 60초 출력, 30fps → 1800프레임 필요 → 2초마다 캡처
    this.intervalMs = (options.durationSeconds / this.totalNeededFrames) * 1000;

    // 최소 간격 33ms (30fps 실시간 캡처)
    this.intervalMs = Math.max(this.intervalMs, 1000 / TARGET_FPS);

    console.log(
      `📸 FrameCapture: ${options.durationSeconds}초 → ${options.outputSeconds}초, ` +
      `${this.totalNeededFrames}프레임 필요, ${(this.intervalMs / 1000).toFixed(2)}초 간격`
    );
  }

  /** 캡처 시작 */
  start(video: HTMLVideoElement) {
    this.videoElement = video;
    this.canvas.width = video.videoWidth || 1280;
    this.canvas.height = video.videoHeight || 720;
    this.frames = [];

    // 첫 프레임 즉시 캡처
    this.captureFrame();

    this.captureInterval = window.setInterval(() => {
      this.captureFrame();
    }, this.intervalMs);
  }

  /** 캡처 일시정지 */
  pause() {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }

  /** 캡처 재개 */
  resume() {
    if (!this.captureInterval && this.videoElement) {
      this.captureInterval = window.setInterval(() => {
        this.captureFrame();
      }, this.intervalMs);
    }
  }

  /** 캡처 종료 */
  stop() {
    this.pause();
    console.log(`📸 캡처 종료: ${this.frames.length}프레임`);
  }

  /** 프레임 캡처 (JPEG blob으로 저장) */
  private captureFrame() {
    if (!this.videoElement) return;

    // 캔버스 크기 업데이트 (해상도 변경 대응)
    if (this.canvas.width !== this.videoElement.videoWidth) {
      this.canvas.width = this.videoElement.videoWidth;
      this.canvas.height = this.videoElement.videoHeight;
    }

    this.ctx.drawImage(this.videoElement, 0, 0);

    this.canvas.toBlob(
      (blob) => {
        if (blob) this.frames.push(blob);
      },
      'image/jpeg',
      0.85, // 품질 85% — 메모리 절약
    );
  }

  /**
   * 캡처된 프레임으로 타임랩스 영상 생성
   * Canvas에 프레임을 순서대로 그리고 MediaRecorder로 캡처
   */
  async createTimelapse(
    onProgress?: (percent: number) => void,
  ): Promise<Blob> {
    const totalFrames = this.frames.length;
    if (totalFrames === 0) throw new Error('캡처된 프레임이 없습니다');

    console.log(`🎬 타임랩스 생성: ${totalFrames}프레임 → ${TARGET_FPS}fps`);

    const outputCanvas = document.createElement('canvas');
    // 첫 프레임으로 크기 설정
    const firstImg = await createImageBitmap(this.frames[0]);
    outputCanvas.width = firstImg.width;
    outputCanvas.height = firstImg.height;
    const ctx = outputCanvas.getContext('2d')!;
    firstImg.close();

    const stream = outputCanvas.captureStream(TARGET_FPS);
    const chunks: Blob[] = [];

    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : 'video/webm;codecs=vp8';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
    });

    return new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log(`✅ 타임랩스 완료: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
        resolve(blob);
      };

      recorder.onerror = () => reject(new Error('타임랩스 생성 실패'));

      recorder.start(100);

      let frameIndex = 0;
      const frameInterval = 1000 / TARGET_FPS;

      const drawNext = async () => {
        if (frameIndex >= totalFrames) {
          // 모든 프레임 그림 → 녹화 종료
          setTimeout(() => recorder.stop(), 200);
          return;
        }

        const img = await createImageBitmap(this.frames[frameIndex]);
        ctx.drawImage(img, 0, 0);
        img.close();

        if (onProgress) {
          onProgress(Math.round((frameIndex / totalFrames) * 100));
        }

        frameIndex++;
        setTimeout(drawNext, frameInterval);
      };

      drawNext();
    });
  }

  /** 메모리 해제 */
  dispose() {
    this.frames = [];
    this.videoElement = null;
  }
}
