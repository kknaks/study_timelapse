const BASE_FPS = 30;
const MAX_PICK_EVERY = 60;
const FLUSH_THRESHOLD = 10; // RAM 버퍼 → OPFS flush 기준

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

  if (totalFrames <= neededFrames) {
    const actualSeconds = Math.max(1, Math.floor(totalFrames / BASE_FPS));
    console.log(
      `📊 case2: frames=${totalFrames} <= needed=${neededFrames}, ` +
        `output=${actualSeconds}s (all frames @ ${BASE_FPS}fps)`,
    );
    return { case_: 'case2', pickEvery: 1, outputFps: BASE_FPS, actualOutputSeconds: actualSeconds };
  }

  let pickEvery = Math.floor(totalFrames / neededFrames);

  if (pickEvery <= MAX_PICK_EVERY) {
    console.log(`📊 case1: pickEvery=${pickEvery}, ${BASE_FPS}fps → ${outputSeconds}s`);
    return { case_: 'case1', pickEvery, outputFps: BASE_FPS, actualOutputSeconds: outputSeconds };
  }

  const usableFrames = Math.floor(totalFrames / MAX_PICK_EVERY);
  let adjustedFps = Math.ceil(usableFrames / outputSeconds);
  adjustedFps = Math.min(adjustedFps, 240);

  const actualNeeded = adjustedFps * outputSeconds;
  pickEvery = Math.max(1, Math.floor(totalFrames / actualNeeded));

  console.log(
    `📊 case3: frames=${totalFrames}, pickEvery=${pickEvery}, ` +
      `${adjustedFps}fps → ${outputSeconds}s`,
  );
  return { case_: 'case3', pickEvery, outputFps: adjustedFps, actualOutputSeconds: outputSeconds };
}

// ─── OPFS 스토리지 어댑터 ───

interface FrameStorage {
  mode: 'opfs' | 'memory';
  write(index: number, blob: Blob): Promise<void>;
  read(index: number): Promise<Blob>;
  count(): number;
  dispose(): Promise<void>;
}

/** OPFS 기반 프레임 저장 — 디스크에 쓰므로 메모리 절약 */
class OPFSFrameStorage implements FrameStorage {
  mode = 'opfs' as const;
  private sessionDir: FileSystemDirectoryHandle | null = null;
  private _count = 0;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init() {
    const root = await navigator.storage.getDirectory();
    // frames/ 디렉토리
    const framesDir = await root.getDirectoryHandle('frames', { create: true });
    // 세션별 디렉토리 (timestamp)
    const sessionName = `session_${Date.now()}`;
    this.sessionDir = await framesDir.getDirectoryHandle(sessionName, { create: true });
  }

  async ready() {
    await this.initPromise;
  }

  async write(index: number, blob: Blob): Promise<void> {
    await this.initPromise;
    if (!this.sessionDir) return;
    const name = `frame_${String(index).padStart(6, '0')}.jpg`;
    const fileHandle = await this.sessionDir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    this._count = Math.max(this._count, index + 1);
  }

  async read(index: number): Promise<Blob> {
    await this.initPromise;
    if (!this.sessionDir) throw new Error('OPFS session not initialized');
    const name = `frame_${String(index).padStart(6, '0')}.jpg`;
    const fileHandle = await this.sessionDir.getFileHandle(name);
    const file = await fileHandle.getFile();
    return file;
  }

  count(): number {
    return this._count;
  }

  async dispose(): Promise<void> {
    await this.initPromise;
    if (!this.sessionDir) return;
    try {
      const root = await navigator.storage.getDirectory();
      const framesDir = await root.getDirectoryHandle('frames');
      await framesDir.removeEntry(this.sessionDir.name, { recursive: true });
    } catch (e) {
      console.warn('OPFS cleanup failed:', e);
    }
    this.sessionDir = null;
  }
}

/** 메모리 폴백 — OPFS 미지원 브라우저용 */
class MemoryFrameStorage implements FrameStorage {
  mode = 'memory' as const;
  private frames: Blob[] = [];

  async write(index: number, blob: Blob): Promise<void> {
    this.frames[index] = blob;
  }

  async read(index: number): Promise<Blob> {
    return this.frames[index];
  }

  count(): number {
    return this.frames.filter(Boolean).length;
  }

  async dispose(): Promise<void> {
    this.frames = [];
  }
}

/** OPFS 지원 여부 확인 */
async function supportsOPFS(): Promise<boolean> {
  try {
    if (!navigator.storage?.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    // 테스트 쓰기
    await root.getFileHandle('__opfs_test__', { create: true });
    await root.removeEntry('__opfs_test__');
    return true;
  } catch {
    return false;
  }
}

// ─── FrameCapture 클래스 ───

/**
 * 녹화 중 일정 간격으로 프레임을 캡처하는 클래스
 *
 * 저장 전략:
 * - OPFS 지원 시: RAM 버퍼(10프레임) → OPFS 디스크로 flush (메모리 절약)
 * - OPFS 미지원 시: 메모리 Blob[] 폴백 (기존 방식)
 *
 * 백엔드의 3케이스 로직을 캡처 간격 계산에 적용.
 */
export class FrameCapture {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private storage: FrameStorage | null = null;
  private storageReady: Promise<void>;
  private ramBuffer: { index: number; blob: Blob }[] = [];
  private captureInterval: number | null = null;
  private intervalMs: number;
  private outputSeconds: number;
  private videoElement: HTMLVideoElement | null = null;
  private _frameCount = 0;
  private flushing = false;

  /** 현재까지 캡처된 프레임 수 */
  get frameCount(): number {
    return this._frameCount;
  }

  /** 캡처 간격 (ms) */
  get captureIntervalMs(): number {
    return this.intervalMs;
  }

  /** 저장 모드 (OPFS / 메모리) */
  get storageMode(): string {
    return this.storage?.mode ?? 'initializing';
  }

  constructor(options: FrameCaptureOptions) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.outputSeconds = options.outputSeconds;

    // 스토리지 초기화 (비동기)
    this.storageReady = this.initStorage();

    // 예상 프레임 수 (30fps 기준)
    const estimatedTotalFrames = options.durationSeconds * BASE_FPS;

    const { case_, pickEvery, outputFps } = calcTimelapseParams(
      estimatedTotalFrames,
      options.outputSeconds,
    );

    if (case_ === 'case2') {
      this.intervalMs = 1000 / BASE_FPS;
    } else {
      this.intervalMs = (pickEvery / BASE_FPS) * 1000;
    }

    this.intervalMs = Math.max(this.intervalMs, 1000 / BASE_FPS);
    this.intervalMs = Math.min(this.intervalMs, 10000);

    const neededFrames = outputFps * options.outputSeconds;

    console.log(
      `📸 FrameCapture [${case_}]: ${options.durationSeconds}초 → ${options.outputSeconds}초\n` +
        `   pickEvery=${pickEvery}, outputFps=${outputFps}, ` +
        `needed=${neededFrames}프레임, interval=${(this.intervalMs / 1000).toFixed(2)}초`,
    );
  }

  private async initStorage() {
    if (await supportsOPFS()) {
      const opfs = new OPFSFrameStorage();
      await opfs.ready();
      this.storage = opfs;
      console.log('💾 프레임 저장: OPFS (디스크)');
    } else {
      this.storage = new MemoryFrameStorage();
      console.log('💾 프레임 저장: 메모리 폴백 (OPFS 미지원)');
    }
  }

  /** 캡처 시작 */
  start(video: HTMLVideoElement) {
    this.videoElement = video;
    this.canvas.width = video.videoWidth || 1280;
    this.canvas.height = video.videoHeight || 720;
    this._frameCount = 0;
    this.ramBuffer = [];

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
  async stop() {
    this.pause();
    // 남은 버퍼 flush
    await this.flushBuffer(true);
    console.log(`📸 캡처 종료: ${this._frameCount}프레임 (${this.storageMode})`);
  }

  /** 프레임 캡처 */
  private captureFrame() {
    if (!this.videoElement) return;

    if (this.canvas.width !== this.videoElement.videoWidth && this.videoElement.videoWidth > 0) {
      this.canvas.width = this.videoElement.videoWidth;
      this.canvas.height = this.videoElement.videoHeight;
    }

    this.ctx.drawImage(this.videoElement, 0, 0);

    const index = this._frameCount;
    this._frameCount++;

    this.canvas.toBlob(
      (blob) => {
        if (!blob) return;
        this.ramBuffer.push({ index, blob });

        // 버퍼가 FLUSH_THRESHOLD 이상이면 디스크로 flush
        if (this.ramBuffer.length >= FLUSH_THRESHOLD && !this.flushing) {
          this.flushBuffer(false);
        }
      },
      'image/jpeg',
      0.85,
    );
  }

  /** RAM 버퍼 → 스토리지로 flush */
  private async flushBuffer(force: boolean) {
    if (!this.storage) {
      await this.storageReady;
    }
    if (!this.storage || this.ramBuffer.length === 0) return;
    if (this.flushing && !force) return;

    this.flushing = true;
    const toFlush = [...this.ramBuffer];
    this.ramBuffer = [];

    try {
      for (const { index, blob } of toFlush) {
        await this.storage.write(index, blob);
      }
    } catch (e) {
      console.warn('프레임 flush 실패:', e);
      // 실패한 프레임은 다시 버퍼에
      this.ramBuffer.unshift(...toFlush);
    }

    this.flushing = false;
  }

  /**
   * 캡처된 프레임으로 타임랩스 영상 생성
   *
   * 백엔드 3케이스 로직 적용:
   * - 프레임 수에 따라 fps와 출력 시간 자동 조절
   */
  async createTimelapse(onProgress?: (percent: number) => void): Promise<Blob> {
    await this.storageReady;
    if (!this.storage) throw new Error('스토리지 초기화 실패');

    const totalFrames = this._frameCount;
    if (totalFrames === 0) throw new Error('캡처된 프레임이 없습니다');

    const { case_, pickEvery, outputFps, actualOutputSeconds } = calcTimelapseParams(
      totalFrames,
      this.outputSeconds,
    );

    // pickEvery에 따라 선택할 인덱스 계산
    const selectedIndices: number[] = [];
    for (let i = 0; i < totalFrames; i += pickEvery) {
      selectedIndices.push(i);
    }

    console.log(
      `🎬 타임랩스 생성 [${case_}]: ${totalFrames}프레임 중 ${selectedIndices.length}개 선택, ` +
        `${outputFps}fps → ${actualOutputSeconds}초`,
    );

    // 첫 프레임으로 크기 설정
    const firstBlob = await this.storage.read(selectedIndices[0]);
    const firstImg = await createImageBitmap(firstBlob);
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

      let frameIdx = 0;
      const frameInterval = 1000 / outputFps;

      const drawNext = async () => {
        if (frameIdx >= selectedIndices.length) {
          setTimeout(() => recorder.stop(), 200);
          return;
        }

        try {
          const blob = await this.storage!.read(selectedIndices[frameIdx]);
          const img = await createImageBitmap(blob);
          ctx.drawImage(img, 0, 0);
          img.close();
        } catch (e) {
          console.warn(`프레임 ${selectedIndices[frameIdx]} 읽기 실패, 스킵`, e);
        }

        if (onProgress) {
          onProgress(Math.round((frameIdx / selectedIndices.length) * 100));
        }

        frameIdx++;
        setTimeout(drawNext, frameInterval);
      };

      drawNext();
    });
  }

  /** 메모리 + OPFS 해제 */
  async dispose() {
    this.ramBuffer = [];
    this.videoElement = null;
    if (this.storage) {
      await this.storage.dispose();
      this.storage = null;
    }
  }
}
