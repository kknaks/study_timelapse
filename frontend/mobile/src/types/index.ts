import type { SubscriptionStatus, BannerAlert } from './subscription';

export interface User {
  id: string;
  name?: string;
  streak: number;
  longest_streak: number;
  total_focus_time: number;
  // V1 fields (deprecated — use subscription_status instead)
  subscription_status: SubscriptionStatus;
  /** @deprecated Use subscription_status */
  is_pro: boolean;
  // V2 fields
  trial_start_date: string | null;
  pro_until: string | null;
  grace_until: string | null;
  timezone: string | null;
  terms_agreed_at: string | null;
  privacy_agreed_at: string | null;
  daily_session_count: number;
  daily_quota: number | null;
  daily_quota_resets_at: string | null;
  banner_alert: BannerAlert;
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
  start_time: string;
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

