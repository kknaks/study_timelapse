/**
 * timeFormat.ts — 앱 전체 시간 표시 유틸리티
 *
 * 단수/복수 규칙:
 *   1 hr / 2 hrs
 *   1 min / 2 mins
 *
 * 용도별 함수:
 *   formatGoalLabel    — progress bar goal label (예: "1 hr", "2 hrs", "30 mins", "1 hr 30 mins")
 *   formatDurationCompact — stats/focus 등 compact 형태 (예: "1h 30m", "45m")
 *   formatTimerDisplay  — 타이머 디스플레이 "HH:MM:SS" 또는 "MM:SS"
 *   formatFocusMinutes  — session-setup 슬라이더 (예: "30m", "1h", "1h 30m")
 *   formatWeeklyHours   — 주간 통계 소수점 한 자리 (예: "3.5h")
 */

/**
 * 초 → goal label (progress bar 오른쪽 텍스트)
 * 1시간 = "1 hr", 2시간 = "2 hrs"
 * 1시간 30분 = "1 hr 30 mins"
 * 30분 = "30 mins", 1분 = "1 min"
 */
export function formatGoalLabel(totalSeconds: number): string {
  const totalMins = Math.floor(totalSeconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  if (h > 0 && m > 0) {
    const hrLabel = h === 1 ? '1 hr' : `${h} hrs`;
    const minLabel = m === 1 ? '1 min' : `${m} mins`;
    return `${hrLabel} ${minLabel}`;
  }
  if (h > 0) {
    return h === 1 ? '1 hr' : `${h} hrs`;
  }
  return m === 1 ? '1 min' : `${m} mins`;
}

/**
 * 초 → compact 표시 (stats, focus 등)
 * 0초 = "0m"
 * 45분 = "45m"
 * 1시간 = "1h"
 * 1시간 30분 = "1h 30m"
 */
export function formatDurationCompact(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * 초 → 타이머 디스플레이 "HH:MM:SS" or "MM:SS"
 * focus.tsx, result.tsx 등
 */
export function formatTimerDisplay(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * 분 → session-setup 슬라이더 표시
 * 30 → "30m", 60 → "1h", 90 → "1h 30m"
 */
export function formatFocusMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * 초 → 주간 통계 소수점 한 자리 (예: "3.5h")
 */
export function formatWeeklyHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(1)}h`;
}
