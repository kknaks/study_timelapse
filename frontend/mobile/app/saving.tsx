import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';

type StepStatus = 'pending' | 'active' | 'done';
type Step = { label: string; status: StepStatus };

const GREEN = '#22C55E';
const GRAY = '#BBBBBB';
const DARK = '#1a1a1a';

export default function SavingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ downloadUrl: string }>();
  const downloadUrl = params.downloadUrl ?? '';
  const isWeb = Platform.OS === 'web';
  const isRemoteUrl = downloadUrl.startsWith('http');

  const [steps, setSteps] = useState<Step[]>(() => {
    if (isWeb) {
      return [
        { label: 'Preparing download...', status: 'pending' },
        { label: 'Starting download...', status: 'pending' },
        { label: 'Done! 🎉', status: 'pending' },
      ];
    }
    const s: Step[] = [{ label: 'Requesting permission...', status: 'pending' }];
    if (isRemoteUrl) s.push({ label: 'Downloading video...', status: 'pending' });
    s.push({ label: 'Saving to gallery...', status: 'pending' }, { label: 'Done! 🎉', status: 'pending' });
    return s;
  });

  // When this becomes true, render <Redirect> which is the most reliable way
  // to navigate in expo-router on web
  const [done, setDone] = useState(false);

  const updateStep = (idx: number, status: StepStatus) => {
    setSteps(prev => prev.map((s, i) => {
      if (i < idx) return { ...s, status: 'done' };
      if (i === idx) return { ...s, status };
      return s;
    }));
  };

  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  useEffect(() => {
    runSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSave = async () => {
    const total = steps.length;

    try {
      if (isWeb) {
        updateStep(0, 'active');
        await wait(400);
        updateStep(0, 'done');

        updateStep(1, 'active');
        if (downloadUrl) {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = 'timelapse.mp4';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        await wait(400);
        updateStep(1, 'done');

        updateStep(2, 'active');
        await wait(300);
        updateStep(2, 'done');

        await wait(1000);
        console.log('[saving] web flow complete, setDone(true)');
        setDone(true);
        return;
      }

      // Mobile
      let idx = 0;
      updateStep(idx, 'active');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to save to your gallery.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      updateStep(idx, 'done');
      idx++;

      let localUri = downloadUrl;
      if (isRemoteUrl) {
        updateStep(idx, 'active');
        const filename = `timelapse_${Date.now()}.mp4`;
        const dest = `${FileSystem.documentDirectory}${filename}`;
        const { uri } = await FileSystem.downloadAsync(downloadUrl, dest);
        localUri = uri;
        updateStep(idx, 'done');
        idx++;
      }

      updateStep(idx, 'active');
      await MediaLibrary.saveToLibraryAsync(localUri);
      updateStep(idx, 'done');
      idx++;

      updateStep(idx, 'active');
      await wait(300);
      updateStep(idx, 'done');

      await wait(1000);
      setDone(true);
    } catch (e) {
      console.error('Save error:', e);
      Alert.alert('Error', 'Failed to save. Please try again.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  };

  // Navigate to stats when done
  useEffect(() => {
    console.log('[saving] done changed:', done);
    if (!done) return;
    console.log('[saving] navigating to stats...');
    const t = setTimeout(() => {
      console.log('[saving] executing navigate');
      if (Platform.OS === 'web') {
        (window as any).location.assign('/stats');
      } else {
        router.replace('/stats');
      }
    }, 100);
    return () => clearTimeout(t);
  }, [done, router]);

  const doneCount = steps.filter(s => s.status === 'done').length;
  const progressPercent = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

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

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
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
});
