import {
  formatGoalLabel,
  formatDurationCompact,
  formatTimerDisplay,
  formatFocusMinutes,
  formatWeeklyHours,
} from '../src/utils/timeFormat';

// ─── formatGoalLabel ───────────────────────────────────────────────────────────
describe('formatGoalLabel', () => {
  // 분 단위 (1시간 미만)
  test('0초 → "0 mins"', () => expect(formatGoalLabel(0)).toBe('0 mins'));
  test('60초(1분) → "1 min"', () => expect(formatGoalLabel(60)).toBe('1 min'));
  test('120초(2분) → "2 mins"', () => expect(formatGoalLabel(120)).toBe('2 mins'));
  test('1800초(30분) → "30 mins"', () => expect(formatGoalLabel(1800)).toBe('30 mins'));
  test('3540초(59분) → "59 mins"', () => expect(formatGoalLabel(3540)).toBe('59 mins'));

  // 시간 단위 (정각)
  test('3600초(1시간) → "1 hr"', () => expect(formatGoalLabel(3600)).toBe('1 hr'));
  test('7200초(2시간) → "2 hrs"', () => expect(formatGoalLabel(7200)).toBe('2 hrs'));
  test('10800초(3시간) → "3 hrs"', () => expect(formatGoalLabel(10800)).toBe('3 hrs'));

  // 시간 + 분 조합
  test('5400초(1시간 30분) → "1 hr 30 mins"', () => expect(formatGoalLabel(5400)).toBe('1 hr 30 mins'));
  test('7260초(2시간 1분) → "2 hrs 1 min"', () => expect(formatGoalLabel(7260)).toBe('2 hrs 1 min'));
  test('3660초(1시간 1분) → "1 hr 1 min"', () => expect(formatGoalLabel(3660)).toBe('1 hr 1 min'));
  test('9000초(2시간 30분) → "2 hrs 30 mins"', () => expect(formatGoalLabel(9000)).toBe('2 hrs 30 mins'));

  // 초 절삭 (floor to minutes) — 3659초 = 60분 59초 → 60분 = 1 hr
  test('3659초(60분 59초) → "1 hr"', () => expect(formatGoalLabel(3659)).toBe('1 hr'));
  // 3661초 = 1시간 1분 1초 → 61분 = 1 hr 1 min
  test('3661초(1시간 1분 1초) → "1 hr 1 min"', () => expect(formatGoalLabel(3661)).toBe('1 hr 1 min'));
  // 3599초 = 59분 59초 → 59분 = "59 mins"
  test('3599초(59분 59초) → "59 mins"', () => expect(formatGoalLabel(3599)).toBe('59 mins'));
});

// ─── formatDurationCompact ────────────────────────────────────────────────────
describe('formatDurationCompact', () => {
  test('0초 → "0m"', () => expect(formatDurationCompact(0)).toBe('0m'));
  test('60초(1분) → "1m"', () => expect(formatDurationCompact(60)).toBe('1m'));
  test('2700초(45분) → "45m"', () => expect(formatDurationCompact(2700)).toBe('45m'));
  test('3600초(1시간) → "1h"', () => expect(formatDurationCompact(3600)).toBe('1h'));
  test('5400초(1시간 30분) → "1h 30m"', () => expect(formatDurationCompact(5400)).toBe('1h 30m'));
  test('7200초(2시간) → "2h"', () => expect(formatDurationCompact(7200)).toBe('2h'));
  test('7260초(2시간 1분) → "2h 1m"', () => expect(formatDurationCompact(7260)).toBe('2h 1m'));
  test('59초 → "0m"', () => expect(formatDurationCompact(59)).toBe('0m'));
});

// ─── formatTimerDisplay ───────────────────────────────────────────────────────
describe('formatTimerDisplay', () => {
  test('0초 → "00:00"', () => expect(formatTimerDisplay(0)).toBe('00:00'));
  test('65초 → "01:05"', () => expect(formatTimerDisplay(65)).toBe('01:05'));
  test('3599초 → "59:59"', () => expect(formatTimerDisplay(3599)).toBe('59:59'));
  test('3600초(1시간) → "1:00:00"', () => expect(formatTimerDisplay(3600)).toBe('1:00:00'));
  test('3661초 → "1:01:01"', () => expect(formatTimerDisplay(3661)).toBe('1:01:01'));
  test('7384초(2시간 3분 4초) → "2:03:04"', () => expect(formatTimerDisplay(7384)).toBe('2:03:04'));
  // 소수점 floor
  test('65.9초 → "01:05"', () => expect(formatTimerDisplay(65.9)).toBe('01:05'));
});

// ─── formatFocusMinutes ───────────────────────────────────────────────────────
describe('formatFocusMinutes', () => {
  test('5분 → "5m"', () => expect(formatFocusMinutes(5)).toBe('5m'));
  test('30분 → "30m"', () => expect(formatFocusMinutes(30)).toBe('30m'));
  test('59분 → "59m"', () => expect(formatFocusMinutes(59)).toBe('59m'));
  test('60분 → "1h"', () => expect(formatFocusMinutes(60)).toBe('1h'));
  test('90분 → "1h 30m"', () => expect(formatFocusMinutes(90)).toBe('1h 30m'));
  test('120분 → "2h"', () => expect(formatFocusMinutes(120)).toBe('2h'));
  test('240분 → "4h"', () => expect(formatFocusMinutes(240)).toBe('4h'));
});

// ─── formatWeeklyHours ────────────────────────────────────────────────────────
describe('formatWeeklyHours', () => {
  test('0초 → "0.0h"', () => expect(formatWeeklyHours(0)).toBe('0.0h'));
  test('3600초 → "1.0h"', () => expect(formatWeeklyHours(3600)).toBe('1.0h'));
  test('5400초 → "1.5h"', () => expect(formatWeeklyHours(5400)).toBe('1.5h'));
  test('9000초 → "2.5h"', () => expect(formatWeeklyHours(9000)).toBe('2.5h'));
  test('36000초(10시간) → "10.0h"', () => expect(formatWeeklyHours(36000)).toBe('10.0h'));
  // 소수점 반올림
  test('3960초(1.1h) → "1.1h"', () => expect(formatWeeklyHours(3960)).toBe('1.1h'));
});

// ─── JS ↔ Swift 규칙 일치 검증 ───────────────────────────────────────────────
describe('formatGoalLabel JS↔Swift 규칙 일치', () => {
  // Swift formatGoalText와 동일한 출력이어야 함
  const cases: [number, string][] = [
    [60, '1 min'],
    [120, '2 mins'],
    [1800, '30 mins'],
    [3600, '1 hr'],
    [7200, '2 hrs'],
    [5400, '1 hr 30 mins'],
    [7260, '2 hrs 1 min'],
    [3660, '1 hr 1 min'],
  ];
  test.each(cases)('formatGoalLabel(%d초) === "%s"', (secs, expected) => {
    expect(formatGoalLabel(secs)).toBe(expected);
  });
});
