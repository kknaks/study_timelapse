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
  }>();

  const studyMinutes = Number(params.studyMinutes) || 60;
  const totalSeconds = studyMinutes * 60;
  const sessionId = params.sessionId ?? '';
  const outputSeconds = Number(params.outputSeconds) || 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const overlayStyle = params.overlayStyle ?? 'stopwatch';

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
      if (uri) {
        router.replace({
          pathname: '/processing',
          params: {
            videoUri: uri,
            sessionId,
            outputSeconds: String(outputSeconds),
            recordingSeconds: String(elapsed),
            aspectRatio,
          },
        });
      } else {
        Alert.alert('Error', 'No video was recorded. Please try again.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
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
    router.back();
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
        <TouchableOpacity style={styles.permBackButton} onPress={() => router.back()}>
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
        {/* Top: X button + Remaining time */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Text style={styles.exitButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.remainingContainer}>
            <Text style={styles.remainingLabel}>Remaining</Text>
            <Text style={styles.remainingTime}>{formatTime(remaining)}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Progress bar */}
        {overlayStyle !== 'none' && (
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.min(progressPercent, 100)}%` }]} />
          </View>
        )}

        {/* Bottom: Elapsed time + controls */}
        <View style={styles.bottomRow}>
          <View style={styles.elapsedContainer}>
            <Text style={styles.elapsedLabel}>Elapsed</Text>
            <Text style={styles.elapsedTime}>{formatTime(elapsed)}</Text>
          </View>

          <View style={styles.controls}>
            {/* Recording indicator */}
            {isRecording && (
              <View style={styles.recIndicator}>
                <View style={styles.recDot} />
                <Text style={styles.recText}>REC</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.stopButton}
              onPress={handleStop}
              activeOpacity={0.7}
            >
              <View style={styles.stopIcon} />
              <Text style={styles.stopText}>Stop</Text>
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
    paddingHorizontal: 20,
  },
  exitButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButtonText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
  },
  remainingContainer: {
    alignItems: 'center',
  },
  remainingLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  remainingTime: {
    color: '#FFF',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 20,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 50,
    paddingHorizontal: 20,
  },
  elapsedContainer: {
    flex: 1,
  },
  elapsedLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  elapsedTime: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '600',
  },
  controls: {
    alignItems: 'center',
    gap: 12,
  },
  recIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  recText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '700',
  },
  stopButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,59,48,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  stopText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
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
