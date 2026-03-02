import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  StatusBar,
  Platform,
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
  const [hasStarted, setHasStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');

  const cameraRef = useRef<CameraView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoUriRef = useRef<string>('');
  const isStoppingRef = useRef(false);
  const navigateAfterRecordRef = useRef<((uri: string) => void) | null>(null);

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

  // 자동 시작 제거 — 사용자가 시작 버튼 누를 때 startRecording 호출

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
        videoQuality: '720p', // 파일 크기 최소화 (기본 4K → 720p)
      });
      // recordAsync resolves when recording stops
      if (video?.uri) {
        videoUriRef.current = video.uri;
        console.log('[focus] recordAsync resolved, uri:', video.uri);
      }
      // recordAsync가 resolve되면 navigateRef 콜백 실행
      if (navigateAfterRecordRef.current) {
        navigateAfterRecordRef.current(video?.uri || '');
        navigateAfterRecordRef.current = null;
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

    const navigateToProcessing = (uri: string) => {
      console.log('[focus] navigating to processing with uri:', uri);
      router.replace({
        pathname: '/processing',
        params: {
          videoUri: uri || '',
          sessionId,
          outputSeconds: String(outputSeconds),
          recordingSeconds: String(elapsed),
          aspectRatio,
          studyMinutes: String(studyMinutes),
          timerMode,
        },
      });
    };

    if (Platform.OS === 'web') {
      // 웹: 카메라 없으므로 바로 이동
      navigateToProcessing('');
    } else {
      // 모바일: recordAsync resolve 기다림 (콜백 등록)
      navigateAfterRecordRef.current = navigateToProcessing;
      // 안전장치: 3초 후에도 안 오면 강제 이동
      setTimeout(() => {
        if (navigateAfterRecordRef.current) {
          console.log('[focus] timeout fallback, uri:', videoUriRef.current);
          navigateAfterRecordRef.current(videoUriRef.current);
          navigateAfterRecordRef.current = null;
        }
      }, 3000);
    }
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
        <View style={styles.permIconWrap}>
          <Text style={styles.permIconText}>⊙</Text>
        </View>
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

  // 웹에서 1:1 crop을 위한 인라인 스타일
  const webCameraStyle = Platform.OS === 'web' && aspectRatio === '1:1'
    ? ({
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        overflow: 'hidden',
      } as any)
    : undefined;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Camera Preview — aspect ratio 맞게 중앙 배치, 나머지 검정 */}
      <View style={[
        styles.cameraWrapper,
        aspectRatio === '16:9' && styles.cameraWrapper16x9,
      ]} {...(webCameraStyle ? { style: webCameraStyle } : {})}>
        <CameraView
          ref={cameraRef}
          style={[
            styles.camera,
            // 1:1: 너비 = 높이로 정사각형 crop
            aspectRatio === '1:1' && (Platform.OS === 'web'
              ? ({ width: '100vh', height: '100vh', maxWidth: '100%', maxHeight: '100%' } as any)
              : { aspectRatio: 1, width: '100%', height: undefined }),
            // 16:9: 위아래 레터박스
            aspectRatio === '16:9' && (Platform.OS === 'web'
              ? ({ width: '100%', aspectRatio: '16/9' } as any)
              : { aspectRatio: 16/9, width: '100%', height: undefined }),
          ]}
          facing={cameraFacing}
          mode="video"
          onCameraReady={() => setCameraReady(true)}
        />
      </View>

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top: 뒤로가기(왼쪽) + 타이머 (오른쪽) */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Text style={styles.exitButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.timerContainer}>
            <Text style={styles.timerLabel}>
              {timerMode === 'countdown' ? 'REMAINING' : 'ELAPSED'}
            </Text>
            <Text style={styles.timerTime}>
              {timerMode === 'countdown' ? formatTime(remaining) : formatTime(elapsed)}
            </Text>
          </View>
        </View>

        {/* Camera Unavailable 표시 (웹) */}
        {!cameraPermission?.granted && (
          <View style={styles.cameraUnavailable}>
            <Text style={styles.cameraUnavailableText}>⊘  Camera Unavailable</Text>
          </View>
        )}

        {/* Bottom: FOCUS SESSION ACTIVE + 버튼들 */}
        <View style={styles.bottomRow}>
          <Text style={styles.sessionActiveLabel}>
            {!hasStarted ? 'READY TO RECORD' : isRecording ? 'FOCUS SESSION ACTIVE' : 'PAUSED'}
          </Text>
          <View style={styles.controls}>
            {/* 카메라 전환 버튼 */}
            {!hasStarted && Platform.OS !== 'web' && (
              <TouchableOpacity
                style={styles.flipButton}
                onPress={() => setCameraFacing(f => f === 'front' ? 'back' : 'front')}
                activeOpacity={0.7}
              >
                <Text style={styles.flipIcon}>⇄</Text>
              </TouchableOpacity>
            )}

            {/* 시작/일시정지 버튼 */}
            <TouchableOpacity
              style={styles.pauseButton}
              onPress={() => {
                if (!hasStarted) {
                  setHasStarted(true);
                  startRecording();
                } else if (isRecording) {
                  if (intervalRef.current) clearInterval(intervalRef.current);
                  setIsRecording(false);
                } else {
                  setIsRecording(true);
                }
              }}
              activeOpacity={0.7}
            >
              {!hasStarted ? (
                <View style={styles.playIcon} />
              ) : isRecording ? (
                <View style={styles.pauseIconWrap}>
                  <View style={styles.pauseBar} />
                  <View style={styles.pauseBar} />
                </View>
              ) : (
                <View style={styles.playIcon} />
              )}
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
      <Modal visible={showExitModal} transparent animationType="slide" onRequestClose={() => setShowExitModal(false)}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setShowExitModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>End Session?</Text>
            <Text style={styles.modalText}>
              If you leave now, your recording will not be saved.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowExitModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Keep Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={confirmExit}
              >
                <Text style={styles.modalBtnConfirmText}>Leave</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  // 1:1: 화면 너비만큼 정사각형으로 crop
  cameraWrapper1x1: {
    top: '50%' as any,
    transform: [{ translateY: -1 }], // 미세 보정
    ...(Platform.OS === 'web' ? {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      overflow: 'hidden',
    } : {}),
  },
  // 16:9: 위아래 레터박스
  cameraWrapper16x9: {},
  camera: {
    width: '100%',
    height: '100%',
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
  flipButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  flipIcon: {
    fontSize: 22,
    color: '#FFF',
    fontWeight: '600',
  },
  pauseButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIconWrap: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#FFF',
  },
  playIcon: {
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFF',
    marginLeft: 3,
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
  permIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2.5,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permIconText: {
    fontSize: 32,
    color: '#FFF',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#F5F5F5',
  },
  modalBtnCancelText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
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
