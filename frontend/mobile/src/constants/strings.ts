// English-only strings. Multi-locale removed (2026-05-07 policy decision).

export const s = {
  paywall: {
    title: 'Go Pro',
    subtitle: 'Unlimited · No Watermark · Progress Bar',
    featureDaily_free: '1 / day',
    featureDaily_pro: 'Unlimited',
    featureWatermark_free: 'Always on',
    featureWatermark_pro: 'Removed',
    featureProgressBar_free: 'Hidden',
    featureProgressBar_pro: 'Available',
    featurePrice_free: 'Free',
    featurePrice_pro: '$1.99 / mo',
    featureTrial: '7-day free trial · Applied immediately',
    ctaSubscribe: 'Subscribe Pro · $1.99 / mo',
    subscribed: 'Subscribed!',
    alreadySubscribed: 'Already subscribed',
    invalidPlan: 'Invalid plan',
    termsNotAgreed: 'Please agree to terms first',
    loginRequired: 'Login required to purchase',
  },
  trial: {
    badge: (days: number) => `Trial: ${days}d left`,
    expiring24h: 'Your trial ends in 24 hours',
    expiring1h: 'Your trial ends in 1 hour',
    upgradeNow: 'Subscribe Pro',
  },
  quota: {
    exceeded: (resetsAt: string) =>
      `Daily limit reached.\nResets at midnight (${resetsAt}).\nUpgrade to Pro for unlimited sessions.`,
    exceededTitle: 'Daily Limit Reached',
    upgradeButton: 'Subscribe Pro',
    dismissButton: 'Close',
  },
};

export const ls = {
  termsLabel: 'Agree to Terms of Service (required)',
  privacyLabel: 'Agree to Privacy Policy (required)',
  viewLink: 'View',
  validationMessage: 'You must agree to the Terms and Privacy Policy to sign up.',
  termsScreenTitle: 'Terms of Service',
  privacyScreenTitle: 'Privacy Policy',
  refundScreenTitle: 'Refund Policy',
  draftBanner: 'Draft — Pending Legal Review',
};
