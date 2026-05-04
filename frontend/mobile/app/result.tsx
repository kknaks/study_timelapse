import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS } from '../src/constants';

type OverlayStyle = 'none' | 'timer' | 'progress' | 'streak';

function getRatio(ar: string): number {
  if (ar === '9:16') return 9 / 16;
  if (ar === '16:9') return 16 / 9;
  if (ar === '1:1') return 1;
  if (ar === '4:5') return 4 / 5;
  if (ar === '3:4') return 3 / 4;
  return 9 / 16;
}

export default function ResultScreen() {
  const router = useRouter();
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });

  const params = useLocalSearchParams<{
    sessionId: string;
    studyMinutes: string;
    recordingSeconds: string;
    outputSeconds: string;
    goalSec: string;
    aspectRatio: string;
    timerMode: string;
    cameraFacing: string;
    previewPath: string;
    captureDir: string;
  }>();

  const outputSecs = Number(params.outputSeconds) || 30;
  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSecs = Number(params.recordingSeconds) || studyMinutes * 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';
  const cameraFacing = params.cameraFacing ?? 'front';
  const previewPath = params.previewPath ?? '';
  const captureDir = params.captureDir ?? '';
  const sessionId = params.sessionId ?? '';
  const goalSec = Number(params.goalSec) || studyMinutes * 60;

  const player = useVideoPlayer(previewPath || null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const areaW = areaSize.width;
  const areaH = areaSize.height;
  const ratio = getRatio(aspectRatio);

  let vidW = areaW;
  let vidH = areaW > 0 ? areaW / ratio : 0;
  if (areaH > 0 && vidH > areaH) {
    vidH = areaH;
    vidW = areaH * ratio;
  }
  const offsetX = areaW > 0 ? (areaW - vidW) / 2 : 0;
  const offsetY = areaH > 0 ? (areaH - vidH) / 2 : 0;
  const isReady = vidW > 0 && vidH > 0;

  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('none');

  const overlayOptions: { key: OverlayStyle; label: string }[] = [
    { key: 'none', label: 'None' },
    { key: 'timer', label: 'Timer' },
    { key: 'progress', label: 'Progress Bar' }, // TODO(monetization): if (!user.is_pro) Progress bar 자물쇠 표시
    { key: 'streak', label: 'Streak' },
  ];

  const handleSave = () => {
    router.push({
      pathname: '/saving',
      params: {
        overlayStyle,
        studyMinutes: String(studyMinutes),
        recordingSeconds: String(recordingSecs),
        outputSeconds: String(outputSecs),
        goalSec: String(goalSec),
        aspectRatio,
        timerMode,
        previewPath,
        captureDir,
        cameraFacing,
        sessionId,
      },
    });
  };

  const handleUpgrade = () => router.push('/paywall');

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

      {/* Preview Area */}
      <View
        style={styles.previewArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setAreaSize({ width, height });
        }}
      >
        {isReady && (
          <View style={{
            width: vidW,
            height: vidH,
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            overflow: 'hidden',
          }}>
            {previewPath ? (
              <VideoView
                player={player}
                style={{ width: vidW, height: vidH }}
                contentFit="fill"
                nativeControls={false}
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#999', fontSize: 14 }}>Video preview</Text>
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
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveText}>Save to Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeText}>Remove Watermark (Upgrade)</Text>
        </TouchableOpacity>
      </View>
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
    height: 88,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#FFF', fontSize: 22 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  previewArea: { flex: 1, width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  bottomCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 44,
    gap: 18,
  },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 1 },
  overlayRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  overlayBtn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F0F0F0' },
  overlayBtnActive: { backgroundColor: '#1a1a1a' },
  overlayBtnText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  overlayBtnTextActive: { color: '#FFF' },
  saveButton: { backgroundColor: '#1a1a1a', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  upgradeButton: { alignItems: 'center', paddingVertical: 4 },
  upgradeText: { color: '#4A90E2', fontSize: 15, fontWeight: '500' },
});
