import { useState, useEffect, useRef, useCallback } from 'react';
import type { TimerConfig, TimerStatus } from '../../../packages/shared/types';
import { formatTime } from '../../../packages/shared/utils';
import { FrameCapture } from '../utils/frameCapture';

const ASPECT_CSS: Record<string, string> = {
  '9:16': '9 / 16',
  '1:1': '1 / 1',
  '4:5': '4 / 5',
  '16:9': '16 / 9',
};

interface RecordingPageProps {
  config: TimerConfig;
  onComplete: (frameCapture: FrameCapture, elapsedSeconds: number) => void;
}

export function RecordingPage({ config, onComplete }: RecordingPageProps) {
  const [timerStatus, setTimerStatus] = useState<TimerStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const frameCaptureRef = useRef<FrameCapture | null>(null);
  const frameCountInterval = useRef<number | null>(null);

  const remaining = Math.max(0, config.durationSeconds - elapsed);

  // 카메라 프리뷰
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 1280, height: 720 },
          audio: false,
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        alert('카메라 접근 권한이 필요합니다');
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (frameCountInterval.current) clearInterval(frameCountInterval.current);
    };
  }, []);

  // 녹화 시작 (프레임 캡처 방식)
  const handleStart = () => {
    const video = videoRef.current;
    if (!video) return;

    const fc = new FrameCapture({
      durationSeconds: config.durationSeconds,
      outputSeconds: config.outputSeconds,
    });
    fc.start(video);
    frameCaptureRef.current = fc;

    // 프레임 카운트 UI 업데이트
    frameCountInterval.current = window.setInterval(() => {
      setFrameCount(fc.frameCount);
    }, 500);

    setTimerStatus('running');
  };

  // 타이머
  useEffect(() => {
    if (timerStatus !== 'running') return;

    intervalRef.current = window.setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        elapsedRef.current = next;
        if (next >= config.durationSeconds) {
          handleStop();
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerStatus, config.durationSeconds]);

  const handleStop = useCallback(async () => {
    setTimerStatus('completed');
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (frameCountInterval.current) clearInterval(frameCountInterval.current);

    const fc = frameCaptureRef.current;
    if (fc) {
      await fc.stop(); // OPFS flush 대기
      console.log(`⏱️ 녹화 종료: ${elapsedRef.current}초, ${fc.frameCount}프레임 캡처 (${fc.storageMode})`);
      onComplete(fc, elapsedRef.current);
    }
  }, [onComplete]);

  const handlePause = () => {
    if (timerStatus === 'running') {
      setTimerStatus('paused');
      frameCaptureRef.current?.pause();
    } else if (timerStatus === 'paused') {
      setTimerStatus('running');
      frameCaptureRef.current?.resume();
    }
  };

  return (
    <div className="page recording-page">
      <h1>
        {timerStatus === 'idle' && '📷 준비'}
        {timerStatus === 'running' && '🔴 공부 중'}
        {timerStatus === 'paused' && '⏸️ 일시정지'}
        {timerStatus === 'completed' && '✅ 완료'}
      </h1>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="camera-preview"
        style={{ aspectRatio: ASPECT_CSS[config.aspectRatio] }}
      />

      <div className="timer-display">
        <div>
          <span className="label">경과 시간</span>
          <span className="time">{formatTime(elapsed)}</span>
        </div>
        <div>
          <span className="label">남은 시간</span>
          <span className="time">{formatTime(remaining)}</span>
        </div>
      </div>

      {timerStatus !== 'idle' && (
        <>
          <p className="frame-count">📸 {frameCount}프레임 캡처됨</p>
          <p className="warning">⚠️ 탭을 전환하면 캡처가 중단될 수 있습니다</p>
        </>
      )}

      <div className="controls">
        {timerStatus === 'idle' ? (
          <button onClick={handleStart} className="start-button">
            🔴 녹화 시작
          </button>
        ) : (
          <>
            <button onClick={handlePause} disabled={timerStatus === 'completed'}>
              {timerStatus === 'paused' ? '재개' : '일시정지'}
            </button>
            <button onClick={handleStop} disabled={timerStatus === 'completed'}>
              종료
            </button>
          </>
        )}
      </div>
    </div>
  );
}
