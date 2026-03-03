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
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

const GREEN = '#22C55E';
const GRAY = '#BBBBBB';
const DARK = '#1a1a1a';

type StepStatus = 'pending' | 'active' | 'done';
type Step = { label: string; status: StepStatus };

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

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
    cameraFacing: string;
  }>();

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
  const cameraFacing = params.cameraFacing ?? 'front';

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
      { label: 'Building timelapse...', status: 'pending' },
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

  const navigateToStats = () => {
    router.replace('/stats');
  };

  const handleShareInstagram = () => {
    Linking.openURL('instagram://');
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

      // ── Step 1: 온디바이스 FFmpeg 타임랩스 생성 ──
      setActive(idx);

      if (photoUris.length === 0) {
        throw new Error('No photos captured. Please try again.');
      }

      // 1. 각 사진 경로를 파일에 목록으로 기록 (concat demuxer용)
      const cacheDir = FileSystem.cacheDirectory ?? '';
      const listPath = `${cacheDir}frames_list.txt`;
      const outputPath = `${cacheDir}timelapse_${Date.now()}.mp4`;

      // 프레임당 표시 시간 계산 (outputSeconds / photoCount)
      const frameDuration = outputSeconds / photoUris.length;

      // concat demuxer용 파일 목록 생성
      // file 'path'
      // duration D
      const listContent = photoUris
        .map(uri => {
          // file:// 제거 (FFmpeg은 파일 경로 직접 사용)
          const path = uri.startsWith('file://') ? uri.slice(7) : uri;
          return `file '${path}'\nduration ${frameDuration.toFixed(6)}`;
        })
        .join('\n');
      // 마지막 프레임 한 번 더 추가 (concat demuxer 마지막 프레임 workaround)
      const lastUri = photoUris[photoUris.length - 1];
      const lastPath = lastUri.startsWith('file://') ? lastUri.slice(7) : lastUri;
      const finalList = listContent + `\nfile '${lastPath}'`;

      await FileSystem.writeAsStringAsync(listPath, finalList, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // 2. 해상도/크롭 설정 (aspectRatio에 따라)
      // 입력이 세로 사진(iPhone 기준 3024x4032 or 4032x3024)이므로
      // 9:16 → 세로 영상 (720x1280), 1:1 → 정방형 (720x720), 16:9 → 가로 영상 (1280x720), 4:5 → (720x900)
      let scaleFilter: string;
      if (aspectRatio === '9:16') {
        scaleFilter = 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280';
      } else if (aspectRatio === '1:1') {
        scaleFilter = 'scale=720:720:force_original_aspect_ratio=increase,crop=720:720';
      } else if (aspectRatio === '16:9') {
        scaleFilter = 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720';
      } else if (aspectRatio === '4:5') {
        scaleFilter = 'scale=720:900:force_original_aspect_ratio=increase,crop=720:900';
      } else {
        scaleFilter = 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280';
      }

      // 3. 전면카메라 미러링
      const mirrorFilter = cameraFacing === 'front' ? ',hflip' : '';

      // 4. 오버레이 drawtext 필터 구성
      let overlayFilter = '';
      if (overlayStyle === 'timer' && overlayText) {
        // 우상단 타이머 텍스트
        const escaped = overlayText.replace(/'/g, "\\'").replace(/:/g, '\\:');
        overlayFilter = `,drawtext=text='${escaped}':fontsize=36:fontcolor=white:shadowcolor=black:shadowx=1:shadowy=1:x=w-tw-20:y=20`;
      } else if (overlayStyle === 'streak') {
        const streakStr = `${streak} day${streak !== 1 ? 's' : ''} streak`;
        const escaped = streakStr.replace(/'/g, "\\'");
        overlayFilter = `,drawtext=text='${escaped}':fontsize=30:fontcolor=white:shadowcolor=black:shadowx=1:shadowy=1:x=w-tw-20:y=20`;
      }
      // progress bar는 drawtext 대신 생략 (복잡한 필터 필요, 일단 스킵)

      // 5. 워터마크 텍스트 (좌하단)
      const watermarkFilter = `,drawtext=text='FocusTimelapse':fontsize=22:fontcolor=white@0.9:shadowcolor=black:shadowx=1:shadowy=1:x=16:y=h-th-16`;

      // 6. 최종 vf 필터 조합
      const vf = `${scaleFilter}${mirrorFilter}${overlayFilter}${watermarkFilter}`;

      // 7. FFmpeg 명령어 실행
      // concat demuxer: -f concat -safe 0 -i list.txt
      // fps 30, preset ultrafast, crf 23
      const ffmpegCmd = [
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-an',
        '-y',
        outputPath,
      ].join(' ');

      console.log('[saving] FFmpeg command:', ffmpegCmd);

      const session = await FFmpegKit.execute(ffmpegCmd);
      const returnCode = await session.getReturnCode();
      const logs = await session.getAllLogsAsString();

      if (!ReturnCode.isSuccess(returnCode)) {
        console.error('[saving] FFmpeg failed. Logs:', logs);
        throw new Error(`FFmpeg failed (code ${returnCode}). Check logs.`);
      }

      console.log('[saving] FFmpeg success, output:', outputPath);
      setDone(idx); idx++;

      // ── Step 2: 갤러리 저장 ──
      setActive(idx);
      await MediaLibrary.saveToLibraryAsync(outputPath);
      console.log('[saving] Saved to gallery.');
      setDone(idx); idx++;

      // ── Step 3: 완료 ──
      setActive(idx);
      await wait(300);
      setDone(idx);

      setFinished(true);

      // 임시 파일 정리
      try {
        await FileSystem.deleteAsync(listPath, { idempotent: true });
        await FileSystem.deleteAsync(outputPath, { idempotent: true });
      } catch (cleanupErr) {
        console.warn('[saving] cleanup error:', cleanupErr);
      }
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
              <Text style={styles.saveBtnText}>View Stats →</Text>
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
  instaIcon: { width: 28, height: 28 },
});
