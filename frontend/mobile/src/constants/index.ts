export const COLORS = {
  background: '#F5F3EF',    // 따뜻한 오프화이트
  surface: '#FFFFFF',
  primary: '#5B8DEF',       // 뮤트 블루
  primaryLight: '#EEF3FD',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  accent: '#FF6B35',        // 스트릭 오렌지
  border: '#E5E7EB',
  success: '#10B981',
};

export const ASPECT_RATIOS = ['9:16', '1:1', '16:9'] as const;
export const OUTPUT_SECONDS = [30, 60, 90] as const;
export const OVERLAY_STYLES = ['stopwatch', 'progress-bar', 'minimal', 'none'] as const;
