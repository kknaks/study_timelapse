// ============================================
// Study Timelapse - 공유 유틸 함수
// 순수 함수만 (플랫폼 독립적)
// ============================================

/**
 * 초를 HH:MM:SS 형식으로 변환
 * @example formatTime(3661) → "01:01:01"
 */
export function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

/**
 * 초를 읽기 쉬운 형식으로 변환
 * @example formatDurationHuman(7200) → "2시간" (ko)
 * @example formatDurationHuman(5400) → "1시간 30분" (ko)
 */
export function formatDurationHuman(
  totalSeconds: number,
  locale: string = 'ko',
): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const labels: Record<string, { h: string; m: string }> = {
    ko: { h: '시간', m: '분' },
    zh: { h: '小时', m: '分钟' },
    ja: { h: '時間', m: '分' },
    en: { h: 'h', m: 'min' },
    es: { h: 'h', m: 'min' },
  };

  const label = labels[locale] ?? labels.en;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}${label.h}`);
  if (minutes > 0) parts.push(`${minutes}${label.m}`);

  return parts.join(' ') || `0${label.m}`;
}

/**
 * 시간/분을 초로 변환
 */
export function toSeconds(hours: number, minutes: number): number {
  return hours * 3600 + minutes * 60;
}

/**
 * 배속 계산
 * @example calculateSpeed(7200, 60) → 120 (2시간 → 60초 = 120배속)
 */
export function calculateSpeed(
  recordingSeconds: number,
  outputSeconds: number,
): number {
  if (outputSeconds <= 0) return 1;
  return Math.ceil(recordingSeconds / outputSeconds);
}

/**
 * 퍼센트 계산 (0~100 범위 보장)
 */
export function calculatePercentage(
  current: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}
