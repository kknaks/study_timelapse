/**
 * Unit tests for useSubscription trialDaysRemaining logic.
 * Phase 1: trial_start_date set → D-7 from trial_start_date
 * Phase 2 new user: trial_start_date NULL + subscription_status='trial' → D from pro_until
 */

// Mock dependencies to isolate pure logic (ESM native modules can't run in node env)
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../src/api/user', () => ({ getMe: jest.fn() }));
jest.mock('../src/api/client', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { trialDaysRemaining } from '../src/hooks/useSubscription';

const MS_DAY = 24 * 60 * 60 * 1000;

describe('trialDaysRemaining', () => {
  // Phase 1 — trial_start_date set
  describe('Phase 1 (trial_start_date set)', () => {
    it('returns 7 when trial started just now', () => {
      const now = new Date().toISOString();
      const result = trialDaysRemaining(now, 'trial', null);
      expect(result).toBe(7);
    });

    it('returns 4 when 3 days have passed since trial start', () => {
      const start = new Date(Date.now() - 3 * MS_DAY).toISOString();
      const result = trialDaysRemaining(start, 'trial', null);
      expect(result).toBe(4);
    });

    it('returns 0 when trial_start_date is more than 7 days ago', () => {
      const start = new Date(Date.now() - 8 * MS_DAY).toISOString();
      const result = trialDaysRemaining(start, 'trial', null);
      expect(result).toBe(0);
    });

    it('ignores pro_until when trial_start_date is set (Phase 1 takes priority)', () => {
      const start = new Date(Date.now() - 3 * MS_DAY).toISOString();
      const farFutureProUntil = new Date(Date.now() + 30 * MS_DAY).toISOString();
      const result = trialDaysRemaining(start, 'trial', farFutureProUntil);
      // Should use trial_start_date + 7d, not pro_until
      expect(result).toBe(4);
    });
  });

  // Phase 2 — trial_start_date NULL, uses pro_until
  describe('Phase 2 new user (trial_start_date NULL, subscription_status=trial)', () => {
    it('returns days until pro_until when status=trial and pro_until is set', () => {
      const proUntil = new Date(Date.now() + 5 * MS_DAY).toISOString();
      const result = trialDaysRemaining(null, 'trial', proUntil);
      expect(result).toBe(5);
    });

    it('returns 0 when pro_until is in the past', () => {
      const proUntil = new Date(Date.now() - MS_DAY).toISOString();
      const result = trialDaysRemaining(null, 'trial', proUntil);
      expect(result).toBe(0);
    });

    it('returns 0 when status is not trial (free user with pro_until)', () => {
      const proUntil = new Date(Date.now() + 5 * MS_DAY).toISOString();
      const result = trialDaysRemaining(null, 'free', proUntil);
      expect(result).toBe(0);
    });

    it('returns 0 when status=trial but pro_until is null', () => {
      const result = trialDaysRemaining(null, 'trial', null);
      expect(result).toBe(0);
    });
  });

  // Null / no trial
  describe('no trial case', () => {
    it('returns 0 when both trial_start_date and pro_until are null', () => {
      expect(trialDaysRemaining(null, 'free', null)).toBe(0);
    });

    it('returns 0 when status=pro and trial_start_date is null', () => {
      const proUntil = new Date(Date.now() + 30 * MS_DAY).toISOString();
      expect(trialDaysRemaining(null, 'pro', proUntil)).toBe(0);
    });
  });

  // TrialExpiringBanner Phase 2 scenario
  describe('TrialExpiringBanner Phase 2 new user gets correct remaining days', () => {
    it('shows D-1 for RevenueCat trial expiring tomorrow', () => {
      const proUntil = new Date(Date.now() + MS_DAY).toISOString();
      const result = trialDaysRemaining(null, 'trial', proUntil);
      expect(result).toBe(1);
    });

    it('shows D-7 at trial start via RevenueCat', () => {
      const proUntil = new Date(Date.now() + 7 * MS_DAY).toISOString();
      const result = trialDaysRemaining(null, 'trial', proUntil);
      expect(result).toBe(7);
    });
  });
});
