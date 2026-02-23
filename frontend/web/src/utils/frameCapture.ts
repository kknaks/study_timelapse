const BASE_FPS = 30;
const MAX_PICK_EVERY = 60;

interface FrameCaptureOptions {
  /** 총 녹화 예정 시간 (초) */
  durationSeconds: number;
  /** 타임랩스 출력 시간 (초) */
  outputSeconds: number;
}

type TimelapseCase = 'case1' | 'case2' | 'case3';

/**
 * 타임랩스 파라미터 계산 (백엔드 로직 그대로)
 * 
 * case1: 정상 — pick_every <= MAX, 30fps로 충분
 * case2: 프레임 부족 — 전부 사용, 짧게 출력
 * case3: 프레임 과다 — pick_every 고정, fps 올려서 빽빽하게
 */
function calcTimelapseParams(totalFrames: number, outputSeconds: number): {
  case_: TimelapseCase;
  pickEvery: number;
  outputFps: number;
  actualOutputSeconds: number;
} {
  const neededFrames = BASE_FPS * outputSeconds;

  // case2: 프레임 부족 → 전부 사용
  if (totalFrames <= neededFrames) {
    const actualSeconds = Math.max(1, Math.floor(totalFrames / BASE_FPS));
    console.log(
      `📊 case2: frames=${totalFrames} <= needed=${neededFrames}, ` +
      `output=${actualSeconds}s (all frames @ ${BASE_FPS}fps)`
    );
    return { case_: 'case2', pickEvery: 1, outputFps: BASE_FPS, actualOutputSeconds: actualSeconds };
  }

  let pickEvery = Math.floor(totalFrames / neededFrames);

  // case1: 정상 범위
  if (pickEvery <= MAX_PICK_EVERY) {
    console.log(`📊 case1: pickEvery=${pickEvery}, ${BASE_FPS}fps → ${outputSeconds}s`);
    return { case_: 'case1', pickEvery, outputFps: BASE_FPS, actualOutputSeconds: outputSeconds };
  }

  // case3: 프레임 과다 → fps 올려서 보상
  const usableFrames = Math.floor(totalFrames / MAX_PICK_EVERY);
  let adjustedFps = Math.ceil(usableFrames / outputSeconds);
  adjustedFps = Math.min(adjustedFps, 240);

  const actualNeeded = adjustedFps * outputSeconds;
  pickEvery = Math.max(1, Math.floor(totalFrames / actualNeeded));

  console.log(
    `📊 case3: frames=${totalFrames}, pickEvery=${pickEvery}, ` +
    `${adjustedFps}fps → ${outputSeconds}s`
  );
  return { case_: 'case3', pickEvery, outputFps: adjustedFps, actualOutputSeconds: outputSeconds };
}

/**
 * 녹화 중 일정 간격으로 프레임을 캡처하는 클래스
 * 
 * 백엔드의 3케이스 로직을 캡처 간격 계산에 적용:
 * - case1/case3: 설정된 간격으로 캡처
 * - case2: 가능한 많이 캡처 (프레임 부족 대비)
 * 
 * 원본 영상을 저장하지 않고, 필요한 프레임만 캡처 → 메모리 절약
 */
export class FrameCapture {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frames: Blob[] = [];
  private captureInterval: number | null = null;
  private intervalMs: number;
  private outputSeconds: number;
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
    this.outputSeconds = options.outputSeconds;

    // 예상 프레임 수 (30fps 기준)
    const estimatedTotalFrames = options.durationSeconds * BASE_FPS;

    // 백엔드 로직으로 파라미터 계산
    const { case_, pickEvery, outputFps } = calcTimelapseParams(
      estimatedTotalFrames,
      options.outputSeconds,
    );

    // 캡처 간격 계산 (pickEvery 프레임마다 1개 = pickEvery / fps 초)
    // case2: 최대한 많이 캡처 (33ms 간격 = 30fps)
    if (case_ === 'case2') {
      this.intervalMs = 1000 / BASE_FPS;
    } else {
      // pickEvery 프레임마다 캡처 → 초 단위로 변환
      this.intervalMs = (pickEvery / BASE_FPS) * 1000;
    }

    // 최소 33ms, 최대 10초
    this.intervalMs = Math.max(this.intervalMs, 1000 / BASE_FPS);
    this.intervalMs = Math.min(this.intervalMs, 10000);

    const neededFrames = outputFps * options.outputSeconds;

    console.log(
      `📸 FrameCapture [${case_}]: ${options.durationSeconds}초 → ${options.outputSeconds}초\n` +
      `   pickEvery=${pickEvery}, outputFps=${outputFps}, ` +
      `needed=${neededFrames}프레임, interval=${(this.intervalMs / 1000).toFixed(2)}초`
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

    // 캔버스 크기 업데이트
    if (this.canvas.width !== this.videoElement.videoWidth && this.videoElement.videoWidth > 0) {
      this.canvas.width = this.videoElement.videoWidth;
      this.canvas.height = this.videoElement.videoHeight;
    }

    this.ctx.drawImage(this.videoElement, 0, 0);

    this.canvas.toBlob(
      (blob) => {
        if (blob) this.frames.push(blob);
      },
      'image/jpeg',
      0.85,
    );
  }

  /**
   * 캡처된 프레임으로 타임랩스 영상 생성
   * 
   * 백엔드 3케이스 로직 적용:
   * - 프레임 수에 따라 fps와 출력 시간 자동 조절
   */
  async createTimelapse(
    onProgress?: (percent: number) => void,
  ): Promise<Blob> {
    const totalFrames = this.frames.length;
    if (totalFrames === 0) throw new Error('캡처된 프레임이 없습니다');

    // 최종 파라미터 계산 (실제 캡처된 프레임 수 기준)
    const { case_, pickEvery, outputFps, actualOutputSeconds } = calcTimelapseParams(
      totalFrames,
      this.outputSeconds,
    );

    // pickEvery에 따라 프레임 선별
    const selectedFrames: Blob[] = [];
    for (let i = 0; i < totalFrames; i += pickEvery) {
      selectedFrames.push(this.frames[i]);
    }

    console.log(
      `🎬 타임랩스 생성 [${case_}]: ${totalFrames}프레임 중 ${selectedFrames.length}개 선택, ` +
      `${outputFps}fps → ${actualOutputSeconds}초`
    );

    // 첫 프레임으로 크기 설정
    const firstImg = await createImageBitmap(selectedFrames[0]);
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = firstImg.width;
    outputCanvas.height = firstImg.height;
    const ctx = outputCanvas.getContext('2d')!;
    firstImg.close();

    const stream = outputCanvas.captureStream(outputFps);
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
      const frameInterval = 1000 / outputFps;

      const drawNext = async () => {
        if (frameIndex >= selectedFrames.length) {
          setTimeout(() => recorder.stop(), 200);
          return;
        }

        const img = await createImageBitmap(selectedFrames[frameIndex]);
        ctx.drawImage(img, 0, 0);
        img.close();

        if (onProgress) {
          onProgress(Math.round((frameIndex / selectedFrames.length) * 100));
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
