import { useState } from 'react';
import type { TimerConfig } from '../../packages/shared/types';
import { SetupPage } from './pages/SetupPage';
import { RecordingPage } from './pages/RecordingPage';
import { ConversionPage } from './pages/ConversionPage';
import { CompletePage } from './pages/CompletePage';
import './index.css';

type AppStep = 'setup' | 'recording' | 'conversion' | 'complete';

export default function App() {
  const [step, setStep] = useState<AppStep>('setup');
  const [config, setConfig] = useState<TimerConfig | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');

  const handleStart = (timerConfig: TimerConfig) => {
    setConfig(timerConfig);
    setStep('recording');
  };

  const handleRecordingComplete = (blob: Blob) => {
    setVideoBlob(blob);
    setStep('conversion');
  };

  const handleConversionComplete = (url: string) => {
    setDownloadUrl(url);
    setStep('complete');
  };

  const handleRetry = () => {
    setConfig(null);
    setVideoBlob(null);
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
