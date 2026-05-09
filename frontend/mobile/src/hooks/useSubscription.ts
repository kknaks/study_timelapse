import { useQuery } from '@tanstack/react-query';
import { getMe } from '../api/user';
import { isActivePlan, isFreeEquivalent } from '../types/subscription';
import type { User } from '../types';
import type { SubscriptionStatus } from '../types/subscription';

function unwrapUser(res: unknown): User | null {
  if (!res) return null;
  const r = res as { data?: User } | User;
  return ('data' in r && r.data ? r.data : r) as User;
}

function trialDaysRemaining(trialStartDate: string | null): number {
  if (!trialStartDate) return 0;
  const start = new Date(trialStartDate).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

export function useSubscription() {
  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
  });

  const user = unwrapUser(rawData);
  const status: SubscriptionStatus = user?.subscription_status ?? 'free';
  const active = isActivePlan(status);
  const freeEquiv = isFreeEquivalent(status);

  const graceUntil: string | null = user?.grace_until ?? null;
  const isGracePeriod = graceUntil ? new Date(graceUntil) > new Date() : false;
  const graceUntilApproaching =
    graceUntil
      ? new Date(graceUntil).getTime() - Date.now() < 24 * 60 * 60 * 1000 && isGracePeriod
      : false;

  return {
    user,
    isLoading,
    refetch,
    status,
    isActive: active,
    isFreeEquivalent: freeEquiv,
    showWatermark: freeEquiv,
    showProgressBar: active,
    dailyQuota: user?.daily_quota ?? 1,
    dailySessionCount: user?.daily_session_count ?? 0,
    dailyQuotaResetsAt: user?.daily_quota_resets_at ?? null,
    bannerAlert: user?.banner_alert ?? null,
    trialDaysRemaining: trialDaysRemaining(user?.trial_start_date ?? null),
    graceUntil,
    isGracePeriod,
    graceUntilApproaching,
  };
}
