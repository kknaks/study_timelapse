export type SubscriptionStatus = 'free' | 'trial' | 'pro' | 'expired' | 'cancelled';
export type BannerAlert = 'trial_expiring_24h' | 'trial_expiring_1h' | null;

export function isActivePlan(status: SubscriptionStatus): boolean {
  return status === 'trial' || status === 'pro';
}

export function isFreeEquivalent(status: SubscriptionStatus): boolean {
  return status === 'free' || status === 'expired' || status === 'cancelled';
}
