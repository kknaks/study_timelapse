import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  Platform,
  AppState,
  AppStateStatus,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { useSharedValue as useWSharedValue } from 'react-native-worklets-core';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system/legacy';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { COLORS } from '../src/constants';
import { formatTimerDisplay } from '../src/utils/timeFormat';
import { CAPTURE_TUNING } from '../src/constants/captureTuning';
import { estimateOutputSec } from '../src/utils/captureSchedule';
import TimelapseCreatorModule from '../modules/timelapse-creator/src/TimelapseCreatorModule';

const captureTimelapseFramePlugin = VisionCameraProxy.initFrameProcessorPlugin('captureTimelapseFrame');

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

const formatTime = formatTimerDisplay;

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
  const goalSec = studyMinutes * 60;
  const sessionId = params.sessionId ?? '';
  const outputSeconds = Number(params.outputSeconds) || 60;
  const aspectRatio = params.aspectRatio ?? '9:16';
  const timerMode = params.timerMode ?? 'countdown';

  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();

  const [isRecording, setIsRecording] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const device = useCameraDevice(cameraFacing);
  const cameraRef = useRef<Camera>(null);

  const [zoom, setZoom] = useState(1);
  const startZoom = useSharedValue(1);
  const zoomSV = useSharedValue(1);
  const minZoomSV = useSharedValue(1);
  const maxZoomSV = useSharedValue(8);

  // worklets-core shared values for frame processor (worklet thread reads these)
  const elapsedSecSV = useWSharedValue(0);
  const isPausedSV = useWSharedValue(false);
  const captureDirSV = useWSharedValue('');
  const goalSecSV = useWSharedValue(goalSec);
  const outputSecSV = useWSharedValue(outputSeconds);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const isStoppingRef = useRef(false);
  const isPausedForModalRef = useRef(false);

  useEffect(() => {
    const min = device?.minZoom ?? 1;
    const max = device?.maxZoom ?? 8;
    minZoomSV.value = min;
    maxZoomSV.value = max;
    zoomSV.value = min;
    setZoom(min);
    setCameraReady(false);
  }, [device]);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => { startZoom.value = zoomSV.value; })
    .onUpdate((e) => {
      const next = Math.min(Math.max(startZoom.value * e.scale, minZoomSV.value), maxZoomSV.value);
      zoomSV.value = next;
      runOnJS(setZoom)(next);
    });

  const remaining = Math.max(0, goalSec - elapsed);

  // Request camera permission on mount (사용자 액션 후 호출, 이미 permission 있으면 skip)
  useEffect(() => {
    if (!hasCameraPermission) {
      requestCameraPermission();
    }
  }, [hasCameraPermission, requestCameraPermission]);

  // Timer interval
  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          elapsedRef.current = prev + 1;
          elapsedSecSV.value = prev + 1;
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
    if (elapsed >= goalSec && isRecording) {
      handleStop(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, goalSec, isRecording]);

  // AppState: background/inactive → auto-pause + notify (adr-06, spec-01 E1)
  useEffect(() => {
    if (!hasStarted) return;
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if ((nextState === 'background' || nextState === 'inactive') && isRecording) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        isPausedSV.value = true;
        setIsRecording(false);
        if (Platform.OS !== 'web') {
          try { await TimelapseCreatorModule.pauseCapture(); } catch {}
        }
        Alert.alert('Recording Paused', 'Focus session paused because the app went to the background.');
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, isRecording]);

  // adr-06: 녹화 중 화면 자동 잠금 방지 (idle timer 비활성). 정지/언마운트 시 deactivate.
  useEffect(() => {
    if (isRecording) {
      activateKeepAwakeAsync('focus-recording');
      return () => {
        deactivateKeepAwake('focus-recording');
      };
    }
  }, [isRecording]);

  useEffect(() => { goalSecSV.value = goalSec; }, [goalSec]);
  useEffect(() => { outputSecSV.value = outputSeconds; }, [outputSeconds]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (captureTimelapseFramePlugin == null) return;
    if (captureDirSV.value === '') return;
    captureTimelapseFramePlugin.call(frame, {
      elapsedSec: elapsedSecSV.value,
      goalSec: goalSecSV.value,
      outputSec: outputSecSV.value,
      outputFps: 30,
      captureDir: captureDirSV.value,
      isPaused: isPausedSV.value,
    });
  }, []);

  const startCapture = useCallback(async () => {
    if (isRecording || !cameraReady) return;
    setIsRecording(true);
    if (Platform.OS !== 'web') {
      const baseDir = `${FileSystem.documentDirectory ?? ''}sessions/${sessionId}/`;
      try {
        await TimelapseCreatorModule.startCapture({
          sessionId,
          goalSec,
          outputSec: outputSeconds,
          outputFps: CAPTURE_TUNING.outputFps,
          cameraFacing,
          baseDir,
        });
        captureDirSV.value = `${baseDir}captures`;
        isPausedSV.value = false;
      } catch (e) {
        console.warn('[focus] startCapture error:', e);
        setIsRecording(false);
      }
    }
  }, [isRecording, cameraReady, sessionId, goalSec, outputSeconds, cameraFacing]);

  // 정지 버튼 탭: 10초 미만 가드 + stop modal 표시 (캡처 일시정지)
  const handleStopPress = useCallback(async () => {
    if (elapsedRef.current < CAPTURE_TUNING.minRecordingSec) {
      Alert.alert('Too Short', '최소 10초 이상 녹화해주세요.');
      return;
    }
    // 모달 표시 전 캡처 일시정지 (D-SPEC-1-2)
    isPausedForModalRef.current = true;
    isPausedSV.value = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (Platform.OS !== 'web') {
      try { await TimelapseCreatorModule.pauseCapture(); } catch {}
    }
    setShowStopModal(true);
  }, []);

  // 정지 확정
  const handleStop = useCallback(async (auto = false) => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    setShowStopModal(false);
    setIsRecording(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (Platform.OS !== 'web') {
      try {
        const result = await TimelapseCreatorModule.stopCapture();
        router.replace({
          pathname: '/generating',
          params: {
            captureDir: result.captureDir,
            sessionId,
            outputSeconds: String(outputSeconds),
            recordingSeconds: String(result.elapsedSec),
            goalSec: String(goalSec),
            aspectRatio,
            studyMinutes: String(studyMinutes),
            timerMode,
            cameraFacing,
          },
        });
      } catch (e) {
        console.warn('[focus] stopCapture error:', e);
        isStoppingRef.current = false;
      }
    } else {
      router.replace({
        pathname: '/generating',
        params: {
          captureDir: '',
          sessionId,
          outputSeconds: String(outputSeconds),
          recordingSeconds: String(elapsedRef.current),
          goalSec: String(goalSec),
          aspectRatio,
          studyMinutes: String(studyMinutes),
          timerMode,
          cameraFacing,
        },
      });
    }
  }, [router, sessionId, outputSeconds, goalSec, aspectRatio, studyMinutes, timerMode, cameraFacing]);

  // 정지 모달 "계속" → resume
  const handleStopCancel = useCallback(async () => {
    setShowStopModal(false);
    isPausedForModalRef.current = false;
    isPausedSV.value = false;
    if (Platform.OS !== 'web') {
      try { await TimelapseCreatorModule.resumeCapture(); } catch {}
    }
    setIsRecording(true);
  }, []);

  const handleExit = () => { setShowExitModal(true); };

  const confirmExit = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (Platform.OS !== 'web' && hasStarted) {
      try { await TimelapseCreatorModule.stopCapture(); } catch {}
    }
    setShowExitModal(false);
    router.canGoBack() ? router.back() : router.replace('/');
  };

  // 예상 결과 영상 길이 (정지 모달 / 인디케이터용)
  const estimatedOutputSec = estimateOutputSec(elapsed, goalSec, outputSeconds);

  if (!hasCameraPermission) {
    return (
      <View style={styles.permContainer}>
        <StatusBar barStyle="light-content" />
        <View style={styles.permIconWrap}>
          <Text style={styles.permIconText}>⊙</Text>
        </View>
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permText}>
          We need camera access to record your focus session.
        </Text>
        <TouchableOpacity
          style={styles.permButton}
          onPress={requestCameraPermission}
        >
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permBackButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.permBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <GestureDetector gesture={pinchGesture}>
        <View style={styles.cameraWrapper}>
          <View style={[styles.cropContainer, getCropStyle(aspectRatio)]}>
            {Platform.OS !== 'web' && device ? (
              <Camera
                ref={cameraRef}
                style={styles.camera}
                device={device}
                isActive={!showExitModal && !showStopModal}
                video={true}
                audio={false}
                zoom={zoom}
                outputOrientation="preview"
                onInitialized={() => setCameraReady(true)}
                frameProcessor={frameProcessor}
              />
            ) : (
              <View style={styles.camera} />
            )}
          </View>
        </View>
      </GestureDetector>

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top row */}
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

        {/* 인디케이터: 결과 영상 예상 길이 (adr-07) */}
        {hasStarted && elapsed > 0 && (
          <View style={styles.indicatorRow}>
            <Text style={styles.indicatorText}>
              정지 시 결과 영상 약 {Math.round(estimatedOutputSec)}초
            </Text>
          </View>
        )}

        {/* Bottom row */}
        <View style={styles.bottomRow}>
          <Text style={styles.sessionActiveLabel}>
            {!hasStarted ? 'READY TO RECORD' : isRecording ? 'FOCUS SESSION ACTIVE' : 'PAUSED'}
          </Text>
          <View style={styles.controls}>
            {!hasStarted && Platform.OS !== 'web' && (
              <TouchableOpacity
                style={styles.flipButton}
                onPress={() => { setCameraFacing(f => f === 'front' ? 'back' : 'front'); }}
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
                  await startCapture();
                } else if (isRecording) {
                  isPausedSV.value = true;
                  if (Platform.OS !== 'web') {
                    try { await TimelapseCreatorModule.pauseCapture(); } catch {}
                  }
                  if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                  }
                  setIsRecording(false);
                } else {
                  isPausedSV.value = false;
                  if (Platform.OS !== 'web') {
                    try { await TimelapseCreatorModule.resumeCapture(); } catch {}
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
                onPress={handleStopPress}
                activeOpacity={0.7}
              >
                <View style={styles.stopIcon} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* 정지 확인 모달 (adr-07) */}
      <Modal visible={showStopModal} transparent animationType="slide" onRequestClose={handleStopCancel}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={handleStopCancel}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>녹화를 종료할까요?</Text>
            <Text style={styles.modalText}>
              목표 {studyMinutes}분 중 {Math.floor(elapsed / 60)}분 진행.{'\n'}
              결과 영상 약 {Math.round(estimatedOutputSec)}초.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={handleStopCancel}
              >
                <Text style={styles.modalBtnCancelText}>계속</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => handleStop(false)}
              >
                <Text style={styles.modalBtnConfirmText}>정지</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 나가기 확인 모달 */}
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
  container: { flex: 1, backgroundColor: '#000' },
  cameraWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  cropContainer: { overflow: 'hidden', alignSelf: 'center' },
  camera: { width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  timerContainer: { alignItems: 'flex-start' },
  recIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  recText: { color: '#FF3B30', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  timerLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  timerTime: { color: '#FFF', fontSize: 52, fontWeight: '700', letterSpacing: 1 },
  exitButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  exitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  indicatorRow: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  indicatorText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  bottomRow: { alignItems: 'center', paddingBottom: 60, gap: 20 },
  sessionActiveLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', letterSpacing: 1.5 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  flipButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  flipIcon: { fontSize: 22, color: '#FFF', fontWeight: '600' },
  pauseButton: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  pauseIconWrap: { flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  pauseBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: '#FFF' },
  playIcon: {
    width: 0, height: 0,
    borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 16,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#FFF',
    marginLeft: 3,
  },
  stopButton: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },
  stopIcon: { width: 26, height: 26, borderRadius: 4, backgroundColor: '#1a1a1a' },
  permContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 },
  permIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2.5, borderColor: '#FFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  permIconText: { fontSize: 32, color: '#FFF' },
  permTitle: { color: '#FFF', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  permText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  permButton: { backgroundColor: COLORS.primary, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14, marginBottom: 16 },
  permButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  permBackButton: { paddingVertical: 12 },
  permBackText: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 16,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#F5F5F5' },
  modalBtnCancelText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: '#FF3B30' },
  modalBtnConfirmText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
