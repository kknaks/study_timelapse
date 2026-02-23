import { useState } from 'react';
import type { TimerConfig, AspectRatio } from '../../../packages/shared/types';
import {
  OUTPUT_DURATION_OPTIONS,
  DEFAULT_OUTPUT_SECONDS,
  MIN_STUDY_SECONDS,
  MAX_STUDY_SECONDS,
} from '../../../packages/shared/constants';
import { toSeconds } from '../../../packages/shared/utils';

interface SetupPageProps {
  onStart: (config: TimerConfig) => void;
}

export function SetupPage({ onStart }: SetupPageProps) {
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [outputSeconds, setOutputSeconds] = useState(DEFAULT_OUTPUT_SECONDS);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');

  const totalSeconds = toSeconds(hours, minutes);
  const isValid = totalSeconds >= MIN_STUDY_SECONDS && totalSeconds <= MAX_STUDY_SECONDS;

  const handleStart = () => {
    if (!isValid) return;
    onStart({ durationSeconds: totalSeconds, outputSeconds, aspectRatio });
  };

  return (
    <div className="page setup-page">
      <h1>Study Timelapse</h1>
      <p>공부 시간을 타임랩스로 기록하세요</p>

      <section>
        <h2>공부 시간 설정</h2>
        <div className="time-inputs">
          <label>
            <input
              type="number"
              min={0}
              max={12}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
            시간
          </label>
          <label>
            <input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
            분
          </label>
        </div>
      </section>

      <section>
        <h2>타임랩스 길이</h2>
        <div className="output-options">
          {OUTPUT_DURATION_OPTIONS.map((sec) => (
            <button
              key={sec}
              className={outputSeconds === sec ? 'active' : ''}
              onClick={() => setOutputSeconds(sec)}
            >
              {sec}초
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>영상 비율</h2>
        <div className="output-options">
          {(['9:16', '1:1', '4:5', '16:9'] as AspectRatio[]).map((ratio) => (
            <button
              key={ratio}
              className={aspectRatio === ratio ? 'active' : ''}
              onClick={() => setAspectRatio(ratio)}
            >
              {ratio}
              {ratio === '9:16' && ' 릴스'}
              {ratio === '1:1' && ' 피드'}
              {ratio === '4:5' && ' 피드'}
              {ratio === '16:9' && ' 원본'}
            </button>
          ))}
        </div>
      </section>

      <button
        className="start-button"
        disabled={!isValid}
        onClick={handleStart}
      >
        시작
      </button>
    </div>
  );
}
