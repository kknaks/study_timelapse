import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { COLORS } from '../src/constants';

function formatTime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function FocusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId: string;
    studyMinutes: string;
    outputSeconds: string;
    aspectRatio: string;
    overlayStyle: string;
    timerMode: string;
  }>();

  const studyMinutes = Number(params.studyMinutes) || 60;
  const totalSeconds = studyMinutes * 60;
  const sessionId = params.sessionId ?? '';
  const outputSeconds = Number(params.outputSeconds) || 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const overlayStyle = params.overlayStyle ?? 'none';
  const timerMode = params.timerMode ?? 'countdown';

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoUriRef = useRef<string>('');
  const isStoppingRef = useRef(false);

  const remaining = Math.max(0, totalSeconds - elapsed);

  // Request permissions on mount
  useEffect(() => {
    const requestPerms = async () => {
      if (!cameraPermission?.granted) {
        await requestCameraPermission();
      }
      if (!micPermission?.granted) {
        await requestMicPermission();
      }
    };
    requestPerms();
  }, [cameraPermission, micPermission, requestCameraPermission, requestMicPermission]);

  // Start recording once camera is ready
  useEffect(() => {
    if (cameraReady && !isRecording && cameraPermission?.granted) {
      startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, cameraPermission?.granted]);

  // Timer interval
  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRecording]);

  // Auto-stop when time is up
  useEffect(() => {
    if (elapsed >= totalSeconds && isRecording) {
      handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, totalSeconds, isRecording]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: totalSeconds + 5, // buffer
      });
      // recordAsync resolves when recording stops
      if (video?.uri) {
        videoUriRef.current = video.uri;
      }
    } catch (err) {
      console.error('Recording error:', err);
    }
  }, [isRecording, totalSeconds]);

  const handleStop = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      cameraRef.current?.stopRecording();
    } catch (err) {
      console.error('Stop recording error:', err);
    }

    setIsRecording(false);

    // Small delay to let recordAsync resolve
    setTimeout(() => {
      const uri = videoUriRef.current;
      // uri가 없어도 결과 화면으로 이동 (웹 환경 또는 카메라 미지원 시)
      router.replace({
        pathname: '/processing',
        params: {
          videoUri: uri || '',
          sessionId,
          outputSeconds: String(outputSeconds),
          recordingSeconds: String(elapsed),
          aspectRatio,
        },
      });
    }, 500);
  }, [elapsed, sessionId, outputSeconds, aspectRatio, router]);

  const handleExit = () => {
    setShowExitModal(true);
  };

  const confirmExit = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    try {
      cameraRef.current?.stopRecording();
    } catch (_e) {
      // ignore
    }
    setShowExitModal(false);
    router.canGoBack() ? router.back() : router.replace('/');
  };

  // Permissions not yet granted
  if (!cameraPermission?.granted || !micPermission?.granted) {
    return (
      <View style={styles.permContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.permEmoji}>📷</Text>
        <Text style={styles.permTitle}>Camera & Microphone Access</Text>
        <Text style={styles.permText}>
          We need camera and microphone permissions to record your focus session.
        </Text>
        <TouchableOpacity
          style={styles.permButton}
          onPress={async () => {
            await requestCameraPermission();
            await requestMicPermission();
          }}
        >
          <Text style={styles.permButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permBackButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.permBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progressPercent = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Camera Preview */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        mode="video"
        onCameraReady={() => setCameraReady(true)}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top: 타이머 (왼쪽) + X버튼 (오른쪽) */}
        <View style={styles.topRow}>
          <View style={styles.timerContainer}>
            <Text style={styles.timerLabel}>
              {timerMode === 'countdown' ? 'REMAINING' : 'ELAPSED'}
            </Text>
            <Text style={styles.timerTime}>
              {timerMode === 'countdown' ? formatTime(remaining) : formatTime(elapsed)}
            </Text>
          </View>
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Text style={styles.exitButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Camera Unavailable 표시 (웹) */}
        {!cameraPermission?.granted && (
          <View style={styles.cameraUnavailable}>
            <Text style={styles.cameraUnavailableText}>⊘  Camera Unavailable</Text>
          </View>
        )}

        {/* Bottom: FOCUS SESSION ACTIVE + 버튼들 */}
        <View style={styles.bottomRow}>
          <Text style={styles.sessionActiveLabel}>FOCUS SESSION ACTIVE</Text>
          <View style={styles.controls}>
            {/* 일시정지 버튼 */}
            <TouchableOpacity
              style={styles.pauseButton}
              onPress={() => {
                if (isRecording) {
                  if (intervalRef.current) clearInterval(intervalRef.current);
                  setIsRecording(false);
                } else {
                  setIsRecording(true);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.pauseIcon}>{isRecording ? '⏸' : '▶'}</Text>
            </TouchableOpacity>

            {/* 정지 버튼 */}
            <TouchableOpacity
              style={styles.stopButton}
              onPress={handleStop}
              activeOpacity={0.7}
            >
              <View style={styles.stopIcon} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Exit Confirmation Modal */}
      <Modal visible={showExitModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>End Session?</Text>
            <Text style={styles.modalText}>
              Your recording will be discarded. Are you sure?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowExitModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={confirmExit}
              >
                <Text style={styles.modalBtnConfirmText}>End Session</Text>
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
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  timerContainer: {
    alignItems: 'flex-start',
  },
  timerLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  timerTime: {
    color: '#FFF',
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: 1,
  },
  exitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  exitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraUnavailable: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  cameraUnavailableText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  bottomRow: {
    alignItems: 'center',
    paddingBottom: 60,
    gap: 20,
  },
  sessionActiveLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  pauseButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: {
    fontSize: 22,
    color: '#FFF',
  },
  stopButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
  },
  // Permission screen
  permContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
  permTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  permText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  permButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    marginBottom: 16,
  },
  permButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  permBackButton: {
    paddingVertical: 12,
  },
  permBackText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
