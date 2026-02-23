import type { OverlayConfig } from '../../../packages/shared/types';

/**
 * Canvas에 오버레이를 그리는 렌더러
 */
export class OverlayRenderer {
  private config: OverlayConfig;
  private totalSeconds: number;
  private outputSeconds: number;

  private videoDuration: number = 0;

  constructor(config: OverlayConfig, totalSeconds: number, outputSeconds: number) {
    this.config = config;
    this.totalSeconds = totalSeconds;
    this.outputSeconds = outputSeconds;
  }

  /** 실제 타임랩스 영상 길이 설정 (video.duration) */
  setVideoDuration(duration: number) {
    this.videoDuration = duration;
  }

  /** 현재 프레임의 경과 시간(초) 기준으로 오버레이 렌더 */
  render(ctx: CanvasRenderingContext2D, width: number, height: number, currentTime: number) {
    const { theme } = this.config;

    // 타임랩스 재생 시간 → 원본 녹화 시간으로 매핑
    // currentTime(0~videoDuration) → originalSeconds(0~totalSeconds)
    const duration = this.videoDuration > 0 ? this.videoDuration : this.outputSeconds;
    const ratio = duration > 0 ? currentTime / duration : 0;
    const originalSeconds = ratio * this.totalSeconds;

    switch (theme) {
      case 'stopwatch':
        this.renderStopwatch(ctx, width, height, originalSeconds);
        break;
      case 'analog-clock':
        this.renderAnalogClock(ctx, width, height, originalSeconds);
        break;
      case 'progress-bar':
        this.renderProgressBar(ctx, width, height, originalSeconds);
        break;
      case 'minimal':
        this.renderMinimal(ctx, width, height, originalSeconds);
        break;
      case 'none':
        break;
    }
  }

  private getPosition(width: number, height: number, elemW: number, elemH: number) {
    const margin = 20;
    const { position } = this.config;

    switch (position) {
      case 'top-left':
        return { x: margin, y: margin + elemH };
      case 'top-right':
        return { x: width - elemW - margin, y: margin + elemH };
      case 'bottom-left':
        return { x: margin, y: height - margin };
      case 'bottom-right':
        return { x: width - elemW - margin, y: height - margin };
      case 'center':
        return { x: (width - elemW) / 2, y: (height + elemH) / 2 };
      default:
        return { x: margin, y: height - margin };
    }
  }

  private getFontSize(): number {
    switch (this.config.size) {
      case 'sm': return 24;
      case 'md': return 36;
      case 'lg': return 52;
    }
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /** ⏱️ 디지털 초시계 */
  private renderStopwatch(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
    const fontSize = this.getFontSize();
    const text = this.formatTime(seconds);
    ctx.font = `bold ${fontSize}px "JetBrains Mono", "Fira Code", monospace`;

    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const pos = this.getPosition(w, h, textW + 20, fontSize + 10);

    // 배경 박스
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const boxPad = 8;
    ctx.beginPath();
    ctx.roundRect(pos.x - boxPad, pos.y - fontSize - boxPad, textW + boxPad * 2, fontSize + boxPad * 2, 8);
    ctx.fill();

    // 텍스트
    ctx.fillStyle = this.config.color;
    ctx.fillText(text, pos.x, pos.y);
  }

  /** ⏰ 아날로그 시계 */
  private renderAnalogClock(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
    const radius = this.getFontSize() * 1.2;
    const pos = this.getPosition(w, h, radius * 2, radius * 2);
    const cx = pos.x + radius;
    const cy = pos.y - radius;

    // 배경 원
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // 테두리
    ctx.strokeStyle = this.config.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
    ctx.stroke();

    // 눈금 (12개)
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI * 2) / 12 - Math.PI / 2;
      const inner = radius * 0.75;
      const outer = radius * 0.9;
      ctx.strokeStyle = this.config.color;
      ctx.lineWidth = i % 3 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }

    const hours = seconds / 3600;
    const minutes = (seconds % 3600) / 60;
    const secs = seconds % 60;

    // 시침
    const hourAngle = ((hours % 12) / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = this.config.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hourAngle) * radius * 0.45, cy + Math.sin(hourAngle) * radius * 0.45);
    ctx.stroke();

    // 분침
    const minAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(minAngle) * radius * 0.65, cy + Math.sin(minAngle) * radius * 0.65);
    ctx.stroke();

    // 초침
    const secAngle = (secs / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(secAngle) * radius * 0.75, cy + Math.sin(secAngle) * radius * 0.75);
    ctx.stroke();

    // 중심점
    ctx.fillStyle = this.config.color;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 📊 프로그레스 바 */
  private renderProgressBar(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
    const fontSize = this.getFontSize() * 0.6;
    const barHeight = fontSize * 0.6;
    const barWidth = Math.min(w * 0.4, 200);
    const duration = this.videoDuration > 0 ? this.videoDuration : this.outputSeconds;
    const progress = duration > 0 ? Math.min(seconds / this.totalSeconds, 1) : 0;

    const pos = this.getPosition(w, h, barWidth, barHeight + fontSize + 10);

    // 퍼센트 텍스트
    const pctText = `${Math.floor(progress * 100)}%`;
    ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = this.config.color;
    ctx.fillText(pctText, pos.x, pos.y - barHeight - 8);

    // 시간 텍스트
    const timeText = this.formatTime(seconds);
    const timeWidth = ctx.measureText(timeText).width;
    ctx.fillText(timeText, pos.x + barWidth - timeWidth, pos.y - barHeight - 8);

    // 바 배경
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y - barHeight, barWidth, barHeight, 4);
    ctx.fill();

    // 바 채우기
    ctx.fillStyle = this.config.color;
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y - barHeight, barWidth * progress, barHeight, 4);
    ctx.fill();
  }

  /** ✏️ 미니멀 텍스트 */
  private renderMinimal(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
    const fontSize = this.getFontSize();
    const text = this.formatTime(seconds);
    ctx.font = `300 ${fontSize}px "Inter", "Helvetica", sans-serif`;

    const metrics = ctx.measureText(text);
    const pos = this.getPosition(w, h, metrics.width, fontSize);

    // 그림자
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = this.config.color;
    ctx.fillText(text, pos.x, pos.y);

    // 그림자 초기화
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}
