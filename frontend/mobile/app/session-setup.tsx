import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { createSession } from '../src/api/sessions';
import { s } from '../src/constants/strings';
import axios from 'axios';
import Slider from '@react-native-community/slider';
import { COLORS, ASPECT_RATIOS } from '../src/constants';
import type { CreateSessionRequest, Session } from '../src/types';
import { formatFocusMinutes } from '../src/utils/timeFormat';

type TimerMode = 'countdown' | 'countup';
type AspectRatio = '9:16' | '1:1' | '3:4';

// 5s/10s는 focus time 2시간(120분) 이하일 때만 활성화
const TIMELAPSE_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120]; // 초
const SHORT_TIMELAPSE_MAX_MINUTES = 120; // 2시간 초과 시 5s/10s 비활성화
const FOCUS_MIN = 5;
const FOCUS_MAX = 240;
const FOCUS_STEP = 5;

function estimateSizeMB(outputSeconds: number, aspectRatio: string): number {
  const base = 3.5; // MB per 30s
  const ratio = outputSeconds / 30;
  const mult = aspectRatio === '16:9' ? 1.2 : aspectRatio === '1:1' ? 0.8 : 1;
  return Math.round(base * ratio * mult);
}

export default function SessionSetupScreen() {
  const router = useRouter();

  const [focusMinutes, setFocusMinutes] = useState(120);

  const handleFocusChange = (val: number) => {
    setFocusMinutes(val);
    // 2시간 초과 시 5s/10s 선택 상태면 15s로 자동 변경
    if (val > SHORT_TIMELAPSE_MAX_MINUTES && outputSeconds <= 10) {
      setOutputSeconds(15);
    }
  };
  const [outputSeconds, setOutputSeconds] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [timerMode, setTimerMode] = useState<TimerMode>('countdown');
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [quotaModal, setQuotaModal] = useState<{ visible: boolean; resetsAt: string }>({
    visible: false,
    resetsAt: '',
  });

  const mutation = useMutation({
    mutationFn: (data: CreateSessionRequest) => createSession(data),
    onSuccess: (res) => {
      const session = (res.data as unknown as { data: Session }).data;
      router.push({
        pathname: '/focus',
        params: {
          sessionId: session?.id ?? '',
          studyMinutes: String(focusMinutes),
          outputSeconds: String(outputSeconds),
          aspectRatio,
          timerMode,
        },
      });
    },
    onError: (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const code = error.response?.data?.error_code ?? error.response?.data?.detail;
        if (status === 403 && code === 'DAILY_QUOTA_EXCEEDED') {
          const resetsAt = error.response?.data?.daily_quota_resets_at ?? '자정';
          setQuotaModal({ visible: true, resetsAt });
          return;
        }
      }
      Alert.alert('Error', 'Failed to create session. Please try again.');
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
      overlay_style: 'none', // 오버레이는 result 화면에서 선택
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
            <Text style={styles.sectionValue}>{formatFocusMinutes(focusMinutes)}</Text>
          </View>
          {Platform.OS === 'web' ? (
            // 웹: 네이티브 range input
            <View style={styles.webSliderWrapper}>
              <input
                type="range"
                min={FOCUS_MIN}
                max={FOCUS_MAX}
                step={FOCUS_STEP}
                value={focusMinutes}
                onChange={(e) => handleFocusChange(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: 4,
                  accentColor: '#1a1a1a',
                  cursor: 'pointer',
                }}
              />
            </View>
          ) : (
            // 모바일: community slider
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={FOCUS_MIN}
              maximumValue={FOCUS_MAX}
              step={FOCUS_STEP}
              value={focusMinutes}
              onValueChange={(val) => handleFocusChange(val)}
              minimumTrackTintColor="#1a1a1a"
              maximumTrackTintColor="#E0E0E0"
              thumbTintColor="#1a1a1a"
            />
          )}
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderMin}>5m</Text>
            <Text style={styles.sliderMax}>4h</Text>
          </View>
        </View>

        {/* Timelapse Length */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionLabel}>TIMELAPSE LENGTH</Text>
              <TouchableOpacity
                onPress={() => setShowInfoTooltip(!showInfoTooltip)}
                style={styles.infoBtn}
              >
                <Text style={styles.infoBtnText}>i</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionValue}>{outputSeconds}s</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
            {TIMELAPSE_OPTIONS.map((val) => {
              const isDisabled = val <= 10 && focusMinutes > SHORT_TIMELAPSE_MAX_MINUTES;
              const isActive = outputSeconds === val;
              return (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.quickChip,
                    isActive && styles.quickChipActive,
                    isDisabled && styles.quickChipDisabled,
                  ]}
                  onPress={() => !isDisabled && setOutputSeconds(val)}
                  activeOpacity={isDisabled ? 1 : 0.7}
                >
                  <Text style={[
                    styles.quickChipText,
                    isActive && styles.quickChipTextActive,
                    isDisabled && styles.quickChipTextDisabled,
                  ]}>
                    {val}s
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {showInfoTooltip && (
            <View style={styles.infoTooltip}>
              <Text style={styles.infoTooltipText}>
                If you finish early, the timelapse will be shortened based on your actual focus time.
              </Text>
            </View>
          )}
        </View>

        {/* Aspect Ratio */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>ASPECT RATIO</Text>
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
            <Text style={styles.sectionLabel}>TIMER DISPLAY</Text>
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

      {/* 일일 한도 초과 모달 */}
      <Modal
        visible={quotaModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setQuotaModal((q) => ({ ...q, visible: false }))}
      >
        <TouchableOpacity
          style={styles.modalBg}
          activeOpacity={1}
          onPress={() => setQuotaModal((q) => ({ ...q, visible: false }))}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{s.quota.exceededTitle}</Text>
            <Text style={styles.modalText}>{s.quota.exceeded(quotaModal.resetsAt)}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setQuotaModal((q) => ({ ...q, visible: false }))}
              >
                <Text style={styles.modalBtnCancelText}>{s.quota.dismissButton}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnUpgrade]}
                onPress={() => {
                  setQuotaModal((q) => ({ ...q, visible: false }));
                  router.push('/paywall');
                }}
              >
                <Text style={styles.modalBtnUpgradeText}>{s.quota.upgradeButton}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    paddingTop: Platform.OS === 'web' ? 16 : 56,
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
  sliderContainer: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
  },
  sliderTrackFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1a1a1a',
    marginLeft: -11,
    top: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderMin: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  sliderMax: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  webSliderWrapper: {
    paddingVertical: 8,
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
  quickChipDisabled: {
    backgroundColor: '#F0F0F0',
    opacity: 0.35,
  },
  quickChipTextDisabled: {
    color: '#1a1a1a',
  },
  infoBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  infoTooltip: {
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  infoTooltipText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
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
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#F5F5F5' },
  modalBtnCancelText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  modalBtnUpgrade: { backgroundColor: '#1a1a1a' },
  modalBtnUpgradeText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
