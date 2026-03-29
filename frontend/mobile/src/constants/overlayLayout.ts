import type { OverlaySpec } from '../types/overlaySpec';

/**
 * OVERLAY_LAYOUT - 오버레이 레이아웃 단일 정의
 *
 * 단위: pt (포인트) — 390pt 기준 iPhone 화면 기준값
 * RN: 그대로 pt 단위로 사용
 * Swift: px = pt × (videoWidth / 390.0) 로 변환
 *
 * 이 파일만 수정하면 미리보기와 저장 영상 모두 동시에 바뀜
 */
export const OVERLAY_LAYOUT = {
  watermark: {
    paddingLeft: 16,
    paddingBottom: 16,
    logoSize: 28,
    gap: 8,
    fontSize: 22,
  },
  progress: {
    paddingRight: 16,
    paddingTop: 16,
    fontSize: 24,
    labelGap: 8,
    barWidth: 140,
    barHeight: 11,
  },
  timer: {
    paddingRight: 16,
    paddingTop: 16,
    fontSize: 24,
  },
  streak: {
    paddingRight: 16,
    paddingTop: 16,
    fontSize: 24,
  },
} as const satisfies OverlaySpec;

/** Swift 변환용: pt → px 스케일 팩터 계산 */
export function getOverlayScale(videoWidth: number): number {
  return videoWidth / 390.0;
}

/** pt 값을 videoWidth 기준 px로 변환 */
export function ptToPx(pt: number, videoWidth: number): number {
  return pt * getOverlayScale(videoWidth);
}
