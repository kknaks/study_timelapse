import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { createSession } from '../src/api/sessions';
import { COLORS, ASPECT_RATIOS } from '../src/constants';
import type { CreateSessionRequest } from '../src/types';

type TimerMode = 'countdown' | 'countup';
type AspectRatio = '9:16' | '1:1' | '16:9';

// 슬라이더 대신 스텝 버튼 방식 (웹 호환)
const FOCUS_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 210, 240]; // 분
const TIMELAPSE_OPTIONS = [15, 30, 45, 60, 90, 120]; // 초

function formatFocusTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h 0m`;
}

function estimateSizeMB(outputSeconds: number, aspectRatio: string): number {
  const base = 3.5; // MB per 30s
  const ratio = outputSeconds / 30;
  const mult = aspectRatio === '16:9' ? 1.2 : aspectRatio === '1:1' ? 0.8 : 1;
  return Math.round(base * ratio * mult);
}

export default function SessionSetupScreen() {
  const router = useRouter();

  const [focusMinutes, setFocusMinutes] = useState(120);
  const [outputSeconds, setOutputSeconds] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [timerMode, setTimerMode] = useState<TimerMode>('countdown');

  const mutation = useMutation({
    mutationFn: (data: CreateSessionRequest) => createSession(data),
    onSuccess: (res) => {
      const session = res.data?.data;
      router.push({
        pathname: '/focus',
        params: {
          sessionId: session?.id ?? '',
          studyMinutes: String(focusMinutes),
          outputSeconds: String(outputSeconds),
          aspectRatio,
          overlayStyle: 'none',
          timerMode,
        },
      });
    },
    onError: (error: Error) => {
      Alert.alert('Error', 'Failed to create session. Please try again.');
      console.error('Create session error:', error);
    },
  });

  const handleStart = () => {
    if (focusMinutes < 1) {
      Alert.alert('Too Short', 'Please set at least 1 minute.');
      return;
    }
    mutation.mutate({
      start_time: new Date().toISOString(),
      output_seconds: outputSeconds,
      aspect_ratio: aspectRatio,
      overlay_style: 'none',
    });
  };

  const sizeMB = estimateSizeMB(outputSeconds, aspectRatio);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Session</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Total Focus Time */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>TOTAL FOCUS TIME</Text>
            <Text style={styles.sectionValue}>{formatFocusTime(focusMinutes)}</Text>
          </View>
          <View style={styles.sliderTrack}>
            {FOCUS_OPTIONS.map((val) => (
              <TouchableOpacity
                key={val}
                style={[styles.sliderDot, focusMinutes === val && styles.sliderDotActive]}
                onPress={() => setFocusMinutes(val)}
              />
            ))}
          </View>
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderMin}>30m</Text>
            <Text style={styles.sliderMax}>4h</Text>
          </View>
          {/* 빠른 선택 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
            {FOCUS_OPTIONS.map((val) => (
              <TouchableOpacity
                key={val}
                style={[styles.quickChip, focusMinutes === val && styles.quickChipActive]}
                onPress={() => setFocusMinutes(val)}
              >
                <Text style={[styles.quickChipText, focusMinutes === val && styles.quickChipTextActive]}>
                  {formatFocusTime(val)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Timelapse Length */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>TIMELAPSE LENGTH</Text>
            <Text style={styles.sectionValue}>{outputSeconds}s</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
            {TIMELAPSE_OPTIONS.map((val) => (
              <TouchableOpacity
                key={val}
                style={[styles.quickChip, outputSeconds === val && styles.quickChipActive]}
                onPress={() => setOutputSeconds(val)}
              >
                <Text style={[styles.quickChipText, outputSeconds === val && styles.quickChipTextActive]}>
                  {val}s
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Aspect Ratio */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>🖥 ASPECT RATIO</Text>
          </View>
          <View style={styles.buttonRow}>
            {(ASPECT_RATIOS as readonly string[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.optionBtn, aspectRatio === r && styles.optionBtnActive]}
                onPress={() => setAspectRatio(r as AspectRatio)}
              >
                <Text style={[styles.optionBtnText, aspectRatio === r && styles.optionBtnTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Timer Display */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>⏱ TIMER DISPLAY</Text>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.optionBtn, timerMode === 'countdown' && styles.optionBtnActive]}
              onPress={() => setTimerMode('countdown')}
            >
              <Text style={[styles.optionBtnText, timerMode === 'countdown' && styles.optionBtnTextActive]}>
                Count Down
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionBtn, timerMode === 'countup' && styles.optionBtnActive]}
              onPress={() => setTimerMode('countup')}
            >
              <Text style={[styles.optionBtnText, timerMode === 'countup' && styles.optionBtnTextActive]}>
                Count Up
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Estimate Card */}
        <View style={styles.estimateCard}>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>Estimated Video:</Text>
            <Text style={styles.estimateValue}>{outputSeconds} seconds</Text>
          </View>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>Estimated Size:</Text>
            <Text style={styles.estimateValue}>~{sizeMB} MB</Text>
          </View>
        </View>
      </ScrollView>

      {/* Start Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.startButton, mutation.isPending && styles.startButtonDisabled]}
          onPress={handleStart}
          disabled={mutation.isPending}
          activeOpacity={0.85}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.startIcon}>▶</Text>
              <Text style={styles.startText}>Start Recording</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
    paddingBottom: 20,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
  },
  sectionValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  sliderTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 4,
    backgroundColor: '#E8E8E8',
    borderRadius: 2,
    paddingHorizontal: 4,
  },
  sliderDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#DDD',
  },
  sliderDotActive: {
    backgroundColor: '#1a1a1a',
    transform: [{ scale: 1.3 }],
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderMin: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  sliderMax: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  quickScroll: {
    flexGrow: 0,
  },
  quickChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  quickChipActive: {
    backgroundColor: '#1a1a1a',
  },
  quickChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  quickChipTextActive: {
    color: '#FFF',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  optionBtnActive: {
    backgroundColor: '#1a1a1a',
  },
  optionBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  optionBtnTextActive: {
    color: '#FFF',
  },
  estimateCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  estimateLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  estimateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  bottomBar: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  startButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startIcon: {
    color: '#FFF',
    fontSize: 16,
  },
  startText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
