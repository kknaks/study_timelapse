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
import { uploadPhotos, requestTimelapseFromPhotos, getTimelapseStatus } from '../src/api/timelapse';

const GREEN = '#22C55E';
const GRAY = '#BBBBBB';
const DARK = '#1a1a1a';

type StepStatus = 'pending' | 'active' | 'done';
type Step = { label: string; status: StepStatus };

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_COUNT = 150;

export default function SavingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    downloadUrl: string;
    overlayStyle: string;
    streak: string;
    studyMinutes: string;
    recordingSeconds: string;
    outputSeconds: string;
    aspectRatio: string;
    timerMode: string;
    overlayText: string;
    photoUris: string;
  }>();

  const downloadUrl = params.downloadUrl ?? '';
  const overlayStyle = params.overlayStyle ?? 'none';
  const streak = Number(params.streak) || 0;
  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSeconds = Number(params.recordingSeconds) || 0;
  const outputSeconds = Number(params.outputSeconds) || 30;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';
  const overlayText = params.overlayText ?? '';
  const photoUrisRaw = params.photoUris ?? '';
  const photoUris = photoUrisRaw ? photoUrisRaw.split(',').filter(Boolean) : [];

  const isWeb = Platform.OS === 'web';
  const isRemoteUrl = downloadUrl.startsWith('http');
  const hasOverlay = overlayStyle !== 'none';
  // 오버레이가 있고 사진 URI가 있으면 서버 재합성, 없으면 기존 URL 다운로드
  const needsRecomposite = hasOverlay && photoUris.length > 0;
  const hasRun = useRef(false);

  const buildSteps = (): Step[] => {
    if (isWeb) {
      return [
        { label: 'Preparing...', status: 'pending' },
        { label: 'Processing video...', status: 'pending' },
        { label: 'Done!', status: 'pending' },
      ];
    }
    const s: Step[] = [{ label: 'Requesting permission...', status: 'pending' }];
    if (needsRecomposite) {
      s.push({ label: 'Compositing overlay...', status: 'pending' });
    }
    if (isRemoteUrl || needsRecomposite) {
      s.push({ label: 'Downloading video...', status: 'pending' });
    }
    s.push({ label: 'Saving to gallery...', status: 'pending' }, { label: 'Done!', status: 'pending' });
    return s;
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

  const navigateToStats = () => {
    if (Platform.OS === 'web') {
      window.location.assign('http://localhost:8081/stats');
    } else {
      router.replace('/stats');
    }
  };

  const handleShareInstagram = () => {
    if (Platform.OS === 'web') {
      Alert.alert('Instagram', 'Open Instagram app to share your timelapse!');
    } else {
      Linking.openURL('instagram://');
    }
  };

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

      // Mobile
      let idx = 0;
      setActive(idx);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to save to your gallery.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      setDone(idx); idx++;

      let finalDownloadUrl = downloadUrl;

      // ── 오버레이 서버 합성 (사진이 있을 때만) ──
      if (needsRecomposite) {
        setActive(idx);

        try {
          // 사진 업로드
          const CHUNK_SIZE = 50;
          const allFileIds: string[] = [];
          const totalChunks = Math.ceil(photoUris.length / CHUNK_SIZE);
          for (let ci = 0; ci < totalChunks; ci++) {
            const chunk = photoUris.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE);
            const res = await uploadPhotos(chunk);
            allFileIds.push(...res.data.fileIds);
          }

          // 오버레이 포함 타임랩스 요청
          const taskRes = await requestTimelapseFromPhotos({
            fileIds: allFileIds,
            outputSeconds,
            aspectRatio,
            overlayStyle,
            overlayText,
            streak,
            studyMinutes,
            recordingSeconds,
            timerMode,
          });
          const taskId = taskRes.data.taskId;

          // 폴링
          let pollCount = 0;
          while (pollCount < MAX_POLL_COUNT) {
            await wait(POLL_INTERVAL_MS);
            pollCount++;
            const statusRes = await getTimelapseStatus(taskId);
            const { status: taskStatus, downloadUrl: url } = statusRes.data as any;
            if (taskStatus === 'completed' && url) {
              const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:18001';
              finalDownloadUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
              break;
            }
            if (taskStatus === 'failed') {
              throw new Error('Overlay compositing failed on server');
            }
          }
        } catch (overlayErr) {
          console.warn('[saving] overlay compositing failed, using original:', overlayErr);
          // 오버레이 합성 실패 시 원본 URL 사용
          finalDownloadUrl = downloadUrl;
        }

        setDone(idx); idx++;
      }

      // ── 다운로드 ──
      let localUri = finalDownloadUrl;
      if (finalDownloadUrl.startsWith('http')) {
        setActive(idx);
        const filename = `timelapse_${Date.now()}.mp4`;
        const dest = `${FileSystem.documentDirectory}${filename}`;
        console.log('[saving] downloading from:', finalDownloadUrl);
        const result = await FileSystem.downloadAsync(finalDownloadUrl, dest);
        console.log('[saving] download result:', result.status, result.uri);
        if (result.status !== 200 && result.status !== 206) {
          throw new Error(`Download failed: HTTP ${result.status}`);
        }
        localUri = result.uri;
        setDone(idx); idx++;
      }

      // ── 갤러리 저장 ──
      console.log('[saving] saving to library:', localUri);
      setActive(idx);
      await MediaLibrary.saveToLibraryAsync(localUri);
      setDone(idx); idx++;

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

  const doneCount = steps.filter(s => s.status === 'done').length;
  const progressPercent = Math.round((doneCount / steps.length) * 100);

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

        {finished && (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.saveBtn} onPress={navigateToStats}>
              <Text style={styles.saveBtnText}>Save Video →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.instaBtn} onPress={handleShareInstagram}>
              <Image source={require('../assets/instagram.png')} style={styles.instaIcon} resizeMode="contain" />
            </TouchableOpacity>
          </View>
        )}
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
  actionButtons: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  saveBtn: {
    flex: 4,
    backgroundColor: DARK,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
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
  instaBtnText: { color: DARK, fontSize: 20, fontWeight: '600' },
  instaIcon: { width: 28, height: 28 },
});
