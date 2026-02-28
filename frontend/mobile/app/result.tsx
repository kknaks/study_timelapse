import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { COLORS } from '../src/constants';

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    downloadUrl: string;
    sessionId: string;
    studyMinutes: string;
    outputSeconds: string;
  }>();

  const downloadUrl = params.downloadUrl ?? '';
  const studyMinutes = Number(params.studyMinutes) || 0;
  const outputSecs = Number(params.outputSeconds) || 0;

  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);

  const player = useVideoPlayer(downloadUrl, (p) => {
    p.loop = true;
    p.play();
  });

  const formatDuration = (mins: number): string => {
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
  };

  const handleSaveToGallery = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant media library access to save videos.',
        );
        setSaving(false);
        return;
      }

      // Download to local cache first
      const downloadedFile = await File.downloadFileAsync(
        downloadUrl,
        Paths.cache,
      );

      await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      setSaved(true);
      Alert.alert('Saved! 🎉', 'Your timelapse has been saved to your gallery.');
    } catch (err) {
      console.error('Save error:', err);
      Alert.alert('Error', 'Failed to save video. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [downloadUrl, saving]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);

    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing not available', 'Sharing is not supported on this device.');
        setSharing(false);
        return;
      }

      // Download to local cache first
      const downloadedFile = await File.downloadFileAsync(
        downloadUrl,
        Paths.cache,
      );

      await Sharing.shareAsync(downloadedFile.uri, {
        mimeType: 'video/mp4',
        dialogTitle: 'Share your timelapse',
      });
    } catch (err) {
      console.error('Share error:', err);
      Alert.alert('Error', 'Failed to share video. Please try again.');
    } finally {
      setSharing(false);
    }
  }, [downloadUrl, sharing]);

  const handleBackToHome = () => {
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🎉</Text>
          <Text style={styles.headerTitle}>Your Timelapse is Ready!</Text>
          <Text style={styles.headerSubtitle}>Great focus session!</Text>
        </View>

        {/* Video Preview */}
        <View style={styles.videoContainer}>
          <VideoView
            style={styles.video}
            player={player}
            nativeControls
            allowsPictureInPicture={false}
          />
        </View>

        {/* Session Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>📊 Session Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryEmoji}>⏱️</Text>
              <Text style={styles.summaryValue}>{formatDuration(studyMinutes)}</Text>
              <Text style={styles.summaryLabel}>Study Time</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryEmoji}>🎬</Text>
              <Text style={styles.summaryValue}>{outputSecs}s</Text>
              <Text style={styles.summaryLabel}>Video Length</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton, saved && styles.savedButton]}
            onPress={handleSaveToGallery}
            disabled={saving || saved}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              {saving ? '💾 Saving...' : saved ? '✅ Saved!' : '💾 Save to Gallery'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.shareButton]}
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.8}
          >
            <Text style={styles.shareButtonText}>
              {sharing ? '📤 Sharing...' : '📤 Share'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom: Back to Home */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={handleBackToHome}
          activeOpacity={0.8}
        >
          <Text style={styles.homeButtonText}>🏠 Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  videoContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 20,
    aspectRatio: 9 / 16,
    maxHeight: 400,
    alignSelf: 'center',
    width: '100%',
  },
  video: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    height: 50,
    backgroundColor: COLORS.border,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  savedButton: {
    backgroundColor: COLORS.success,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  shareButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  shareButtonText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: COLORS.background,
  },
  homeButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  homeButtonText: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: '700',
  },
});
