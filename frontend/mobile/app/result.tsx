import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../src/api/user';
import { COLORS } from '../src/constants';

const SAMPLE_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';

type OverlayStyle = 'none' | 'timer' | 'progress' | 'streak';

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// aspect ratio → w/h 숫자
function getRatio(ar: string): number {
  if (ar === '9:16') return 9 / 16;
  if (ar === '16:9') return 16 / 9;
  if (ar === '1:1') return 1;
  if (ar === '4:5') return 4 / 5;
  return 9 / 16;
}

export default function ResultScreen() {
  const router = useRouter();
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });

  const params = useLocalSearchParams<{
    downloadUrl: string;
    sessionId: string;
    studyMinutes: string;
    recordingSeconds: string;
    outputSeconds: string;
    aspectRatio: string;
    timerMode: string;
    cameraFacing: string;
    photoUris: string;
  }>();

  const downloadUrl = params.downloadUrl || SAMPLE_VIDEO_URL;
  const outputSecs = Number(params.outputSeconds) || 30;
  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSecs = Number(params.recordingSeconds) || studyMinutes * 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';
  const cameraFacing = params.cameraFacing ?? 'front';
  const photoUris = params.photoUris ?? '';
  const goalSeconds = studyMinutes * 60;
  const isMirrored = cameraFacing === 'front';

  // previewArea onLayout으로 실측한 크기 기반 계산
  const areaW = areaSize.width;
  const areaH = areaSize.height;
  const ratio = getRatio(aspectRatio);

  // 영상이 previewArea 안에 letterbox(pillarbox)로 맞춰지는 실제 크기 계산
  let vidW = areaW;
  let vidH = areaW > 0 ? areaW / ratio : 0;
  if (areaH > 0 && vidH > areaH) {
    vidH = areaH;
    vidW = areaH * ratio;
  }
  // 영상이 중앙에 오도록 오프셋 계산
  const offsetX = areaW > 0 ? (areaW - vidW) / 2 : 0;
  const offsetY = areaH > 0 ? (areaH - vidH) / 2 : 0;

  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('none');
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
  });
  const streak = (userData as any)?.data?.streak ?? (userData as any)?.streak ?? 0;

  const player = useVideoPlayer(downloadUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    if (overlayStyle === 'none') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const speedMultiplier = outputSecs > 0 ? Math.max(1, recordingSecs / outputSecs) : 1;
    const tickMs = 100;
    const tickAmount = (speedMultiplier * tickMs) / 1000;
    setElapsed(timerMode === 'countdown' ? goalSeconds : 0);
    const endValue = timerMode === 'countdown'
      ? Math.max(0, goalSeconds - recordingSecs)
      : recordingSecs;
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (timerMode === 'countdown') {
          const next = prev - tickAmount;
          return next <= endValue ? endValue : next;
        } else {
          const next = prev + tickAmount;
          return next >= endValue ? endValue : next;
        }
      });
    }, tickMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [overlayStyle, timerMode, goalSeconds, recordingSecs, outputSecs]);

  const progressPercent = goalSeconds > 0
    ? timerMode === 'countup'
      ? (elapsed / goalSeconds) * 100
      : ((goalSeconds - elapsed) / goalSeconds) * 100
    : 0;

  const handleSave = () => {
    router.push({
      pathname: '/saving',
      params: {
        downloadUrl,
        overlayStyle,
        streak: String(streak),
        studyMinutes: String(studyMinutes),
        recordingSeconds: String(recordingSecs),
        outputSeconds: String(outputSecs),
        aspectRatio,
        timerMode,
        overlayText: overlayStyle === 'timer' ? formatTime(elapsed) : '',
        photoUris,
        cameraFacing,
      },
    });
  };

  const handleUpgrade = () => Alert.alert('Coming Soon', 'Upgrade to remove watermark!');

  const overlayOptions: { key: OverlayStyle; label: string }[] = [
    { key: 'none', label: 'None' },
    { key: 'timer', label: 'Timer' },
    { key: 'progress', label: 'Progress Bar' },
    { key: 'streak', label: 'Streak' },
  ];

  // 영상 레이아웃이 아직 측정되지 않은 경우
  const isReady = vidW > 0 && vidH > 0;

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

      {/* Preview Area — flex:1로 실제 높이 측정 */}
      <View
        style={styles.previewArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setAreaSize({ width, height });
        }}
      >
        {isReady && (
          <>
            {Platform.OS === 'web' ? (
              <video
                src={downloadUrl}
                autoPlay loop muted playsInline
                style={{
                  position: 'absolute',
                  left: offsetX, top: offsetY,
                  width: vidW, height: vidH,
                  objectFit: 'cover',
                  transform: isMirrored ? 'scaleX(-1)' : undefined,
                } as React.CSSProperties}
              />
            ) : (
              /* 영상: offsetX/offsetY 위치에 vidW x vidH 크기 */
              <View style={{
                position: 'absolute',
                left: offsetX, top: offsetY,
                width: vidW, height: vidH,
                overflow: 'hidden',
                transform: isMirrored ? [{ scaleX: -1 }] : undefined,
              }}>
                <VideoView
                  style={{ width: vidW, height: vidH }}
                  player={player}
                  nativeControls={false}
                  contentFit="cover"
                />
              </View>
            )}

            {/* 오버레이: 영상과 정확히 동일한 위치/크기, overflow hidden으로 경계 밖 잘라냄 */}
            <View pointerEvents="none" style={{
              position: 'absolute',
              left: offsetX, top: offsetY,
              width: vidW, height: vidH,
              overflow: 'hidden',
            }}>
              {/* 워터마크: 좌하단 */}
              <View style={styles.watermark}>
                <Image source={require('../assets/logo.png')} style={styles.watermarkIcon} resizeMode="contain" />
                <Text style={styles.watermarkText}>FocusTimelapse</Text>
              </View>

              {/* 타이머/진행바/스트릭: 우상단 */}
              {(overlayStyle === 'timer' || overlayStyle === 'progress' || overlayStyle === 'streak') && (
                <View style={styles.topRightOverlay}>
                  {overlayStyle === 'timer' && (
                    <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
                  )}
                  {overlayStyle === 'progress' && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
                    </View>
                  )}
                  {overlayStyle === 'streak' && (
                    <Text style={styles.timerText}>▸ {streak} day{streak !== 1 ? 's' : ''} streak</Text>
                  )}
                </View>
              )}
            </View>
          </>
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
          <Text style={styles.saveText}>Create Video</Text>
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
  previewArea: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  watermarkIcon: { width: 16, height: 16 },
  watermarkText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  topRightOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    alignItems: 'flex-end',
    gap: 6,
  },
  timerText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  progressTrack: {
    width: 90,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 2,
  },
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
  overlayBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
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
    alignItems: 'center',
  },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  upgradeButton: { alignItems: 'center', paddingVertical: 4 },
  upgradeText: { color: '#4A90E2', fontSize: 15, fontWeight: '500' },
});
