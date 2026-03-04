import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  TouchableOpacity,
  Linking,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { applyOverlay } from '../modules/timelapse-creator';
import { updateSession } from '../src/api/sessions';

const RESOLUTIONS: Record<string, [number, number]> = {
  '9:16': [720, 1280],
  '1:1':  [720, 720],
  '16:9': [1280, 720],
  '4:5':  [720, 900],
};

const GREEN = '#22C55E';
const GRAY = '#BBBBBB';
const DARK = '#1a1a1a';

type StepStatus = 'pending' | 'active' | 'done';
type Step = { label: string; status: StepStatus };

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export default function SavingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    overlayStyle: string;
    streak: string;
    studyMinutes: string;
    recordingSeconds: string;
    outputSeconds: string;
    aspectRatio: string;
    timerMode: string;
    overlayText: string;
    photoUris: string;  // timelapsePath (완성된 mp4 경로)
    cameraFacing: string;
    sessionId: string;
  }>();

  const overlayStyle = params.overlayStyle ?? 'none';
  const overlayText = params.overlayText ?? '';
  const streak = Number(params.streak) || 0;
  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSeconds = Number(params.recordingSeconds) || 0;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';
  const timelapsePath = params.photoUris ?? '';
  const sessionId = params.sessionId ?? '';

  const isWeb = Platform.OS === 'web';
  const hasRun = useRef(false);

  const buildSteps = (): Step[] => {
    if (isWeb) {
      return [
        { label: 'Preparing...', status: 'pending' },
        { label: 'Processing video...', status: 'pending' },
        { label: 'Done!', status: 'pending' },
      ];
    }
    return [
      { label: 'Requesting permission...', status: 'pending' },
      { label: 'Saving to gallery...', status: 'pending' },
      { label: 'Done!', status: 'pending' },
    ];
  };

  const [steps, setSteps] = useState<Step[]>(buildSteps);
  const [finished, setFinished] = useState(false);

  const setActive = (idx: number) =>
    setSteps(prev => prev.map((s, i) =>
      i < idx ? { ...s, status: 'done' } :
      i === idx ? { ...s, status: 'active' } : s
    ));

  const setDone = (idx: number) =>
    setSteps(prev => prev.map((s, i) => i <= idx ? { ...s, status: 'done' } : s));

  const navigateToStats = () => router.replace('/stats');
  const handleShareInstagram = () => Linking.openURL('instagram://');

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSave = async () => {
    try {
      if (isWeb) {
        setActive(0); await wait(600); setDone(0);
        setActive(1); await wait(700); setDone(1);
        setActive(2); await wait(400); setDone(2);
        setFinished(true);
        return;
      }

      let idx = 0;

      // ── Step 0: 권한 요청 ──
      setActive(idx);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to save to your gallery.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      setDone(idx); idx++;

      // ── Step 1: 오버레이 합성 + 갤러리 저장 ──
      setActive(idx);
      if (!timelapsePath) {
        throw new Error('No timelapse file found. Please try again.');
      }

      let finalPath = timelapsePath;
      if (overlayStyle !== 'none') {
        const [width, height] = RESOLUTIONS[aspectRatio] ?? [720, 1280];
        const cacheDir = FileSystem.cacheDirectory ?? '';
        const overlayOutputPath = `${cacheDir}timelapse_overlay_${Date.now()}.mp4`;
        finalPath = await applyOverlay({
          videoUri: timelapsePath,
          outputPath: overlayOutputPath,
          overlayStyle,
          overlayText,
          streak,
          recordingSeconds,
          goalSeconds: studyMinutes * 60,
          timerMode,
          width,
          height,
        });
      }

      await MediaLibrary.saveToLibraryAsync(finalPath);
      console.log('[saving] Saved to gallery.');

      // 세션 업데이트
      if (sessionId) {
        try {
          await updateSession(sessionId, {
            end_time: new Date().toISOString(),
            duration: recordingSeconds,
            status: 'completed',
          });
        } catch (e) {
          console.warn('[saving] session update failed:', e);
        }
      }
      setDone(idx); idx++;

      // ── Step 2: 완료 ──
      setActive(idx);
      await wait(300);
      setDone(idx);
      setFinished(true);

    } catch (e) {
      console.error('Save error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `Failed to save: ${msg}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  };

  const progressPercent = finished ? 100
    : Math.round((steps.filter(s => s.status === 'done').length / steps.length) * 100);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Saving your timelapse</Text>
        <Text style={styles.subtitle}>Just a moment...</Text>

        <View style={styles.stepsContainer}>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepIconBox}>
                {step.status === 'active' ? (
                  <ActivityIndicator size="small" color={DARK} />
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

        {!finished && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
          </View>
        )}

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.saveBtn, !finished && styles.saveBtnDisabled]}
            onPress={finished ? navigateToStats : undefined}
            activeOpacity={finished ? 0.8 : 1}
          >
            <Text style={[styles.saveBtnText, !finished && styles.saveBtnTextDisabled]}>View Stats →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.instaBtn, !finished && styles.instaBtnDisabled]}
            onPress={finished ? handleShareInstagram : undefined}
            activeOpacity={finished ? 0.8 : 1}
          >
            <Image source={require('../assets/instagram.png')} style={[styles.instaIcon, !finished && styles.instaIconDisabled]} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: DARK, marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#888', marginBottom: 32 },
  stepsContainer: { width: '100%', gap: 20, marginBottom: 36 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepIconBox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  stepCheck: { fontSize: 18, color: GREEN, fontWeight: '800' },
  stepDot: { fontSize: 22, color: GRAY, lineHeight: 24 },
  stepLabel: { fontSize: 16, color: DARK, fontWeight: '500', flex: 1 },
  stepLabelDone: { color: GREEN },
  stepLabelPending: { color: GRAY },
  progressTrack: { width: '100%', height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: DARK, borderRadius: 3 },
  actionButtons: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 24 },
  saveBtn: {
    flex: 4,
    backgroundColor: DARK,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  saveBtnTextDisabled: { color: '#9CA3AF' },
  instaBtn: {
    flex: 1.5,
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  instaBtnDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  instaIcon: { width: 28, height: 28 },
  instaIconDisabled: { opacity: 0.3 },
});
