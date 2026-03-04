import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { createTimelapse, addProgressListener } from '../modules/timelapse-creator';
import { updateSession } from '../src/api/sessions';

const RESOLUTIONS: Record<string, [number, number]> = {
  "9:16": [720, 1280],
  "1:1":  [720, 720],
  "16:9": [1280, 720],
  "4:5":  [720, 900],
};

async function buildTimelapseNative(params: {
  videoUri: string;
  outputSeconds: number;
  outputPath: string;
  aspectRatio: string;
  overlayStyle: string;
  overlayText: string;
  streak: number;
  timerMode: string;
  recordingSeconds: number;
  goalSeconds: number;
  onProgress?: (p: number) => void;
}) {
  const { videoUri, outputSeconds, outputPath, aspectRatio,
          overlayStyle, overlayText, streak, timerMode, recordingSeconds, goalSeconds, onProgress } = params;

  const [width, height] = RESOLUTIONS[aspectRatio] ?? [720, 1280];

  const subscription = onProgress
    ? addProgressListener((event) => onProgress(event.progress))
    : null;

  try {
    await createTimelapse({
      videoUri,
      outputPath,
      outputSeconds,
      width,
      height,
      frameRate: 30,
      bitRate: 3_500_000,
      overlayStyle,
      overlayText,
      streak,
      timerMode,
      recordingSeconds,
      goalSeconds,
    });
  } finally {
    subscription?.remove();
  }
}

export default function SavingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    studyMinutes: string;
    recordingSeconds: string;
    outputSeconds: string;
    aspectRatio: string;
    timerMode: string;
    videoUri: string;
    sessionId: string;
    cameraFacing: string;
  }>();

  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSeconds = Number(params.recordingSeconds) || 0;
  const outputSeconds = Number(params.outputSeconds) || 30;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';
  const videoUri = params.videoUri ?? '';
  const sessionId = params.sessionId ?? '';
  const cameraFacing = params.cameraFacing ?? 'front';

  const hasRun = useRef(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSave = async () => {
    try {
      if (Platform.OS === 'web') {
        router.replace('/result');
        return;
      }

      // ── 온디바이스 네이티브 타임랩스 생성 (오버레이 없는 순수 타임랩스) ──
      if (!videoUri) {
        throw new Error("No video recorded. Please try again.");
      }
      const cacheDir = FileSystem.cacheDirectory ?? "";
      const outputPath = `${cacheDir}timelapse_${Date.now()}.mp4`;

      await buildTimelapseNative({
        videoUri,
        outputSeconds,
        outputPath,
        aspectRatio,
        overlayStyle: 'none',
        overlayText: '',
        streak: 0,
        timerMode,
        recordingSeconds,
        goalSeconds: studyMinutes * 60,
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });

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

      // ── 완료 → result 화면으로 이동 ──
      router.replace({
        pathname: '/result',
        params: {
          timelapsePath: outputPath,
          videoUri,
          sessionId,
          outputSeconds: String(outputSeconds),
          recordingSeconds: String(recordingSeconds),
          aspectRatio,
          studyMinutes: String(studyMinutes),
          timerMode,
          cameraFacing,
        },
      });
    } catch (e) {
      console.error('Save error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `Failed to save: ${msg}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FFF" />
      <Text style={styles.label}>타임랩스 생성 중...</Text>
      <Text style={styles.percent}>{progress}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 8,
  },
  percent: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFF',
  },
});
