import { useState } from 'react';
import type { TimerConfig, OverlayConfig } from '../../packages/shared/types';
import { setApiBaseUrl } from '../../packages/shared/constants';
import { SetupPage } from './pages/SetupPage';

// .env에서 API URL 로드
if (import.meta.env.VITE_API_BASE_URL) {
  setApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

import { RecordingPage } from './pages/RecordingPage';
import { ThemeSelectPage } from './pages/ThemeSelectPage';
import { ConversionPage } from './pages/ConversionPage';
import { CompletePage } from './pages/CompletePage';
import './index.css';

type AppStep = 'setup' | 'recording' | 'themeSelect' | 'conversion' | 'complete';

export default function App() {
  const [step, setStep] = useState<AppStep>('setup');
  const [config, setConfig] = useState<TimerConfig | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');

  const handleStart = (timerConfig: TimerConfig) => {
    setConfig(timerConfig);
    setStep('recording');
  };

  const handleRecordingComplete = (blob: Blob, elapsedSeconds: number) => {
    setVideoBlob(blob);
    setRecordingSeconds(elapsedSeconds);
    setStep('themeSelect');
  };

  const handleThemeSelect = (config: OverlayConfig) => {
    setOverlayConfig(config);
    setStep('conversion');
  };

  const handleThemeBack = () => {
    // 녹화 다시 하기
    setVideoBlob(null);
    setRecordingSeconds(0);
    setStep('recording');
  };

  const handleConversionComplete = (url: string) => {
    setDownloadUrl(url);
    setStep('complete');
  };

  const handleRetry = () => {
    setConfig(null);
    setVideoBlob(null);
    setRecordingSeconds(0);
    setOverlayConfig(null);
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
      {step === 'themeSelect' && videoBlob && config && (
        <ThemeSelectPage
          videoBlob={videoBlob}
          recordingSeconds={recordingSeconds}
          outputSeconds={config.outputSeconds}
          onSelect={handleThemeSelect}
          onBack={handleThemeBack}
        />
      )}
      {step === 'conversion' && videoBlob && config && (
        <ConversionPage
          videoBlob={videoBlob}
          outputSeconds={config.outputSeconds}
          recordingSeconds={recordingSeconds}
          aspectRatio={config.aspectRatio}
          overlayConfig={overlayConfig}
          onComplete={handleConversionComplete}
        />
      )}
      {step === 'complete' && (
        <CompletePage
          downloadUrl={downloadUrl}
          overlayConfig={overlayConfig}
          recordingSeconds={recordingSeconds}
          outputSeconds={config?.outputSeconds ?? 60}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
