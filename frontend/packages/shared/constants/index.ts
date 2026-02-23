// ============================================
// Study Timelapse - 공유 상수
// ============================================

/** 타임랩스 출력 시간 옵션 (초) */
export const OUTPUT_DURATION_OPTIONS = [30, 60, 90] as const;

/** 기본 출력 시간 (초) */
export const DEFAULT_OUTPUT_SECONDS = 60;

/** 최소 공부 시간 (초) - 1분 */
export const MIN_STUDY_SECONDS = 60;

/** 최대 공부 시간 (초) - 12시간 */
export const MAX_STUDY_SECONDS = 12 * 60 * 60;

/** API 기본 URL — 환경변수는 각 앱에서 오버라이드 */
export let API_BASE_URL = 'http://localhost:8000';

/** API URL 설정 (앱 초기화 시 호출) */
export function setApiBaseUrl(url: string) {
  API_BASE_URL = url;
}

/** API 엔드포인트 */
export const API_ENDPOINTS = {
  UPLOAD: '/api/upload',
  TIMELAPSE: '/api/timelapse',
  TIMELAPSE_STATUS: (id: string) => `/api/timelapse/${id}`,
  DOWNLOAD: (id: string) => `/api/download/${id}`,
} as const;

/** 타임랩스 배속 계산 */
export function calculateSpeedMultiplier(
  recordingSeconds: number,
  outputSeconds: number,
): number {
  return Math.ceil(recordingSeconds / outputSeconds);
}
