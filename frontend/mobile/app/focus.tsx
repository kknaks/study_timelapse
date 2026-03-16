import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { COLORS } from '../src/constants';

// 비율별 crop 컨테이너 스타일 계산
// Camera는 항상 sensor format으로 녹화, wrapper만 원하는 비율로 crop
function getCropStyle(aspectRatio: string) {
  switch (aspectRatio) {
    case '9:16': return { width: '100%' as const, aspectRatio: 9 / 16 };
    case '1:1':  return { width: '100%' as const, aspectRatio: 1 };
    case '16:9': return { width: '100%' as const, aspectRatio: 16 / 9 };
    case '4:5':  return { width: '100%' as const, aspectRatio: 4 / 5 };
    case '3:4':  return { width: '100%' as const, aspectRatio: 3 / 4 };
    default:     return { width: '100%' as const, aspectRatio: 9 / 16 };
  }
}

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
    timerMode: string;
  }>();

  const studyMinutes = Number(params.studyMinutes) || 60;
  const totalSeconds = studyMinutes * 60;
  const sessionId = params.sessionId ?? '';
  const outputSeconds = Number(params.outputSeconds) || 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';

  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();

  const [isRecording, setIsRecording] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const device = useCameraDevice(cameraFacing);
  const cameraRef = useRef<Camera>(null);

  const [zoom, setZoom] = useState(1);
  const startZoom = useSharedValue(1);
  const zoomSV = useSharedValue(1);
  const minZoomSV = useSharedValue(1);
  const maxZoomSV = useSharedValue(8);

  // device 변경 시 zoom 범위 리셋
  useEffect(() => {
    const min = device?.minZoom ?? 1;
    const max = device?.maxZoom ?? 8;
    minZoomSV.value = min;
    maxZoomSV.value = max;
    zoomSV.value = min;
    setZoom(min);
  }, [device]);

  // Camera는 class component라 createAnimatedComponent로 감싸면 ref 전달 안됨
  // → zoom은 JS state로 처리 (runOnJS로 업데이트)
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startZoom.value = zoomSV.value;
    })
    .onUpdate((e) => {
      const next = Math.min(Math.max(startZoom.value * e.scale, minZoomSV.value), maxZoomSV.value);
      zoomSV.value = next;
      runOnJS(setZoom)(next);
    });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoUriRef = useRef<string | null>(null);
  const isStoppingRef = useRef(false);
  const elapsedRef = useRef(0);
  const shouldNavigateRef = useRef(false);

  const remaining = Math.max(0, totalSeconds - elapsed);

  // Request camera + microphone permissions on mount
  useEffect(() => {
    const requestPerms = async () => {
      if (!hasCameraPermission) {
        await requestCameraPermission();
      }
      if (!hasMicPermission) {
        await requestMicPermission();
      }
    };
    requestPerms();
  }, [hasCameraPermission, hasMicPermission, requestCameraPermission, requestMicPermission]);

  // Timer interval
  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          elapsedRef.current = prev + 1;
          return prev + 1;
        });
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

  const startRecording = useCallback(() => {
    if (isRecording || !cameraRef.current || !device) return;
    setIsRecording(true);
    if (Platform.OS !== 'web') {
      cameraRef.current.startRecording({
        onRecordingFinished: (video) => {
          videoUriRef.current = video.path;
          if (!shouldNavigateRef.current) return;
          router.replace({
            pathname: '/generating',
            params: {
              videoUri: video.path,
              sessionId,
              outputSeconds: String(outputSeconds),
              recordingSeconds: String(elapsedRef.current),
              aspectRatio,
              studyMinutes: String(studyMinutes),
              timerMode,
              cameraFacing,
            },
          });
        },
        onRecordingError: (error) => {
          console.warn('[focus] recording error:', error);
        },
      });
    }
  }, [isRecording, device, router, sessionId, outputSeconds, aspectRatio, studyMinutes, timerMode, cameraFacing]);

  const handleStop = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    // Clear timer interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRecording(false);

    if (Platform.OS !== 'web') {
      shouldNavigateRef.current = true;
      await cameraRef.current?.stopRecording();
      // Navigation happens in onRecordingFinished callback
    } else {
      router.replace({
        pathname: '/generating',
        params: {
          videoUri: '',
          sessionId,
          outputSeconds: String(outputSeconds),
          recordingSeconds: String(elapsedRef.current),
          aspectRatio,
          studyMinutes: String(studyMinutes),
          timerMode,
          cameraFacing,
        },
      });
    }
  }, [router, sessionId, outputSeconds, aspectRatio, studyMinutes, timerMode, cameraFacing]);

  const handleExit = () => {
    setShowExitModal(true);
  };

  const confirmExit = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Stop recording if active (shouldNavigateRef stays false → no navigation from callback)
    if (Platform.OS !== 'web' && hasStarted) {
      cameraRef.current?.stopRecording();
    }
    setShowExitModal(false);
    router.canGoBack() ? router.back() : router.replace('/');
  };

  // Permissions not yet granted
  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View style={styles.permContainer}>
        <StatusBar barStyle="light-content" />
        <View style={styles.permIconWrap}>
          <Text style={styles.permIconText}>⊙</Text>
        </View>
        <Text style={styles.permTitle}>Camera & Microphone Access</Text>
        <Text style={styles.permText}>
          We need camera and microphone permission to record your focus session.
        </Text>
        <TouchableOpacity
          style={styles.permButton}
          onPress={async () => {
            await requestCameraPermission();
            await requestMicPermission();
          }}
        >
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permBackButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.permBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No camera device found
  if (!device) {
    return (
      <View style={styles.permContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.permTitle}>No Camera Device Found</Text>
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

      {/* Camera Preview
          - Camera 자체는 항상 sensor format(4:3 등)으로 녹화
          - Wrapper View를 원하는 비율로 crop해서 UI 표시
          - overflow:hidden 으로 센서 비율과 다른 부분 잘라냄
      */}
      <GestureDetector gesture={pinchGesture}>
      <View style={styles.cameraWrapper}>
        {/* 비율별 crop 컨테이너: 화면 중앙에 원하는 비율로 잘라서 표시 */}
        <View style={[styles.cropContainer, getCropStyle(aspectRatio)]}>
          {Platform.OS !== 'web' && device ? (
          <Camera
            ref={cameraRef}
            style={styles.camera}
            device={device}
            isActive={!showExitModal}
            video={true}
            audio={true}
            zoom={zoom}
            onInitialized={() => setCameraReady(true)}
          />
        ) : (
          <View style={[
            styles.camera,
          ]} />
          )}
        </View>
      </View>
      </GestureDetector>

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top: 뒤로가기(왼쪽) + 타이머 (오른쪽) */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Text style={styles.exitButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.timerContainer}>
            {hasStarted && isRecording && (
              <View style={styles.recIndicator}>
                <View style={styles.recDot} />
                <Text style={styles.recText}>REC</Text>
              </View>
            )}
            <Text style={styles.timerLabel}>
              {timerMode === 'countdown' ? 'REMAINING' : 'ELAPSED'}
            </Text>
            <Text style={styles.timerTime}>
              {timerMode === 'countdown' ? formatTime(remaining) : formatTime(elapsed)}
            </Text>
          </View>
        </View>

        {/* Camera Unavailable 표시 (웹) */}
        {!hasCameraPermission && (
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
                onPress={() => { setCameraFacing(f => f === 'front' ? 'back' : 'front'); setZoom(minZoom); lastZoomRef.current = minZoom; }}
                activeOpacity={0.7}
              >
                <Text style={styles.flipIcon}>⇄</Text>
              </TouchableOpacity>
            )}

            {/* 시작/일시정지 버튼 */}
            <TouchableOpacity
              style={styles.pauseButton}
              onPress={async () => {
                if (!hasStarted) {
                  setHasStarted(true);
                  startRecording();
                } else if (isRecording) {
                  if (Platform.OS !== 'web') {
                    await cameraRef.current?.pauseRecording();
                  }
                  setIsRecording(false);
                } else {
                  if (Platform.OS !== 'web') {
                    await cameraRef.current?.resumeRecording();
                  }
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
            {hasStarted && (
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStop}
                activeOpacity={0.7}
              >
                <View style={styles.stopIcon} />
              </TouchableOpacity>
            )}
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
  // 비율별 crop 컨테이너: overflow:hidden으로 sensor format 밖 영역 잘라냄
  cropContainer: {
    overflow: 'hidden',
    alignSelf: 'center',
  },
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
  recIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  recText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
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
