// ============================================
// Study Timelapse - 공유 타입 정의
// Web / Mobile 공통 사용
// ============================================

/** 타이머 상태 */
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

/** 타이머 설정 */
export interface TimerConfig {
  /** 공부 시간 (초 단위) */
  durationSeconds: number;
  /** 타임랩스 출력 시간 (초 단위) */
  outputSeconds: number;
  /** 출력 비율 */
  aspectRatio: AspectRatio;
}

/** 타이머 상태 */
export interface TimerState {
  /** 현재 상태 */
  status: TimerStatus;
  /** 경과 시간 (초) */
  elapsedSeconds: number;
  /** 남은 시간 (초) */
  remainingSeconds: number;
}

/** 녹화 상태 */
export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

/** 업로드 상태 */
export type UploadStatus = 'idle' | 'uploading' | 'completed' | 'failed';

/** 타임랩스 변환 상태 */
export type ConversionStatus = 'idle' | 'processing' | 'completed' | 'failed';

/** 업로드 진행 정보 */
export interface UploadProgress {
  status: UploadStatus;
  /** 진행률 (0~100) */
  percentage: number;
}

/** 타임랩스 변환 진행 정보 */
export interface ConversionProgress {
  status: ConversionStatus;
  /** 진행률 (0~100) */
  percentage: number;
  /** 변환 작업 ID */
  taskId?: string;
}

/** 타임랩스 결과 */
export interface TimelapseResult {
  /** 작업 ID */
  id: string;
  /** 다운로드 URL */
  downloadUrl: string;
  /** 출력 영상 시간 (초) */
  outputDuration: number;
  /** 배속 */
  speedMultiplier: number;
}

/** API 업로드 응답 */
export interface UploadResponse {
  /** 업로드된 파일 ID */
  fileId: string;
  /** 파일명 */
  filename: string;
}

/** 출력 비율 */
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

/** 오버레이 테마 */
export type OverlayTheme =
  | 'stopwatch'      // 디지털 초시계
  | 'analog-clock'   // 아날로그 시계
  | 'progress-bar'   // 프로그레스 바
  | 'minimal'        // 심플 텍스트
  | 'none';          // 오버레이 없음

/** 오버레이 설정 */
export interface OverlayConfig {
  theme: OverlayTheme;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  color: string;     // hex
  size: 'sm' | 'md' | 'lg';
}

/** API 타임랩스 요청 */
export interface TimelapseRequest {
  /** 업로드된 파일 ID */
  fileId: string;
  /** 목표 출력 시간 (초) */
  outputSeconds: number;
  /** 실제 녹화 시간 (초) — 프론트 타이머 기준 */
  recordingSeconds: number;
  /** 출력 비율 — 백엔드에서 FFmpeg crop 처리 */
  aspectRatio?: AspectRatio;
  /** 오버레이 설정 (DB 기록용, 백엔드는 오버레이 안 함) */
  overlay?: OverlayConfig;
}

/** API 타임랩스 최종 저장 요청 */
export interface TimelapseSaveRequest {
  /** 작업 ID */
  taskId: string;
  /** 오버레이 설정 */
  overlay: OverlayConfig;
  /** 최종 합성 영상 (프론트에서 Canvas 합성한 Blob) */
  composited?: boolean;
}

/** API 타임랩스 상태 응답 */
export interface TimelapseStatusResponse {
  /** 작업 ID */
  taskId: string;
  /** 상태 */
  status: ConversionStatus;
  /** 진행률 (0~100) */
  progress: number;
  /** 다운로드 URL (완료 시) */
  downloadUrl?: string;
}

/** 지원 언어 */
export type SupportedLocale = 'ko' | 'zh' | 'ja' | 'en' | 'es';
