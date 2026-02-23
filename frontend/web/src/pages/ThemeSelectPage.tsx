import { useState } from 'react';
import type { OverlayTheme, OverlayConfig } from '../../../packages/shared/types';

interface ThemeSelectPageProps {
  onSelect: (config: OverlayConfig) => void;
  onBack: () => void;
}

const THEMES: { value: OverlayTheme; label: string; emoji: string; desc: string }[] = [
  { value: 'stopwatch', label: '디지털 초시계', emoji: '⏱️', desc: '00:00:00 형태의 디지털 타이머' },
  { value: 'analog-clock', label: '아날로그 시계', emoji: '⏰', desc: '초침이 돌아가는 원형 시계' },
  { value: 'progress-bar', label: '프로그레스 바', emoji: '📊', desc: '진행률 바가 채워지는 애니메이션' },
  { value: 'minimal', label: '미니멀 텍스트', emoji: '✏️', desc: '깔끔한 경과 시간 텍스트' },
  { value: 'none', label: '없음', emoji: '🚫', desc: '오버레이 없이 영상만' },
];

const POSITIONS = [
  { value: 'top-left' as const, label: '↖ 좌상단' },
  { value: 'top-right' as const, label: '↗ 우상단' },
  { value: 'bottom-left' as const, label: '↙ 좌하단' },
  { value: 'bottom-right' as const, label: '↘ 우하단' },
  { value: 'center' as const, label: '⊙ 중앙' },
];

const COLORS = [
  { value: '#ffffff', label: '흰색' },
  { value: '#00ff88', label: '그린' },
  { value: '#ff6b6b', label: '레드' },
  { value: '#4ecdc4', label: '민트' },
  { value: '#ffe66d', label: '옐로' },
  { value: '#a855f7', label: '퍼플' },
];

const SIZES = [
  { value: 'sm' as const, label: 'S' },
  { value: 'md' as const, label: 'M' },
  { value: 'lg' as const, label: 'L' },
];

export function ThemeSelectPage({ onSelect, onBack }: ThemeSelectPageProps) {
  const [theme, setTheme] = useState<OverlayTheme>('stopwatch');
  const [position, setPosition] = useState<OverlayConfig['position']>('bottom-right');
  const [color, setColor] = useState('#ffffff');
  const [size, setSize] = useState<OverlayConfig['size']>('md');

  const handleConfirm = () => {
    onSelect({ theme, position, color, size });
  };

  return (
    <div className="page theme-select-page">
      <h1>🎨 오버레이 선택</h1>
      <p>타임랩스에 표시할 시간 테마를 선택하세요</p>

      <section>
        <h2>테마</h2>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.value}
              className={`theme-card ${theme === t.value ? 'active' : ''}`}
              onClick={() => setTheme(t.value)}
            >
              <span className="theme-emoji">{t.emoji}</span>
              <span className="theme-label">{t.label}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {theme !== 'none' && (
        <>
          <section>
            <h2>위치</h2>
            <div className="output-options">
              {POSITIONS.map((p) => (
                <button
                  key={p.value}
                  className={position === p.value ? 'active' : ''}
                  onClick={() => setPosition(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>색상</h2>
            <div className="color-options">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`color-swatch ${color === c.value ? 'active' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          </section>

          <section>
            <h2>크기</h2>
            <div className="output-options">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  className={size === s.value ? 'active' : ''}
                  onClick={() => setSize(s.value)}
                >
                  {s.value.toUpperCase()}
                </button>
              ))}
            </div>
          </section>
        </>
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
