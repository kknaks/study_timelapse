import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getMe } from '../src/api/user';
import { COLORS } from '../src/constants';
import { buildScaledLayout } from '../src/constants/overlayLayout';
import { formatGoalLabel } from '../src/utils/timeFormat';
import { useSubscription } from '../src/hooks/useSubscription';

type OverlayStyle = 'none' | 'timer-up' | 'timer-down' | 'progress' | 'streak';

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

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
    cameraFacing: string;
    previewPath: string;
    captureDir: string;
  }>();

  const outputSecs = Number(params.outputSeconds) || 30;
  const studyMinutes = Number(params.studyMinutes) || 0;
  const recordingSecs = Number(params.recordingSeconds) || studyMinutes * 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
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

  // ── 동영상 timeline sync ──
  // expo-video 의 player.currentTime/duration 을 폴링하여 0..1 ratio 로 변환.
  // 무한반복 재생이라 currentTime 이 0→duration→0 으로 loop → timer/progress 도 자동 loop.
  const [videoRatio, setVideoRatio] = useState(0);
  useEffect(() => {
    if (!previewPath) return;
    const id = setInterval(() => {
      const dur = player.duration;
      const cur = player.currentTime;
      if (dur > 0 && Number.isFinite(cur)) {
        const r = Math.min(1, Math.max(0, cur / dur));
        setVideoRatio(r);
      }
    }, 50);
    return () => clearInterval(id);
  }, [player, previewPath]);

  // ratio → 표시값
  // overlayStyle 'timer-up': 0 → recordingSecs
  // overlayStyle 'timer-down': recordingSecs → 0
  const elapsed = overlayStyle === 'timer-down'
    ? recordingSecs * (1 - videoRatio)
    : recordingSecs * videoRatio;
  // progress: 0 → 100% (video timeline 그대로)
  const progressPercent = videoRatio * 100;

  // streak (useQuery)
  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
  });
  const streak = (userData as any)?.data?.streak ?? (userData as any)?.streak ?? 0;
  const { showWatermark, showProgressBar } = useSubscription();

  // RN 오버레이 SSOT — vidW 기준 scale (native와 동일: × vidW/390)
  const SL = buildScaledLayout(vidW || 390);

  const overlayOptions: { key: OverlayStyle; label: string; proOnly?: boolean }[] = [
    { key: 'none', label: 'None' },
    { key: 'timer-up', label: 'Count Up' },
    { key: 'timer-down', label: 'Count Down' },
    { key: 'progress', label: 'Progress Bar', proOnly: true },
    { key: 'streak', label: 'Streak' },
  ];

  const handleSave = () => {
    router.push({
      pathname: '/saving',
      params: {
        overlayStyle,
        streak: String(streak),
        studyMinutes: String(studyMinutes),
        recordingSeconds: String(recordingSecs),
        outputSeconds: String(outputSecs),
        goalSec: String(goalSec),
        aspectRatio,
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
          <>
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
                  contentFit="contain"
                  nativeControls={false}
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#999', fontSize: 14 }}>Video preview</Text>
                </View>
              )}
            </View>

            {/* RN 오버레이: Free/Expired/Cancelled → 워터마크 표시, Trial/Pro → 숨김 */}
            <View pointerEvents="none" style={{
              position: 'absolute',
              left: offsetX,
              top: offsetY,
              width: vidW,
              height: vidH,
              overflow: 'hidden',
            }}>
              {/* 워터마크 RN 오버레이 제거 — preview 영상 자체에 burn-in 됨 (Native burnInOverlay) */}

              {(overlayStyle === 'timer-up' || overlayStyle === 'timer-down' || overlayStyle === 'progress' || overlayStyle === 'streak') && (
                <View style={[styles.topRightOverlay, {
                  top: SL.progress.paddingTop,
                  right: SL.progress.paddingRight,
                  gap: SL.progress.labelGap,
                }]}>
                  {(overlayStyle === 'timer-up' || overlayStyle === 'timer-down') && (
                    <Text style={[styles.timerText, { fontSize: SL.timer.fontSize }]}>{formatTime(elapsed)}</Text>
                  )}
                  {overlayStyle === 'progress' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SL.progress.labelGap }}>
                      <Text style={[styles.goalLabel, { fontSize: SL.progress.fontSize }]}>{formatGoalLabel(goalSec)}</Text>
                      <View style={[styles.progressTrack, {
                        width: SL.progress.barWidth,
                        height: SL.progress.barHeight,
                        borderRadius: SL.progress.barHeight / 2,
                      }]}>
                        <View style={[styles.progressFill, {
                          width: `${Math.min(100, progressPercent * (recordingSecs / Math.max(1, goalSec)))}%` as any,
                          borderRadius: SL.progress.barHeight / 2,
                        }]} />
                      </View>
                    </View>
                  )}
                  {overlayStyle === 'streak' && (
                    <Text style={[styles.timerText, { fontSize: SL.timer.fontSize }]}>▸ {streak} day{streak !== 1 ? 's' : ''} streak</Text>
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
          {overlayOptions.map((opt) => {
            const locked = opt.proOnly && !showProgressBar;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.overlayBtn,
                  overlayStyle === opt.key && styles.overlayBtnActive,
                  locked && styles.overlayBtnLocked,
                ]}
                onPress={() => {
                  if (locked) {
                    router.push('/paywall');
                    return;
                  }
                  setOverlayStyle(opt.key);
                }}
              >
                <Text style={[
                  styles.overlayBtnText,
                  overlayStyle === opt.key && styles.overlayBtnTextActive,
                  locked && styles.overlayBtnTextLocked,
                ]}>
                  {opt.label}{locked ? ' (Pro)' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveText}>Save to Gallery</Text>
        </TouchableOpacity>
        {showWatermark && (
          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
            <Text style={styles.upgradeText}>Remove Watermark (Upgrade)</Text>
          </TouchableOpacity>
        )}
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
  watermark: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  topRightOverlay: {
    position: 'absolute',
    alignItems: 'flex-end',
  },
  timerText: {
    color: '#FFF',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  goalLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  progressTrack: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFF',
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
  overlayBtn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F0F0F0' },
  overlayBtnActive: { backgroundColor: '#1a1a1a' },
  overlayBtnText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  overlayBtnTextActive: { color: '#FFF' },
  saveButton: { backgroundColor: '#1a1a1a', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  upgradeButton: { alignItems: 'center', paddingVertical: 4 },
  upgradeText: { color: '#4A90E2', fontSize: 15, fontWeight: '500' },
  overlayBtnLocked: { backgroundColor: '#E8E8E8', opacity: 0.7 },
  overlayBtnTextLocked: { color: '#999' },
});
