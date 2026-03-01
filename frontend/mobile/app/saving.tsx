/**
 * Saving screen — full-screen saving progress page.
 * Receives downloadUrl via route params, runs save logic,
 * then navigates to /stats on completion.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';

type StepStatus = 'pending' | 'active' | 'done' | 'error';
type Step = { label: string; status: StepStatus };

const COLORS_SUCCESS = '#22C55E';
const COLORS_PENDING = '#BBBBBB';
const COLORS_TEXT = '#1a1a1a';

export default function SavingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ downloadUrl: string }>();
  const downloadUrl = params.downloadUrl ?? '';
  const isWeb = Platform.OS === 'web';
  const isRemoteUrl = downloadUrl.startsWith('http');

  const progressAnim = useRef(new Animated.Value(0)).current;

  const getInitialSteps = (): Step[] => {
    if (isWeb) {
      return [
        { label: 'Preparing download...', status: 'pending' },
        { label: 'Starting download...', status: 'pending' },
        { label: 'Done! 🎉', status: 'pending' },
      ];
    }
    const steps: Step[] = [{ label: 'Requesting permission...', status: 'pending' }];
    if (isRemoteUrl) steps.push({ label: 'Downloading video...', status: 'pending' });
    steps.push({ label: 'Saving to gallery...', status: 'pending' }, { label: 'Done! 🎉', status: 'pending' });
    return steps;
  };

  const [steps, setSteps] = useState<Step[]>(getInitialSteps);

  const setActive = (idx: number) =>
    setSteps(prev => prev.map((s, i) => ({ ...s, status: i < idx ? 'done' : i === idx ? 'active' : s.status })));

  const setDone = (idx: number) =>
    setSteps(prev => prev.map((s, i) => ({ ...s, status: i <= idx ? 'done' : s.status })));

  const animateTo = (idx: number, total: number) => {
    Animated.timing(progressAnim, {
      toValue: (idx + 1) / total,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  useEffect(() => {
    runSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToStats = () => {
    if (Platform.OS === 'web') {
      // expo-router replace is unreliable on web — use href navigation
      router.navigate('/stats');
    } else {
      router.replace('/stats');
    }
  };

  const runSave = async () => {
    const total = steps.length;
    let idx = 0;

    try {
      if (isWeb) {
        setActive(0); animateTo(0, total);
        await wait(400);
        setDone(0);

        idx = 1;
        setActive(idx); animateTo(idx, total);
        if (downloadUrl) {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = 'timelapse.mp4';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        await wait(400);
        setDone(idx);

        idx = 2;
        setActive(idx); animateTo(idx, total);
        await wait(300);
        setDone(idx);

        await wait(1200);
        goToStats();
        return;
      }

      // Mobile
      setActive(0); animateTo(0, total);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to save to your gallery.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      setDone(0);
      idx = 1;

      let localUri = downloadUrl;
      if (isRemoteUrl) {
        setActive(idx); animateTo(idx, total);
        const filename = `timelapse_${Date.now()}.mp4`;
        const dest = `${FileSystem.documentDirectory}${filename}`;
        const { uri } = await FileSystem.downloadAsync(downloadUrl, dest);
        localUri = uri;
        setDone(idx);
        idx++;
      }

      setActive(idx); animateTo(idx, total);
      await MediaLibrary.saveToLibraryAsync(localUri);
      setDone(idx);
      idx++;

      setActive(idx); animateTo(idx, total);
      await wait(300);
      setDone(idx);

      await wait(1200);
      goToStats();
    } catch (e) {
      console.error('Save error:', e);
      Alert.alert('Error', 'Failed to save. Please try again.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  };

  const doneCount = steps.filter(s => s.status === 'done').length;
  const progressPercent = steps.length > 0 ? (doneCount / steps.length) * 100 : 0;

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
                  <ActivityIndicator size="small" color={COLORS_TEXT} />
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

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS_TEXT,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
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
    color: COLORS_SUCCESS,
    fontWeight: '800',
  },
  stepDot: {
    fontSize: 22,
    color: COLORS_PENDING,
    lineHeight: 24,
  },
  stepLabel: {
    fontSize: 16,
    color: COLORS_TEXT,
    fontWeight: '500',
    flex: 1,
  },
  stepLabelDone: { color: COLORS_SUCCESS },
  stepLabelPending: { color: COLORS_PENDING },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS_TEXT,
    borderRadius: 3,
  },
});
