import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
  useWindowDimensions,
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

// aspect ratio 문자열 → 숫자 비율 (w/h)
function getRatio(ar: string): number {
  if (ar === '9:16') return 9 / 16;
  if (ar === '16:9') return 16 / 9;
  if (ar === '1:1') return 1;
  if (ar === '4:5') return 4 / 5;
  return 9 / 16;
}

export default function ResultScreen() {
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const params = useLocalSearchParams<{
    downloadUrl: string;
    sessionId: string;
    studyMinutes: string;
    recordingSeconds: string;
    outputSeconds: string;
    aspectRatio: string;
    timerMode: string;
    cameraFacing: string;
  }>();

  const downloadUrl = params.downloadUrl || SAMPLE_VIDEO_URL;
  const outputSecs = Number(params.outputSeconds) || 30;
  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSecs = Number(params.recordingSeconds) || studyMinutes * 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';
  const cameraFacing = params.cameraFacing ?? 'front';
  const goalSeconds = studyMinutes * 60;
  const isMirrored = cameraFacing === 'front';

  // previewArea 높이 계산 (헤더 제외한 남은 공간)
  const HEADER_HEIGHT = 56 + 16 + 16; // paddingTop + paddingBottom + 대략
  const BOTTOM_CARD_HEIGHT = 220; // bottomCard 대략적 높이
  const availableHeight = screenHeight - HEADER_HEIGHT - BOTTOM_CARD_HEIGHT;

  // 영상 실제 렌더링 크기 계산 (letterbox/pillarbox 제거하고 정확한 영역 계산)
  const ratio = getRatio(aspectRatio);
  let videoW = screenWidth;
  let videoH = screenWidth / ratio;
  if (videoH > availableHeight) {
    videoH = availableHeight;
    videoW = availableHeight * ratio;
  }

  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('none');
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
  });
  const streak = (userData as any)?.data?.streak ?? userData?.streak ?? 0;

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
      params: { downloadUrl },
    });
  };

  const handleUpgrade = () => {
    Alert.alert('Coming Soon', 'Upgrade to remove watermark!');
  };

  const overlayOptions: { key: OverlayStyle; label: string }[] = [
    { key: 'none', label: 'None' },
    { key: 'timer', label: 'Timer' },
    { key: 'progress', label: 'Progress Bar' },
    { key: 'streak', label: 'Streak' },
  ];

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

      {/* Video Preview Area — 검정 배경, 영상은 중앙 정렬 */}
      <View style={styles.previewArea}>
        {/* 영상 + 오버레이를 정확한 크기의 컨테이너로 감쌈 */}
        <View style={[styles.videoContainer, { width: videoW, height: videoH }]}>
          {Platform.OS === 'web' ? (
            <video
              src={downloadUrl}
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: isMirrored ? 'scaleX(-1)' : undefined,
              } as React.CSSProperties}
            />
          ) : (
            <VideoView
              style={[
                styles.video,
                isMirrored && { transform: [{ scaleX: -1 }] },
              ]}
              player={player}
              nativeControls={false}
            />
          )}

          {/* Watermark — 영상 컨테이너 기준 좌측 하단 */}
          <View style={styles.watermark} pointerEvents="none">
            <Image source={require('../assets/logo.png')} style={styles.watermarkIcon} resizeMode="contain" />
            <Text style={styles.watermarkText}>FocusTimelapse</Text>
          </View>

          {/* Overlay — 영상 컨테이너 기준 우측 상단 */}
          {(overlayStyle === 'timer' || overlayStyle === 'progress' || overlayStyle === 'streak') && (
            <View style={styles.topRightOverlay} pointerEvents="none">
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
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#FFF', fontSize: 22 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '600' },

  previewArea: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoContainer: {
    // 정확한 영상 크기, 오버레이는 이 안에서 absolute
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
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
    justifyContent: 'center',
  },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  upgradeButton: { alignItems: 'center', paddingVertical: 4 },
  upgradeText: { color: '#4A90E2', fontSize: 15, fontWeight: '500' },
});
