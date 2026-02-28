import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { createSession } from '../src/api/sessions';
import { COLORS, ASPECT_RATIOS, OUTPUT_SECONDS, OVERLAY_STYLES } from '../src/constants';
import type { CreateSessionRequest } from '../src/types';

const HOUR_OPTIONS = [0, 1, 2, 3, 4];
const MINUTE_OPTIONS = [0, 15, 30, 45];

function estimateStorageMB(outputSeconds: number, aspectRatio: string): string {
  // Rough estimate: ~2MB per 30s of 1080p video
  const baseRate = 2; // MB per 30s
  const ratio = outputSeconds / 30;
  let multiplier = 1;
  if (aspectRatio === '16:9') multiplier = 1.2;
  if (aspectRatio === '1:1') multiplier = 0.8;
  const mb = baseRate * ratio * multiplier;
  return mb.toFixed(0);
}

export default function SessionSetupScreen() {
  const router = useRouter();

  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [outputSeconds, setOutputSeconds] = useState<number>(60);
  const [aspectRatio, setAspectRatio] = useState<string>('9:16');
  const [overlayStyle, setOverlayStyle] = useState<string>('stopwatch');

  const totalStudyMinutes = hours * 60 + minutes;

  const mutation = useMutation({
    mutationFn: (data: CreateSessionRequest) => createSession(data),
    onSuccess: (response) => {
      const createdSession = response.data;
      router.push({
        pathname: '/focus',
        params: {
          sessionId: createdSession.id,
          studyMinutes: String(totalStudyMinutes),
          outputSeconds: String(outputSeconds),
          aspectRatio,
          overlayStyle,
        },
      });
    },
    onError: (error: Error) => {
      Alert.alert('Error', 'Failed to create session. Please try again.');
      console.error('Create session error:', error);
    },
  });

  const handleStart = () => {
    if (totalStudyMinutes < 5) {
      Alert.alert('Too Short', 'Please set at least 5 minutes of study time.');
      return;
    }

    mutation.mutate({
      output_seconds: outputSeconds,
      aspect_ratio: aspectRatio,
      overlay_style: overlayStyle,
    });
  };

  const renderOptionButtons = <T extends string | number>(
    options: readonly T[],
    selected: T,
    onSelect: (val: T) => void,
    formatLabel?: (val: T) => string,
  ) => (
    <View style={styles.optionRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={String(opt)}
          style={[styles.optionButton, selected === opt && styles.optionButtonActive]}
          onPress={() => onSelect(opt)}
        >
          <Text style={[styles.optionText, selected === opt && styles.optionTextActive]}>
            {formatLabel ? formatLabel(opt) : String(opt)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Study Duration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📚 Study Duration</Text>
        <Text style={styles.sectionSubtitle}>How long will you study?</Text>

        <Text style={styles.fieldLabel}>Hours</Text>
        {renderOptionButtons(HOUR_OPTIONS, hours, setHours, (v) => `${v}h`)}

        <Text style={styles.fieldLabel}>Minutes</Text>
        {renderOptionButtons(MINUTE_OPTIONS, minutes, setMinutes, (v) => `${v}m`)}

        <View style={styles.durationSummary}>
          <Text style={styles.durationText}>
            Total: {hours > 0 ? `${hours}h ` : ''}{minutes > 0 ? `${minutes}m` : hours > 0 ? '' : '0m'}
          </Text>
        </View>
      </View>

      {/* Output Length */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎬 Output Length</Text>
        <Text style={styles.sectionSubtitle}>Final timelapse video duration</Text>
        {renderOptionButtons(OUTPUT_SECONDS, outputSeconds, setOutputSeconds, (v) => `${v}s`)}
      </View>

      {/* Aspect Ratio */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📐 Aspect Ratio</Text>
        <Text style={styles.sectionSubtitle}>Choose for your platform</Text>
        {renderOptionButtons(ASPECT_RATIOS, aspectRatio, setAspectRatio, (v) => {
          if (v === '9:16') return '9:16\nReels/TikTok';
          if (v === '1:1') return '1:1\nInstagram';
          return '16:9\nYouTube';
        })}
      </View>

      {/* Overlay Style */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏱️ Overlay Style</Text>
        <Text style={styles.sectionSubtitle}>Timer display on the video</Text>
        {renderOptionButtons(OVERLAY_STYLES, overlayStyle, setOverlayStyle, (v) => {
          const labels: Record<string, string> = {
            'stopwatch': '⏱️ Stopwatch',
            'progress-bar': '📊 Progress',
            'minimal': '• Minimal',
            'none': '✕ None',
          };
          return labels[v] ?? v;
        })}
      </View>

      {/* Storage Estimate */}
      <View style={styles.estimateCard}>
        <Text style={styles.estimateTitle}>💾 Estimated Storage</Text>
        <Text style={styles.estimateValue}>
          ~{estimateStorageMB(outputSeconds, aspectRatio)} MB
        </Text>
      </View>

      {/* Start Button */}
      <TouchableOpacity
        style={[styles.startButton, mutation.isPending && styles.startButtonDisabled]}
        onPress={handleStart}
        disabled={mutation.isPending}
        activeOpacity={0.8}
      >
        {mutation.isPending ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.startButtonText}>🎥 Start Recording</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  optionButton: {
    flex: 1,
    minWidth: 64,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  optionButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  optionTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  durationSummary: {
    marginTop: 8,
    alignItems: 'center',
  },
  durationText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  estimateCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  estimateTitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  estimateValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  startButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
