import { useState } from 'react';
import type { TimerConfig } from '../../packages/shared/types';
import { setApiBaseUrl } from '../../packages/shared/constants';
import { SetupPage } from './pages/SetupPage';

// .env에서 API URL 로드
if (import.meta.env.VITE_API_BASE_URL) {
  setApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

import { RecordingPage } from './pages/RecordingPage';
import { ConversionPage } from './pages/ConversionPage';
import { CompletePage } from './pages/CompletePage';
import './index.css';

type AppStep = 'setup' | 'recording' | 'conversion' | 'complete';

export default function App() {
  const [step, setStep] = useState<AppStep>('setup');
  const [config, setConfig] = useState<TimerConfig | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [downloadUrl, setDownloadUrl] = useState<string>('');

  const handleStart = (timerConfig: TimerConfig) => {
    setConfig(timerConfig);
    setStep('recording');
  };

  const handleRecordingComplete = (blob: Blob, elapsedSeconds: number) => {
    setVideoBlob(blob);
    setRecordingSeconds(elapsedSeconds);
    setStep('conversion');
  };

  const handleConversionComplete = (url: string) => {
    setDownloadUrl(url);
    setStep('complete');
  };

  const handleRetry = () => {
    setConfig(null);
    setVideoBlob(null);
    setRecordingSeconds(0);
    setDownloadUrl('');
    setStep('setup');
  };

  return (
    <div className="app">
      {step === 'setup' && (
        <SetupPage onStart={handleStart} />
      )}
      {step === 'recording' && config && (
        <RecordingPage
          config={config}
          onComplete={handleRecordingComplete}
        />
      )}
      {step === 'conversion' && videoBlob && config && (
        <ConversionPage
          videoBlob={videoBlob}
          outputSeconds={config.outputSeconds}
          recordingSeconds={recordingSeconds}
          aspectRatio={config.aspectRatio}
          onComplete={handleConversionComplete}
        />
      )}
      {step === 'complete' && (
        <CompletePage
          downloadUrl={downloadUrl}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
