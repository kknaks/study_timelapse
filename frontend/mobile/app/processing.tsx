import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../src/constants';
import { uploadVideo, requestTimelapse, getTimelapseStatus } from '../src/api/timelapse';
import { updateSession } from '../src/api/sessions';

type Stage = 'uploading' | 'converting' | 'polling' | 'done' | 'error';

function getStageEmoji(stage: Stage): string {
  switch (stage) {
    case 'uploading': return '📤';
    case 'converting': return '🎬';
    case 'polling': return '⏳';
    case 'done': return '✅';
    case 'error': return '❌';
  }
}

function getMotivationMessage(ratio: number): string {
  if (ratio >= 1.0) return '🎉 Goal achieved! You crushed it!';
  if (ratio >= 0.9) return '💪 Almost perfect! Incredible focus!';
  if (ratio >= 0.75) return '🔥 75% done! That\'s seriously impressive!';
  if (ratio >= 0.5) return '⚡ Over halfway! Great work today!';
  if (ratio >= 0.25) return '🌱 Solid start! Every session counts!';
  return '✨ Every step forward matters. Keep going!';
}

export default function ProcessingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    videoUri: string;
    sessionId: string;
    outputSeconds: string;
    recordingSeconds: string;
    aspectRatio: string;
    studyMinutes: string;
  }>();

  const videoUri = params.videoUri ?? '';
  const sessionId = params.sessionId ?? '';
  const outputSecs = Number(params.outputSeconds) || 60;
  const recordingSecs = Number(params.recordingSeconds) || 0;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const studyMinutes = Number(params.studyMinutes) || 60;
  const achievementRatio = Math.min(1, recordingSecs / (studyMinutes * 60));

  const [stage, setStage] = useState<Stage>('uploading');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    processVideo();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processVideo = async () => {
    // 웹 환경 또는 카메라 미지원 시 (videoUri 없음) → 바로 결과 화면으로
    if (!videoUri) {
      setStage('done');
      setProgress(100);
      setTimeout(() => {
        router.replace({
          pathname: '/result',
          params: {
            downloadUrl: '',
            sessionId,
            studyMinutes: String(Math.round(recordingSecs / 60)),
            outputSeconds: String(outputSecs),
            aspectRatio,
          },
        });
      }, 2500);
      return;
    }

    try {
      // Stage 1: Upload
      setStage('uploading');
      setProgress(10);

      const uploadRes = await uploadVideo(videoUri, 'video/mp4');
      if (cancelledRef.current) return;

      const { fileId } = uploadRes.data;
      setProgress(30);

      // Stage 2: Request timelapse conversion
      setStage('converting');
      const timelapseRes = await requestTimelapse({
        fileId,
        outputSeconds: outputSecs,
        recordingSeconds: recordingSecs,
        aspectRatio,
      });
      if (cancelledRef.current) return;

      const { taskId } = timelapseRes.data;
      setProgress(40);

      // Stage 3: Poll for status
      setStage('polling');
      await pollStatus(taskId, fileId);
    } catch (err) {
      if (cancelledRef.current) return;
      console.error('Processing error:', err);
      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  };

  const pollStatus = (taskId: string, fileId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      pollingRef.current = setInterval(async () => {
        try {
          if (cancelledRef.current) {
            cleanup();
            resolve();
            return;
          }

          const statusRes = await getTimelapseStatus(taskId);
          const { status, progress: serverProgress, downloadUrl } = statusRes.data;

          // Map server progress (0-100) to our range (40-90)
          const mappedProgress = 40 + (serverProgress / 100) * 50;
          setProgress(Math.min(mappedProgress, 90));

          if (status === 'completed' && downloadUrl) {
            cleanup();
            setProgress(95);
            setStage('done');

            // Update session
            try {
              await updateSession(sessionId, {
                end_time: new Date().toISOString(),
                duration: recordingSecs,
                status: 'completed',
              });
            } catch (e) {
              console.warn('Failed to update session:', e);
            }

            setProgress(100);

            // Navigate to result
            setTimeout(() => {
              if (!cancelledRef.current) {
                router.replace({
                  pathname: '/result',
                  params: {
                    downloadUrl,
                    sessionId,
                    studyMinutes: String(Math.round(recordingSecs / 60)),
                    outputSeconds: String(outputSecs),
                    aspectRatio,
                  },
                });
              }
            }, 500);

            resolve();
          } else if (status === 'failed') {
            cleanup();
            setStage('error');
            setErrorMessage('Timelapse conversion failed. Please try again.');
            reject(new Error('Conversion failed'));
          }
        } catch (err) {
          console.error('Poll error:', err);
          // Don't stop polling on transient errors
        }
      }, 2000);
    });
  };

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    cancelledRef.current = true;
    cleanup();
    setShowCancelModal(false);
    router.replace('/');
  };

  const handleRetry = () => {
    setStage('uploading');
    setProgress(0);
    setErrorMessage('');
    cancelledRef.current = false;
    processVideo();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Emoji */}
        <Text style={styles.emoji}>{getStageEmoji(stage)}</Text>

        {/* Title */}
        <Text style={styles.title}>
          {stage === 'error' ? 'Oops!' : 'Creating Your Timelapse'}
        </Text>

        {/* 동기부여 문구 */}
        <Text style={styles.motivationLabel}>
          {stage === 'error' ? 'Something went wrong' : getMotivationMessage(achievementRatio)}
        </Text>

        {/* 달성 비율 */}
        {stage !== 'error' && (
          <Text style={styles.achievementLabel}>
            {Math.round(achievementRatio * 100)}% of goal achieved
          </Text>
        )}

        {/* Progress bar — 달성 비율 표시 */}
        {stage !== 'error' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${Math.round(achievementRatio * 100)}%` }]} />
            </View>
          </View>
        )}

        {/* Error message */}
        {stage === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>🔄 Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Spinner */}
        {stage !== 'error' && stage !== 'done' && (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 24 }}
          />
        )}

        {/* Tips */}
        {stage !== 'error' && (
          <Text style={styles.tip}>
            💡 This may take a few minutes for longer recordings
          </Text>
        )}
      </View>

      {/* Cancel button */}
      {stage !== 'done' && (
        <View style={styles.bottomContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cancel Confirmation Modal */}
      <Modal visible={showCancelModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel Processing?</Text>
            <Text style={styles.modalText}>
              Your recording will be lost. Are you sure?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Keep Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={confirmCancel}
              >
                <Text style={styles.modalBtnConfirmText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  stageLabel: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  motivationLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  achievementLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  progressContainer: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  progressBg: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  tip: {
    marginTop: 40,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  errorText: {
    fontSize: 15,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomContainer: {
    padding: 20,
    paddingBottom: 50,
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 28,
    marginHorizontal: 32,
    width: '85%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: COLORS.primaryLight,
  },
  modalBtnCancelText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  modalBtnConfirm: {
    backgroundColor: '#FF3B30',
  },
  modalBtnConfirmText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
