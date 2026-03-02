import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../src/constants';
import { updateSession } from '../src/api/sessions';

type Stage = 'converting' | 'done' | 'error';

function getStageIcon(stage: Stage): string {
  switch (stage) {
    case 'converting': return '▶';
    case 'done': return '✓';
    case 'error': return '✕';
  }
}

function getMotivationMessage(ratio: number): string {
  if (ratio >= 1.0) return 'Goal achieved! You crushed it!';
  if (ratio >= 0.9) return 'Almost perfect! Incredible focus!';
  if (ratio >= 0.75) return '75% done! That\'s seriously impressive!';
  if (ratio >= 0.5) return '⚡ Over halfway! Great work today!';
  if (ratio >= 0.25) return 'Solid start! Every session counts!';
  return 'Every step forward matters. Keep going!';
}

const getScaleFilter = (ar: string): string => {
  if (ar === '9:16') return 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black';
  if (ar === '1:1') return 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:black';
  if (ar === '4:5') return 'scale=720:900:force_original_aspect_ratio=decrease,pad=720:900:(ow-iw)/2:(oh-ih)/2:black';
  return 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black'; // 16:9
};

export default function ProcessingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    photoUris: string;
    sessionId: string;
    outputSeconds: string;
    recordingSeconds: string;
    aspectRatio: string;
    studyMinutes: string;
    timerMode: string;
    cameraFacing: string;
  }>();

  const photoUrisRaw = params.photoUris ?? '';
  const photoUris = photoUrisRaw ? photoUrisRaw.split(',').filter(Boolean) : [];
  const cameraFacing = params.cameraFacing ?? 'front';
  const sessionId = params.sessionId ?? '';
  const outputSecs = Number(params.outputSeconds) || 60;
  const recordingSecs = Number(params.recordingSeconds) || 0;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const studyMinutes = Number(params.studyMinutes) || 60;
  const timerMode = params.timerMode ?? 'countdown';
  const achievementRatio = Math.min(1, recordingSecs / (studyMinutes * 60));

  const [stage, setStage] = useState<Stage>('converting');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  const cancelledRef = useRef(false);
  const [resultUrl, setResultUrl] = useState('');

  const navigateToResult = useCallback((url = '') => {
    const localUri = url && !url.startsWith('file://') && !url.startsWith('http')
      ? `file://${url}`
      : url;
    router.replace({
      pathname: '/result',
      params: {
        downloadUrl: localUri,
        sessionId,
        studyMinutes: String(studyMinutes),
        recordingSeconds: String(recordingSecs),
        outputSeconds: String(outputSecs),
        aspectRatio,
        timerMode,
        cameraFacing,
      },
    });
  }, [router, sessionId, studyMinutes, recordingSecs, outputSecs, aspectRatio, timerMode, cameraFacing]);

  useEffect(() => {
    processVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processVideo = async () => {
    // 웹 환경 또는 사진 없음 → 바로 결과 화면으로
    if (Platform.OS === 'web' || photoUris.length === 0) {
      if (sessionId) {
        try {
          await updateSession(sessionId, {
            end_time: new Date().toISOString(),
            duration: recordingSecs,
            status: 'completed',
          });
        } catch (e) {
          console.warn('Failed to update session:', e);
        }
      }
      setStage('done');
      setProgress(100);
      return;
    }

    try {
      // 동적 import — 웹에서는 이 코드에 도달하지 않음
      const { FFmpegKit, ReturnCode } = await import('ffmpeg-kit-react-native');
      const FileSystem = await import('expo-file-system/legacy');

      setStage('converting');
      setProgress(10);

      // filelist.txt 생성
      const frameDuration = 1.0 / 30;
      const filelistContent = photoUris
        .map(uri => `file '${uri}'\nduration ${frameDuration.toFixed(6)}`)
        .join('\n');
      const filelistPath = `${FileSystem.documentDirectory}filelist_${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(filelistPath, filelistContent);

      if (cancelledRef.current) return;
      setProgress(20);

      // 출력 파일 경로
      const outputPath = `${FileSystem.documentDirectory}timelapse_${Date.now()}.mp4`;

      // FFmpeg 명령어 실행
      const scaleFilter = getScaleFilter(aspectRatio);
      const cmd = `-y -f concat -safe 0 -i "${filelistPath}" -vf "${scaleFilter}" -r 30 -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;

      setProgress(40);

      const session = await FFmpegKit.execute(cmd);

      if (cancelledRef.current) return;

      const returnCode = await session.getReturnCode();

      if (!ReturnCode.isSuccess(returnCode)) {
        const logs = await session.getAllLogsAsString();
        throw new Error(`FFmpeg failed: ${logs?.slice(-200)}`);
      }

      // filelist 정리
      await FileSystem.deleteAsync(filelistPath, { idempotent: true });

      setProgress(100);
      setStage('done');

      // 세션 업데이트
      if (sessionId) {
        try {
          await updateSession(sessionId, {
            end_time: new Date().toISOString(),
            duration: recordingSecs,
            status: 'completed',
          });
        } catch (e) {
          console.warn('session update failed:', e);
        }
      }

      setResultUrl(outputPath);
      navigateToResult(outputPath);
    } catch (err) {
      if (cancelledRef.current) return;
      console.error('Processing error:', err);
      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  };

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    cancelledRef.current = true;
    setShowCancelModal(false);
    router.replace('/');
  };

  const handleRetry = () => {
    setStage('converting');
    setProgress(0);
    setErrorMessage('');
    cancelledRef.current = false;
    processVideo();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Stage Icon */}
        <View style={[styles.stageIconWrap, stage === 'done' && styles.stageIconWrapDone, stage === 'error' && styles.stageIconWrapError]}>
          <Text style={styles.stageIcon}>{getStageIcon(stage)}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {stage === 'error' ? 'Oops!' : 'Creating Your Timelapse'}
        </Text>

        {/* Progress bar — 달성 비율 표시 */}
        {stage !== 'error' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${Math.round(achievementRatio * 100)}%` }]} />
            </View>
            <Text style={styles.achievementLabel}>
              {Math.round(achievementRatio * 100)}% of goal achieved
            </Text>
          </View>
        )}

        {/* 동기부여 문구 */}
        <Text style={styles.motivationLabel}>
          {stage === 'error' ? 'Something went wrong' : getMotivationMessage(achievementRatio)}
        </Text>

        {/* 달성률 낮을 때 보장 메시지 */}
        {achievementRatio < 0.9 && stage !== 'error' && (
          <Text style={styles.guaranteeText}>
            You'll still get your full {outputSecs}s timelapse!
          </Text>
        )}

        {/* Error message */}
        {stage === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Try Again</Text>
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

        {/* View Results 버튼 (done 상태) */}
        {stage === 'done' && (
          <TouchableOpacity
            style={styles.viewResultsButton}
            onPress={() => navigateToResult(resultUrl)}
          >
            <Text style={styles.viewResultsText}>View Results →</Text>
          </TouchableOpacity>
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
  stageIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2.5,
    borderColor: '#CCCCCC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  stageIconWrapDone: {
    borderColor: COLORS.text,
  },
  stageIconWrapError: {
    borderColor: '#E53935',
  },
  stageIcon: {
    fontSize: 32,
    fontWeight: '300',
    color: COLORS.text,
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
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  progressContainer: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    marginBottom: 24,
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
  guaranteeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
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
  viewResultsButton: {
    marginTop: 32,
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  viewResultsText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
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
