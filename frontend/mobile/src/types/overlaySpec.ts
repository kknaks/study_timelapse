/**
 * OverlaySpec - 오버레이 레이아웃 타입 정의
 * 모든 수치는 pt (포인트) 단위, 390pt 기준 iPhone 화면 기준값
 *
 * RN 미리보기: pt 값 그대로 사용
 * Swift export: px = pt × (videoWidth / 390.0) 로 변환
 */

export interface WatermarkSpec {
  /** 로고 좌측 여백 (pt) */
  paddingLeft: number;
  /** 로고 하단 여백 (pt) */
  paddingBottom: number;
  /** 로고 크기 (pt, 정사각형) */
  logoSize: number;
  /** 로고-텍스트 간격 (pt) */
  gap: number;
  /** 텍스트 폰트 크기 (pt) */
  fontSize: number;
}

export interface ProgressOverlaySpec {
  /** 우측 여백 (pt) */
  paddingRight: number;
  /** 상단 여백 (pt) */
  paddingTop: number;
  /** 라벨 폰트 크기 (pt) */
  fontSize: number;
  /** 라벨-바 간격 (pt) */
  labelGap: number;
  /** 바 너비 (pt) */
  barWidth: number;
  /** 바 높이 (pt) */
  barHeight: number;
}

export interface TimerOverlaySpec {
  /** 우측 여백 (pt) */
  paddingRight: number;
  /** 상단 여백 (pt) */
  paddingTop: number;
  /** 폰트 크기 (pt) */
  fontSize: number;
}

export interface StreakOverlaySpec {
  /** 우측 여백 (pt) */
  paddingRight: number;
  /** 상단 여백 (pt) */
  paddingTop: number;
  /** 폰트 크기 (pt) */
  fontSize: number;
}

export interface OverlaySpec {
  watermark: WatermarkSpec;
  progress: ProgressOverlaySpec;
  timer: TimerOverlaySpec;
  streak: StreakOverlaySpec;
}
