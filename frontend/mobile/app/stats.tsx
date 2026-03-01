import { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getWeeklyStats, getDailyStats } from '../src/api/stats';
import { getMe } from '../src/api/user';
import { COLORS } from '../src/constants';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatHoursMinutes(totalSeconds: number): { hours: number; minutes: number } {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return { hours: h, minutes: m };
}

function getToday(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  // 0=Sun → convert to Mon-based (0=Mon)
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function StatsScreen() {
  const router = useRouter();
  const today = getToday();
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // 날짜/바 클릭 말풍선
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSeconds, setSelectedSeconds] = useState(0);
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number; cellCenterX: number } | null>(null);
  const [barBubble, setBarBubble] = useState<{ label: string; seconds: number } | null>(null);
  const cellRefs = useRef<Map<string, View>>(new Map());

  const { data: statsData } = useQuery({
    queryKey: ['weekly-stats'],
    queryFn: () => getWeeklyStats().then((r) => r.data),
  });

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
  });

  // 캘린더 월별 데이터
  const monthStart = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;
  const monthEnd = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(getDaysInMonth(calYear, calMonth)).padStart(2, '0')}`;
  const { data: monthlyData } = useQuery({
    queryKey: ['daily-stats', calYear, calMonth],
    queryFn: () => getDailyStats(monthStart, monthEnd).then((r) => r.data),
  });

  const weeklyStats = statsData?.data;
  const user = userData?.data;

  // Today's focus time
  const todayEntry = weeklyStats?.daily?.find((d) => d.date === today);
  const todaySeconds = todayEntry?.total_seconds ?? 0;
  const { hours: todayH, minutes: todayM } = formatHoursMinutes(todaySeconds);

  // Streak
  const streak = user?.streak ?? 0;

  // Weekly bar chart
  const totalWeekSeconds = weeklyStats?.total_seconds ?? 0;
  const totalWeekHours = (totalWeekSeconds / 3600).toFixed(1);
  const dailyData = weeklyStats?.daily ?? [];

  const maxDailySeconds = useMemo(
    () => Math.max(...dailyData.map((d) => d.total_seconds), 1),
    [dailyData],
  );

  // Calendar
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);

  const sessionDates = useMemo(() => {
    const set = new Set<string>();
    const calData = monthlyData?.data ?? [];
    calData.forEach((d: { date: string; session_count: number }) => {
      if (d.session_count > 0) set.add(d.date);
    });
    return set;
  }, [monthlyData]);

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalYear(calYear - 1);
      setCalMonth(11);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalYear(calYear + 1);
      setCalMonth(0);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [firstDay, daysInMonth]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Focus</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Stat Cards Row */}
        <View style={styles.cardsRow}>
          {/* Today Card */}
          <View style={styles.statCard}>
            <Text style={styles.statCardLabel}>TODAY</Text>
            <Text style={styles.statCardValue}>
              {todayH}h {todayM}m
            </Text>
          </View>

          {/* Streak Card */}
          <View style={styles.statCard}>
            <Text style={styles.statCardLabel}>STREAK</Text>
            <Text style={styles.statCardValue}>
              <Text style={styles.streakNumber}>{streak}</Text>
              <Text style={styles.streakUnit}> days</Text>
            </Text>
          </View>
        </View>

        {/* Weekly Bar Chart Card */}
        <View style={styles.card}>
          <View style={styles.chartTitleRow}>
            <Text style={styles.cardTitle}>This Week</Text>
            <Text style={styles.chartSubtitle}>{totalWeekHours} hrs total</Text>
          </View>

          {/* 바 클릭 말풍선 — 카드 우측 상단 고정 */}
          {barBubble && (
            <TouchableOpacity
              style={styles.barBubbleWrap}
              activeOpacity={1}
              onPress={() => setBarBubble(null)}
            >
              <View style={[styles.sharedBubble, styles.barBubble]}>
                <Text style={styles.barBubbleDate}>{barBubble.label}</Text>
                <Text style={styles.barBubbleTime}>
                  {(() => {
                    const h = Math.floor(barBubble.seconds / 3600);
                    const m = Math.floor((barBubble.seconds % 3600) / 60);
                    return h > 0 ? `${h}h ${m}m` : `${m}m`;
                  })()}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          <View style={styles.barChart}>
            {DAY_LABELS.map((label, i) => {
              const dayData = dailyData[i];
              const secs = dayData?.total_seconds ?? 0;
              const hasData = secs > 0;
              const barHeight = hasData
                ? Math.max(16, (secs / maxDailySeconds) * 80)
                : 16;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.barCol}
                  disabled={!hasData}
                  onPress={() => {
                    if (!hasData) return;
                    const weekStart = weeklyStats?.week_start;
                    let dateLabel = label;
                    if (weekStart) {
                      const d = new Date(weekStart);
                      d.setDate(d.getDate() + i);
                      dateLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
                    }
                    setBarBubble({ label: dateLabel, seconds: secs });
                  }}
                >
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: hasData ? '#1a1a1a' : '#E0E0E0',
                        borderRadius: hasData ? 6 : 8,
                      },
                    ]}
                  />
                  <Text style={[styles.barLabel, hasData && styles.barLabelActive]}>
                    {(() => {
                      const weekStart = weeklyStats?.week_start;
                      if (weekStart) {
                        const d = new Date(weekStart);
                        d.setDate(d.getDate() + i);
                        const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        return `${shortMonths[d.getMonth()]} ${d.getDate()}`;
                      }
                      return label;
                    })()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Activity Log Card */}
        <View style={styles.card}>
          <View style={styles.activityHeader}>
            <Text style={styles.cardTitle}>Activity Log</Text>
          </View>

          {/* Month Navigator */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
              <Text style={styles.monthArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
              <Text style={styles.monthArrowText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day of week headers */}
          <View style={styles.calRow}>
            {DAY_LABELS.map((d, i) => (
              <Text key={i} style={styles.calDayHeader}>
                {d}
              </Text>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.calGrid}>
            {calendarCells.map((day, i) => {
              if (day === null) {
                return <View key={`empty-${i}`} style={styles.calCell} />;
              }
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === today;
              const hasSession = sessionDates.has(dateStr);

              const calData = monthlyData?.data ?? [];
              const dayEntry = calData.find((d: any) => d.date === dateStr);

              return (
                <View
                  key={dateStr}
                  style={styles.calCell}
                  ref={(el) => {
                    if (el) cellRefs.current.set(dateStr, el);
                    else cellRefs.current.delete(dateStr);
                  }}
                >
                  {hasSession ? (
                    // 세션 있는 날: 클릭 가능
                    <TouchableOpacity
                      style={Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : undefined}
                      onPress={() => {
                        const cell = cellRefs.current.get(dateStr);
                        if (!cell) return;
                        cell.measure((_fx, _fy, width, _height, px, py) => {
                          const tooltipW = 140;
                          const cellCenterX = px + width / 2;
                          const left = Math.min(Math.max(cellCenterX - tooltipW / 2, 8), 300);
                          const top = py - 65;
                          setSelectedDate(dateStr);
                          setSelectedSeconds(dayEntry?.total_seconds ?? 0);
                          setBubblePos({ x: left, y: top, cellCenterX });
                        });
                      }}
                    >
                      <View style={[styles.calDotFilled, isToday && styles.calDotTodayRing]}>
                        <Text style={styles.calDayTextFilled}>{day}</Text>
                      </View>
                    </TouchableOpacity>
                  ) : isToday ? (
                    // 오늘(세션 없음): 테두리 원만
                    <View style={styles.calDotToday}>
                      <Text style={styles.calDayTextToday}>{day}</Text>
                    </View>
                  ) : (
                    <Text style={styles.calDayText}>{day}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 캘린더 날짜 말풍선 — 클릭 위치 기준 고정 */}
      {selectedDate && bubblePos && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setSelectedDate(null)}
        >
          <View style={{ position: 'absolute', top: bubblePos.y, left: bubblePos.x, width: 140 }}>
            <View style={[styles.sharedBubble, { width: 140 }]}>
              <Text style={styles.sharedBubbleDate}>
                {`${MONTH_NAMES[parseInt(selectedDate.split('-')[1]) - 1]} ${parseInt(selectedDate.split('-')[2])}`}
              </Text>
              <Text style={styles.sharedBubbleTime}>
                {(() => {
                  const h = Math.floor(selectedSeconds / 3600);
                  const m = Math.floor((selectedSeconds % 3600) / 60);
                  return h > 0 ? `${h}h ${m}m` : `${m}m`;
                })()}
              </Text>
            </View>
            {/* 꼬리: 날짜 셀 중앙을 가리키도록 offset 계산 */}
            <View style={[styles.bubbleTail, {
              alignSelf: 'flex-start',
              marginLeft: Math.max(0, Math.min(bubblePos.cellCenterX - bubblePos.x - 7, 126)),
            }]} />
          </View>
        </TouchableOpacity>
      )}

      {/* 바 차트 클릭 말풍선 — 배경 터치 닫기 */}
      {barBubble && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setBarBubble(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFF',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.text,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },

  // Stat cards row
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statCardIcon: {
    fontSize: 14,
  },
  statCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  statCardValue: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
  },
  streakNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.accent,
  },
  streakUnit: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },

  // Cards
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Bar chart
  chartTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    paddingBottom: 4,
    marginTop: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  bar: {
    width: 28,
  },
  barLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  barLabelActive: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 9,
  },

  // Activity Log
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  calendarIcon: {
    fontSize: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  monthArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 140,
    textAlign: 'center',
  },
  calRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayText: {
    fontSize: 13,
    color: '#1a1a1a',
  },
  calDotFilled: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDotTodayRing: {
    // 오늘이면서 세션도 있는 경우: 검정 채운 원 + 흰 테두리 느낌
    borderWidth: 2.5,
    borderColor: '#FF6B35',
  },
  calDayTextFilled: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '700',
  },
  calDotToday: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayTextToday: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '700',
  },

  // 말풍선 (캘린더용)
  // 공통 말풍선 — 캘린더/바 차트 동일 스타일
  sharedBubble: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 8,
    minWidth: 120,
  },
  sharedBubbleDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  sharedBubbleTime: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  // 바 차트 말풍선 wrapper — 카드 우측 상단 고정
  barBubbleWrap: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
  },
  barBubble: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 0,
    borderRadius: 8,
  },
  barBubbleDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  barBubbleTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  // 캘린더 말풍선 꼬리
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1a1a1a',
  },
});
