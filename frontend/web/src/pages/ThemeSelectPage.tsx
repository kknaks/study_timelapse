import { useState, useRef, useEffect, useCallback } from 'react';
import type { OverlayTheme, OverlayConfig, OverlayPosition } from '../../../packages/shared/types';
import { OverlayRenderer } from '../utils/overlayRenderer';

interface ThemeSelectPageProps {
  videoBlob: Blob;
  recordingSeconds: number;
  outputSeconds: number;
  onSelect: (config: OverlayConfig) => void;
  onBack: () => void;
}

const THEMES: { value: OverlayTheme; emoji: string; label: string }[] = [
  { value: 'stopwatch', emoji: '⏱️', label: '초시계' },
  { value: 'analog-clock', emoji: '⏰', label: '시계' },
  { value: 'progress-bar', emoji: '📊', label: '진행바' },
  { value: 'minimal', emoji: '✏️', label: '미니멀' },
  { value: 'none', emoji: '🚫', label: '없음' },
];

const COLORS = ['#ffffff', '#00ff88', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a855f7'];
const SIZES: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];

export function ThemeSelectPage({
  videoBlob,
  recordingSeconds,
  outputSeconds,
  onSelect,
  onBack,
}: ThemeSelectPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const rendererRef = useRef<OverlayRenderer | null>(null);

  const [theme, setTheme] = useState<OverlayTheme>('stopwatch');
  const [position, setPosition] = useState<OverlayPosition>({ x: 0.8, y: 0.85 });
  const [color, setColor] = useState('#ffffff');
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [isDragging, setIsDragging] = useState(false);
  const [videoUrl] = useState(() => URL.createObjectURL(videoBlob));

  // 렌더러 업데이트
  useEffect(() => {
    const config: OverlayConfig = { theme, position, color, size };
    rendererRef.current = new OverlayRenderer(config, recordingSeconds, outputSeconds);
    if (videoRef.current) {
      rendererRef.current.setVideoDuration(videoRef.current.duration || 1);
    }
  }, [theme, position, color, size, recordingSeconds, outputSeconds]);

  // Canvas 프리뷰 렌더 루프
  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;

    if (!video || !canvas || !renderer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (theme !== 'none') {
      // 미리보기용 시간 (전체의 30% 지점)
      const previewTime = (video.currentTime || 0) || (video.duration || 1) * 0.3;
      renderer.render(ctx, canvas.width, canvas.height, previewTime);
    }

    animFrameRef.current = requestAnimationFrame(renderFrame);
  }, [theme]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [renderFrame]);

  // 클린업
  useEffect(() => {
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  // 드래그/탭으로 위치 설정
  const updatePosition = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setPosition({ x, y });
  };

  // 마우스 이벤트
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updatePosition(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    updatePosition(e.clientX, e.clientY);
  };

  const handleMouseUp = () => setIsDragging(false);

  // 터치 이벤트
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    updatePosition(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    updatePosition(touch.clientX, touch.clientY);
  };

  const handleConfirm = () => {
    onSelect({ theme, position, color, size });
  };

  return (
    <div className="page theme-select-page">
      <h1>🎨 오버레이 선택</h1>

      {/* 비디오 프리뷰 + 오버레이 */}
      <div
        ref={containerRef}
        className="theme-preview-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        style={{ cursor: theme !== 'none' ? 'crosshair' : 'default' }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          loop
          muted
          autoPlay
          playsInline
          className="theme-preview-video"
        />
        <canvas
          ref={canvasRef}
          className="theme-preview-canvas"
        />
        {theme !== 'none' && (
          <div
            className="position-indicator"
            style={{
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
            }}
          />
        )}
      </div>

      {theme !== 'none' && (
        <p className="drag-hint">👆 영상을 탭/드래그해서 위치를 조정하세요</p>
      )}

      {/* 테마 선택 — 좌우 스크롤 */}
      <div className="theme-scroll">
        {THEMES.map((t) => (
          <button
            key={t.value}
            className={`theme-icon ${theme === t.value ? 'active' : ''}`}
            onClick={() => setTheme(t.value)}
          >
            <span className="theme-icon-emoji">{t.emoji}</span>
            <span className="theme-icon-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* 색상 + 크기 (테마 선택 시만) */}
      {theme !== 'none' && (
        <div className="theme-options">
          <div className="color-options">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-dot ${color === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="size-options">
            {SIZES.map((s) => (
              <button
                key={s}
                className={`size-btn ${size === s ? 'active' : ''}`}
                onClick={() => setSize(s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="controls">
        <button onClick={onBack}>뒤로</button>
        <button onClick={handleConfirm} className="start-button">
          확인
        </button>
      </div>
    </div>
  );
}
