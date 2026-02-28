import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../src/api/user';
import { getWeeklyStats } from '../src/api/stats';
import { COLORS } from '../src/constants';
import type { User, WeeklyStats } from '../src/types';

function formatMinutes(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

export default function HomeScreen() {
  const router = useRouter();

  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await getMe();
      return res.data;
    },
  });

  const {
    data: weeklyData,
    isLoading: weeklyLoading,
    error: weeklyError,
    refetch: refetchWeekly,
  } = useQuery({
    queryKey: ['weeklyStats'],
    queryFn: async () => {
      const res = await getWeeklyStats();
      return res.data;
    },
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchUser(), refetchWeekly()]);
    setRefreshing(false);
  };

  const isLoading = userLoading || weeklyLoading;
  const hasError = userError || weeklyError;

  // Today's focus time from weekly daily data
  const todayStr = new Date().toISOString().split('T')[0];
  const todayFocus = weeklyData?.daily?.find((d) => d.date === todayStr);
  const todaySeconds = todayFocus?.total_seconds ?? 0;
  const weeklyTotalSeconds = weeklyData?.total_seconds ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>📹 FocusTimelapse</Text>
          <Text style={styles.tagline}>Turn your focus into content</Text>
        </View>

        {isLoading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>Could not connect to server</Text>
            <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Streak Card */}
            <View style={styles.card}>
              <View style={styles.streakRow}>
                <Text style={styles.streakEmoji}>🔥</Text>
                <View>
                  <Text style={styles.streakNumber}>{userData?.streak ?? 0} days</Text>
                  <Text style={styles.streakLabel}>Current Streak</Text>
                </View>
              </View>
              {(userData?.longest_streak ?? 0) > 0 && (
                <Text style={styles.longestStreak}>
                  Best: {userData?.longest_streak} days
                </Text>
              )}
            </View>

            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={[styles.card, styles.statCard]}>
                <Text style={styles.statEmoji}>⏱️</Text>
                <Text style={styles.statValue}>{formatMinutes(todaySeconds)}</Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
              <View style={[styles.card, styles.statCard]}>
                <Text style={styles.statEmoji}>📊</Text>
                <Text style={styles.statValue}>{formatMinutes(weeklyTotalSeconds)}</Text>
                <Text style={styles.statLabel}>This Week</Text>
              </View>
            </View>

            {/* Session Credit */}
            <View style={[styles.card, styles.creditCard]}>
              <Text style={styles.creditIcon}>🎬</Text>
              <View style={styles.creditInfo}>
                <Text style={styles.creditTitle}>
                  {userData?.subscription_status === 'pro'
                    ? 'Unlimited Sessions'
                    : '1 Focus Session Available Today'}
                </Text>
                <Text style={styles.creditSub}>
                  {userData?.subscription_status === 'free' ? 'Free Plan' : 
                   userData?.subscription_status === 'trial' ? 'Trial' : 'Pro Plan'}
                </Text>
              </View>
            </View>

            {/* Total Focus Time */}
            <View style={[styles.card, styles.totalCard]}>
              <Text style={styles.totalLabel}>Total Focus Time</Text>
              <Text style={styles.totalValue}>
                {formatMinutes(userData?.total_focus_time ?? 0)}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Start Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => router.push('/session-setup')}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>▶ Start Focus Session</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 12,
  },
  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  errorEmoji: {
    fontSize: 40,
  },
  errorText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  streakEmoji: {
    fontSize: 40,
  },
  streakNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.accent,
  },
  streakLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  longestStreak: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
  },
  statEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  creditCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  creditIcon: {
    fontSize: 32,
  },
  creditInfo: {
    flex: 1,
  },
  creditTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  creditSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  totalCard: {
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 36,
    backgroundColor: COLORS.background,
  },
  startButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
