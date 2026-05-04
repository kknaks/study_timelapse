import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import TimelapseCreatorModule from '../modules/timelapse-creator/src/TimelapseCreatorModule';
import { CAPTURE_TUNING } from '../src/constants/captureTuning';

const RESOLUTIONS: Record<string, [number, number]> = {
  '9:16': [720, 1280],
  '1:1': [720, 720],
  '16:9': [1280, 720],
  '4:5': [720, 900],
  '3:4': [810, 1080],
};

export default function GeneratingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    captureDir: string;
    sessionId: string;
    outputSeconds: string;
    recordingSeconds: string;
    goalSec: string;
    aspectRatio: string;
    studyMinutes: string;
    timerMode: string;
    cameraFacing: string;
  }>();

  const captureDir = params.captureDir ?? '';
  const sessionId = params.sessionId ?? '';
  const outputSeconds = Number(params.outputSeconds) || 30;
  const recordingSeconds = Number(params.recordingSeconds) || 0;
  const goalSec = Number(params.goalSec) || Number(params.studyMinutes) * 60 || 3600;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const studyMinutes = Number(params.studyMinutes) || 0;
  const timerMode = params.timerMode ?? 'countdown';
  const cameraFacing = params.cameraFacing ?? 'front';

  const [progress, setProgress] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runGenerate = async () => {
    try {
      if (Platform.OS === 'web') {
        router.replace({
          pathname: '/result',
          params: { ...params, previewPath: '' },
        });
        return;
      }

      if (!captureDir) {
        throw new Error('No capture directory found. Please try again.');
      }

      const [width, height] = RESOLUTIONS[aspectRatio] ?? [720, 1280];
      const previewPath = `${FileSystem.documentDirectory ?? ''}sessions/${sessionId}/preview.mp4`;

      const subscription = TimelapseCreatorModule.addListener('onStitchProgress', (event) => {
        setProgress(Math.round(event.progress * 100));
      });

      try {
        await TimelapseCreatorModule.stitchTimelapse({
          captureDir,
          outputPath: previewPath,
          width,
          height,
          outputFps: CAPTURE_TUNING.outputFps,
          overlayStyle: 'none',
          overlayMeta: {
            recordingSec: recordingSeconds,
            goalSec,
            outputSec: outputSeconds,
          },
        });
      } finally {
        subscription.remove();
      }

      router.replace({
        pathname: '/result',
        params: {
          previewPath,
          captureDir,
          sessionId,
          outputSeconds: String(outputSeconds),
          recordingSeconds: String(recordingSeconds),
          goalSec: String(goalSec),
          aspectRatio,
          studyMinutes: String(studyMinutes),
          timerMode,
          cameraFacing,
        },
      });
    } catch (e) {
      console.error('[generating] error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `Failed to generate timelapse: ${msg}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FFF" />
      <Text style={styles.text}>타임랩스 생성 중...</Text>
      <Text style={styles.progress}>{progress}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 16 },
  text: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  progress: { color: '#FFF', fontSize: 32, fontWeight: '700' },
});
