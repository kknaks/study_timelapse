import { useState, useEffect, useRef, useCallback } from 'react';
import type { TimerConfig, TimerStatus } from '../../../packages/shared/types';
import { formatTime } from '../../../packages/shared/utils';

const ASPECT_CSS: Record<string, string> = {
  '9:16': '9 / 16',
  '1:1': '1 / 1',
  '4:5': '4 / 5',
  '16:9': '16 / 9',
};

interface RecordingPageProps {
  config: TimerConfig;
  onComplete: (blob: Blob, elapsedSeconds: number) => void;
}

export function RecordingPage({ config, onComplete }: RecordingPageProps) {
  const [timerStatus, setTimerStatus] = useState<TimerStatus>('running');
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const remaining = Math.max(0, config.durationSeconds - elapsed);

  // 카메라 시작 + 녹화
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        // 웹캠은 가로(16:9)로 녹화, 백엔드에서 인스타 비율로 크롭/리사이즈
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 1280, height: 720 },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        if (!MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
          alert('이 브라우저는 MP4 녹화를 지원하지 않습니다.\nChrome 최신 버전을 사용해주세요.');
          return;
        }

        const mimeType = 'video/mp4;codecs=avc1';
        console.log(`📹 녹화 포맷: ${mimeType}`);

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 2_500_000,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.start(1000); // 1초마다 chunk
        mediaRecorderRef.current = recorder;
      } catch {
        alert('카메라 접근 권한이 필요합니다');
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

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

  const handleStop = useCallback(() => {
    setTimerStatus('completed');
    if (intervalRef.current) clearInterval(intervalRef.current);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        onComplete(blob, elapsedRef.current);
      };
    }
  }, [onComplete]);

  const handlePause = () => {
    if (timerStatus === 'running') {
      setTimerStatus('paused');
      mediaRecorderRef.current?.pause();
    } else if (timerStatus === 'paused') {
      setTimerStatus('running');
      mediaRecorderRef.current?.resume();
    }
  };

  return (
    <div className="page recording-page">
      <h1>공부 중</h1>

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

      <p className="warning">⚠️ 탭을 전환하면 녹화가 중단될 수 있습니다</p>

      <div className="controls">
        <button onClick={handlePause} disabled={timerStatus === 'completed'}>
          {timerStatus === 'paused' ? '재개' : '일시정지'}
        </button>
        <button onClick={handleStop} disabled={timerStatus === 'completed'}>
          종료
        </button>
      </div>
    </div>
  );
}
