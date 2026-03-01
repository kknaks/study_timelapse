import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { COLORS } from '../src/constants';
import { Image } from 'react-native';

type SaveStep = {
  label: string;
  status: 'pending' | 'active' | 'done';
};

const SAMPLE_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';

type OverlayStyle = 'none' | 'timer' | 'progress';

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    downloadUrl: string;
    sessionId: string;
    studyMinutes: string;
    recordingSeconds: string;
    outputSeconds: string;
    aspectRatio: string;
    timerMode: string;
  }>();

  const downloadUrl = params.downloadUrl || SAMPLE_VIDEO_URL;
  const outputSecs = Number(params.outputSeconds) || 30;
  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSecs = Number(params.recordingSeconds) || studyMinutes * 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown'; // 'countdown' | 'countup'
  const goalSeconds = studyMinutes * 60;

  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('none');
  const [saving, setSaving] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveSteps, setSaveSteps] = useState<SaveStep[]>([]);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const isWeb = Platform.OS === 'web';
  const isRemoteUrl = downloadUrl.startsWith('http');

  const getInitialSteps = useCallback((): SaveStep[] => {
    if (isWeb) {
      return [
        { label: 'Preparing download...', status: 'pending' },
        { label: 'Starting download...', status: 'pending' },
        { label: 'Done! 🎉', status: 'pending' },
      ];
    }
    const steps: SaveStep[] = [
      { label: 'Requesting permission...', status: 'pending' },
    ];
    if (isRemoteUrl) {
      steps.push({ label: 'Downloading video...', status: 'pending' });
    }
    steps.push(
      { label: 'Saving to gallery...', status: 'pending' },
      { label: 'Done! 🎉', status: 'pending' },
    );
    return steps;
  }, [isWeb, isRemoteUrl]);

  const setStepActive = (index: number, steps: SaveStep[]): SaveStep[] =>
    steps.map((s, i) => ({
      ...s,
      status: i < index ? 'done' : i === index ? 'active' : 'pending',
    }));

  const setStepDone = (index: number, steps: SaveStep[]): SaveStep[] =>
    steps.map((s, i) => ({
      ...s,
      status: i <= index ? 'done' : s.status,
    }));

  const animateProgress = (stepIndex: number, totalSteps: number) => {
    Animated.timing(progressAnim, {
      toValue: (stepIndex + 1) / totalSteps,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  // 타이머 오버레이용 — 영상 길이(outputSecs) 기준으로 카운트업
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const player = useVideoPlayer(downloadUrl, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    if (overlayStyle === 'none') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // 타임랩스 배속: 원본 촬영시간 / 출력 영상시간
    // 예) 2시간(7200s) → 30s = 240배속 → 타이머도 240배 빠르게
    const speedMultiplier = outputSecs > 0 ? Math.max(1, recordingSecs / outputSecs) : 1;
    const tickMs = 100; // 100ms마다 업데이트 (부드럽게)
    const tickAmount = (speedMultiplier * tickMs) / 1000; // 한 틱당 증가량(초)

    setElapsed(timerMode === 'countdown' ? Math.max(0, goalSeconds - recordingSecs) : 0);

    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (timerMode === 'countdown') {
          const next = prev - tickAmount;
          return next <= 0 ? goalSeconds : next;
        } else {
          const next = prev + tickAmount;
          return next >= goalSeconds ? 0 : next;
        }
      });
    }, tickMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [overlayStyle, timerMode, goalSeconds, recordingSecs, outputSecs]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    const steps = getInitialSteps();
    setSaveSteps(steps);
    setSaveModalVisible(true);
    progressAnim.setValue(0);

    let currentStep = 0;

    try {
      if (isWeb) {
        // Step 0: Preparing download
        setSaveSteps(prev => setStepActive(0, prev));
        animateProgress(0, steps.length);
        await new Promise(r => setTimeout(r, 400));
        setSaveSteps(prev => setStepDone(0, prev));

        // Step 1: Starting download
        currentStep = 1;
        setSaveSteps(prev => setStepActive(1, prev));
        animateProgress(1, steps.length);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'timelapse.mp4';
        a.click();
        await new Promise(r => setTimeout(r, 400));
        setSaveSteps(prev => setStepDone(1, prev));

        // Step 2: Done
        currentStep = 2;
        setSaveSteps(prev => setStepActive(2, prev));
        animateProgress(2, steps.length);
        await new Promise(r => setTimeout(r, 200));
        setSaveSteps(prev => setStepDone(2, prev));

        setTimeout(() => {
          router.replace('/stats');
        }, 1500);
        return;
      }

      // --- Mobile flow ---
      // Step: Requesting permission
      setSaveSteps(prev => setStepActive(0, prev));
      animateProgress(0, steps.length);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setSaveModalVisible(false);
        setSaving(false);
        Alert.alert('Permission Required', 'Please allow access to save to your gallery.');
        return;
      }
      setSaveSteps(prev => setStepDone(0, prev));
      currentStep = 1;

      // Step: Downloading video (only if remote URL)
      let localUri = downloadUrl;
      if (isRemoteUrl) {
        setSaveSteps(prev => setStepActive(currentStep, prev));
        animateProgress(currentStep, steps.length);
        const filename = `timelapse_${Date.now()}.mp4`;
        const dest = `${FileSystem.documentDirectory}${filename}`;
        const { uri } = await FileSystem.downloadAsync(downloadUrl, dest);
        localUri = uri;
        setSaveSteps(prev => setStepDone(currentStep, prev));
        currentStep++;
      }

      // Step: Saving to gallery
      setSaveSteps(prev => setStepActive(currentStep, prev));
      animateProgress(currentStep, steps.length);
      await MediaLibrary.saveToLibraryAsync(localUri);
      setSaveSteps(prev => setStepDone(currentStep, prev));
      currentStep++;

      // Step: Done
      setSaveSteps(prev => setStepActive(currentStep, prev));
      animateProgress(currentStep, steps.length);
      await new Promise(r => setTimeout(r, 200));
      setSaveSteps(prev => setStepDone(currentStep, prev));

      setTimeout(() => {
        router.replace('/stats');
      }, 1500);
    } catch (e) {
      console.error('Save error:', e);
      setSaveModalVisible(false);
      setSaving(false);
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  };

  const handleUpgrade = () => {
    Alert.alert('Coming Soon', 'Upgrade to remove watermark!');
  };

  const overlayOptions: { key: OverlayStyle; label: string }[] = [
    { key: 'none', label: 'None' },
    { key: 'timer', label: 'Timer' },
    { key: 'progress', label: 'Progress Bar' },
  ];

  // countup: 경과/목표, countdown: (목표-남은)/목표
  const progressPercent = goalSeconds > 0
    ? timerMode === 'countup'
      ? (elapsed / goalSeconds) * 100
      : ((goalSeconds - elapsed) / goalSeconds) * 100
    : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preview</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Video Preview Area */}
      <View style={styles.previewArea}>
        {Platform.OS === 'web' ? (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
          }}>
            <video
              src={downloadUrl}
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: aspectRatio === '1:1' ? 'auto' : '100%',
                height: aspectRatio === '1:1' ? '100%' : '100%',
                aspectRatio: aspectRatio === '1:1' ? '1/1' : aspectRatio === '16:9' ? '16/9' : undefined,
                objectFit: 'cover',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            />
          </div>
        ) : (
          <VideoView
            style={styles.video}
            player={player}
            nativeControls={false}
          />
        )}

        {/* Watermark Overlay — always visible */}
        <View style={styles.watermark} pointerEvents="none">
          <Image
            source={require('../assets/logo.png')}
            style={styles.watermarkIcon}
            resizeMode="contain"
          />
          <Text style={styles.watermarkText}>FocusTimelapse</Text>
        </View>

        {/* Timer + Progress overlay — top right, no background */}
        {(overlayStyle === 'timer' || overlayStyle === 'progress') && (
          <View style={styles.topRightOverlay} pointerEvents="none">
            {overlayStyle === 'timer' && (
              <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
            )}
            {overlayStyle === 'progress' && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Bottom Card */}
      <View style={styles.bottomCard}>
        <Text style={styles.sectionLabel}>OVERLAY STYLE</Text>
        <View style={styles.overlayRow}>
          {overlayOptions.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.overlayBtn, overlayStyle === opt.key && styles.overlayBtnActive]}
              onPress={() => setOverlayStyle(opt.key)}
            >
              <Text style={[styles.overlayBtnText, overlayStyle === opt.key && styles.overlayBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.saveIcon}>💾</Text>
              <Text style={styles.saveText}>Save Video</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeText}>Remove Watermark (Upgrade)</Text>
        </TouchableOpacity>
      </View>

      {/* Save Progress — full screen overlay */}
      {saveModalVisible && (
        <View style={styles.savingScreen}>
          <Text style={styles.savingTitle}>Saving your timelapse</Text>
          <Text style={styles.savingSubtitle}>Just a moment...</Text>

          <View style={styles.stepsContainer}>
            {saveSteps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepIconBox}>
                  {step.status === 'active' ? (
                    <ActivityIndicator size="small" color="#1a1a1a" />
                  ) : step.status === 'done' ? (
                    <Text style={styles.stepCheck}>✓</Text>
                  ) : (
                    <Text style={styles.stepDot}>·</Text>
                  )}
                </View>
                <Text style={[
                  styles.stepLabel,
                  step.status === 'done' && styles.stepLabelDone,
                  step.status === 'pending' && styles.stepLabelPending,
                ]}>
                  {step.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Progress bar */}
          <View style={styles.savingProgressTrack}>
            <Animated.View
              style={[
                styles.savingProgressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#1a1a1a',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#FFF', fontSize: 22 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  previewArea: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  video: { flex: 1, width: '100%', height: '100%' },

  // Watermark
  watermark: {
    position: 'absolute',
    bottom: 16,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  watermarkIcon: {
    width: 18,
    height: 18,
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Timer + Progress — top right, no background
  topRightOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    alignItems: 'flex-end',
    gap: 6,
  },
  timerText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  progressTrack: {
    width: 100,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 2,
  },

  // Bottom card
  bottomCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    gap: 20,
  },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 1 },
  overlayRow: { flexDirection: 'row', gap: 10 },
  overlayBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  overlayBtnActive: { backgroundColor: '#1a1a1a' },
  overlayBtnText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  overlayBtnTextActive: { color: '#FFF' },
  saveButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveIcon: { fontSize: 18 },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  upgradeButton: { alignItems: 'center', paddingVertical: 4 },
  upgradeText: { color: '#4A90E2', fontSize: 15, fontWeight: '500' },

  // Save progress — full screen
  savingScreen: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  savingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  savingSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  stepsContainer: {
    width: '100%',
    gap: 20,
    marginBottom: 36,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepIconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCheck: {
    fontSize: 18,
    color: '#22C55E',
    fontWeight: '800',
  },
  stepDot: {
    fontSize: 22,
    color: '#CCC',
    lineHeight: 24,
  },
  stepLabel: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
    flex: 1,
  },
  stepLabelDone: {
    color: '#22C55E',
  },
  stepLabelPending: {
    color: '#BBBBBB',
  },
  savingProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  savingProgressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 3,
  },
});
