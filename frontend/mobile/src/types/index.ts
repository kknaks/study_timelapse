export interface User {
  id: string;
  streak: number;
  longest_streak: number;
  total_focus_time: number;
  subscription_status: 'free' | 'trial' | 'pro';
}

export interface Session {
  id: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  output_seconds: number;
  aspect_ratio: string;
  overlay_style: string;
  status: string;
}

export interface CreateSessionRequest {
  output_seconds: number;
  aspect_ratio: string;
  overlay_style: string;
}

export interface WeeklyStats {
  week_start: string;
  week_end: string;
  total_seconds: number;
  session_count: number;
  daily: Array<{ date: string; total_seconds: number; session_count: number }>;
}
