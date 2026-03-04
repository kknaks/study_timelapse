import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { createTimelapse, addProgressListener } from '../modules/timelapse-creator';
import { updateSession } from '../src/api/sessions';

const RESOLUTIONS: Record<string, [number, number]> = {
  '9:16': [720, 1280],
  '1:1': [720, 720],
  '16:9': [1280, 720],
  '4:5': [720, 900],
};

export default function GeneratingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    videoUri: string;
    sessionId: string;
    outputSeconds: string;
    recordingSeconds: string;
    aspectRatio: string;
    studyMinutes: string;
    timerMode: string;
    cameraFacing: string;
  }>();

  const videoUri = params.videoUri ?? '';
  const sessionId = params.sessionId ?? '';
  const outputSeconds = Number(params.outputSeconds) || 30;
  const recordingSeconds = Number(params.recordingSeconds) || 0;
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
          params: { ...params, timelapsePath: '' },
        });
        return;
      }

      if (!videoUri) {
        throw new Error('No video recorded. Please try again.');
      }

      const [width, height] = RESOLUTIONS[aspectRatio] ?? [720, 1280];
      const cacheDir = FileSystem.cacheDirectory ?? '';
      const outputPath = `${cacheDir}timelapse_${Date.now()}.mp4`;

      const subscription = addProgressListener((event) => {
        setProgress(Math.round(event.progress * 100));
      });

      try {
        await createTimelapse({
          videoUri,
          outputPath,
          outputSeconds,
          width,
          height,
          frameRate: 30,
          bitRate: 3_500_000,
          overlayStyle: 'none',
          overlayText: '',
          streak: 0,
          timerMode,
          recordingSeconds,
          goalSeconds: studyMinutes * 60,
        });
      } finally {
        subscription.remove();
      }

      // 세션 업데이트
      if (sessionId) {
        try {
          await updateSession(sessionId, {
            end_time: new Date().toISOString(),
            duration: recordingSeconds,
            status: 'completed',
          });
        } catch (e) {
          console.warn('[generating] session update failed:', e);
        }
      }

      // 완료 → result로 이동
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
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  progress: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '700',
  },
});
