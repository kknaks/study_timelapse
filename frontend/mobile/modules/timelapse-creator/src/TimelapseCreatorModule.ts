import { NativeModule, requireNativeModule } from 'expo';

import { TimelapseCreatorModuleEvents } from './TimelapseCreator.types';

// ── New capture/stitch types (Phase 1) ──────────────────────────────────────

export type StartCaptureOptions = {
  sessionId: string;
  goalSec: number;        // 목표 공부 시간 (초). schedule 입력 변수
  outputSec: number;      // 사용자 선택 출력 길이 (초). schedule 입력 변수
  outputFps: number;      // 30 고정 (D-SPEC-2-3)
  cameraFacing: 'front' | 'back';
  baseDir: string;        // documentDirectory/sessions/{sessionId} 부모 (D-SPEC-2-2)
};

export type StopCaptureResult = {
  captureCount: number;
  captureDir: string;
  elapsedSec: number;
};

export type StitchOverlayMeta = {
  recordingSec: number;
  goalSec: number;
  outputSec: number;
  streak?: number;
  logoPath?: string;
};

export type StitchOptions = {
  captureDir: string;     // captures/ 디렉토리
  outputPath: string;     // 결과 MP4 경로
  width: number;
  height: number;
  outputFps: number;      // 30
  overlayStyle: 'none' | 'timer' | 'progress' | 'streak';
  overlayMeta: StitchOverlayMeta;
};

// ── Module declaration ──────────────────────────────────────────────────────

declare class TimelapseCreatorModule extends NativeModule<TimelapseCreatorModuleEvents> {
  // ── Legacy (T-011에서 제거 예정) ──
  createTimelapse(options: {
    videoUri: string;
    outputPath: string;
    outputSeconds: number;
    width: number;
    height: number;
    frameRate: number;
    bitRate: number;
    overlayStyle: string;
    overlayText: string;
    streak: number;
    timerMode: string;
    recordingSeconds: number;
    goalSeconds: number;
  }): Promise<string>;
  applyOverlay(options: {
    videoUri: string;
    outputPath: string;
    overlayStyle: string;
    overlayText: string;
    streak: number;
    recordingSeconds: number;
    goalSeconds: number;
    timerMode: string;
    width: number;
    height: number;
  }): Promise<string>;

  // ── Phase 1: 새 캡처/스티치 API ──
  startCapture(options: StartCaptureOptions): Promise<void>;
  pauseCapture(): Promise<void>;
  resumeCapture(): Promise<void>;
  stopCapture(): Promise<StopCaptureResult>;
  stitchTimelapse(options: StitchOptions): Promise<string>;
}

export default requireNativeModule<TimelapseCreatorModule>('TimelapseCreator');
