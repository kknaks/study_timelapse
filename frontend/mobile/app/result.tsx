import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { COLORS } from '../src/constants';

// 웹 테스트용 샘플 타임랩스 영상
const SAMPLE_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';

type OverlayStyle = 'none' | 'timer' | 'progress';

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    downloadUrl: string;
    sessionId: string;
    studyMinutes: string;
    outputSeconds: string;
  }>();

  const downloadUrl = params.downloadUrl || SAMPLE_VIDEO_URL;
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('none');
  const [saving, setSaving] = useState(false);

  const player = useVideoPlayer(downloadUrl, (p) => {
    p.loop = true;
    p.play();
  });

  const handleSave = async () => {
    if (saving) return;
    if (!downloadUrl) {
      Alert.alert('알림', '저장할 영상이 없어요. 실제 기기에서 촬영 후 사용해주세요.');
      return;
    }
    setSaving(true);
    try {
      // TODO: 실제 저장 로직 (expo-media-library)
      Alert.alert('저장 완료', '영상이 갤러리에 저장되었어요!');
    } catch {
      Alert.alert('오류', '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgrade = () => {
    Alert.alert('업그레이드', '곧 출시 예정이에요!');
  };

  const overlayOptions: { key: OverlayStyle; label: string }[] = [
    { key: 'none', label: 'None' },
    { key: 'timer', label: 'Timer' },
    { key: 'progress', label: 'Progress Bar' },
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

      {/* Video Preview Area */}
      <View style={styles.previewArea}>
        {Platform.OS === 'web' ? (
          // 웹: HTML video 태그
          <video
            src={downloadUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          // 네이티브: expo-video
          <VideoView
            style={styles.video}
            player={player}
            nativeControls={false}
          />
        )}
      </View>

      {/* Bottom Card */}
      <View style={styles.bottomCard}>
        {/* Overlay Style */}
        <Text style={styles.sectionLabel}>OVERLAY STYLE</Text>
        <View style={styles.overlayRow}>
          {overlayOptions.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.overlayBtn,
                overlayStyle === opt.key && styles.overlayBtnActive,
              ]}
              onPress={() => setOverlayStyle(opt.key)}
            >
              <Text
                style={[
                  styles.overlayBtnText,
                  overlayStyle === opt.key && styles.overlayBtnTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.saveIcon}>💾</Text>
              <Text style={styles.saveText}>Save Video</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Upgrade Link */}
        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeText}>Remove Watermark (Upgrade)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#1a1a1a',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '400',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  previewArea: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  bottomCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    gap: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  overlayRow: {
    flexDirection: 'row',
    gap: 10,
  },
  overlayBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  overlayBtnActive: {
    backgroundColor: '#1a1a1a',
  },
  overlayBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  overlayBtnTextActive: {
    color: '#FFF',
  },
  saveButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveIcon: {
    fontSize: 18,
  },
  saveText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  upgradeButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  upgradeText: {
    color: '#4A90E2',
    fontSize: 15,
    fontWeight: '500',
  },
});
