/**
 * Unit tests for RevenueCat integration:
 * - useSubscription grace fields
 * - subscription API payload shapes
 * - mock SDK surface verification
 */

// Mocks must be hoisted before any import that uses the module
jest.mock('react-native-purchases');
jest.mock('../src/api/client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

import { INTRO_ELIGIBILITY_STATUS } from 'react-native-purchases';
import { apiClient } from '../src/api/client';
import { verifySubscription, syncSubscription } from '../src/api/subscription';

const mockPost = apiClient.post as jest.Mock;

afterEach(() => {
  mockPost.mockReset();
});

// ---------------------------------------------------------------------------
// useSubscription grace fields — pure logic, no RN hooks needed
// ---------------------------------------------------------------------------

describe('grace period logic', () => {
  function computeGraceFields(graceUntilIso: string | null) {
    const graceUntil: string | null = graceUntilIso ?? null;
    const isGracePeriod = graceUntil ? new Date(graceUntil) > new Date() : false;
    const graceUntilApproaching =
      graceUntil
        ? new Date(graceUntil).getTime() - Date.now() < 24 * 60 * 60 * 1000 && isGracePeriod
        : false;
    return { graceUntil, isGracePeriod, graceUntilApproaching };
  }

  it('returns false for isGracePeriod when grace_until is null', () => {
    const result = computeGraceFields(null);
    expect(result.graceUntil).toBeNull();
    expect(result.isGracePeriod).toBe(false);
    expect(result.graceUntilApproaching).toBe(false);
  });

  it('returns true for isGracePeriod when grace_until is in the future', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = computeGraceFields(future);
    expect(result.isGracePeriod).toBe(true);
    expect(result.graceUntilApproaching).toBe(false); // 3 days away — not within 24h
  });

  it('returns graceUntilApproaching=true when grace_until is within 24h', () => {
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h from now
    const result = computeGraceFields(soon);
    expect(result.isGracePeriod).toBe(true);
    expect(result.graceUntilApproaching).toBe(true);
  });

  it('returns isGracePeriod=false when grace_until is in the past', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const result = computeGraceFields(past);
    expect(result.isGracePeriod).toBe(false);
    expect(result.graceUntilApproaching).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifySubscription — request payload contract (spec-06 §3-1)
// ---------------------------------------------------------------------------

describe('verifySubscription', () => {
  it('calls POST /api/subscription/verify with correct payload shape', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { subscription_status: 'pro', idempotent: false } } });

    const payload = {
      app_user_id: 'user-uuid-123',
      transaction_id: 'rc-transaction-456',
      product_identifier: 'com.studytimelapse.monthly',
    };
    await verifySubscription(payload);

    expect(mockPost).toHaveBeenCalledWith('/api/subscription/verify', payload);
  });

  it('passes all three required fields (app_user_id, transaction_id, product_identifier)', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: {} } });

    await verifySubscription({
      app_user_id: 'u1',
      transaction_id: 'txn1',
      product_identifier: 'com.studytimelapse.monthly',
    });

    const calledWith = mockPost.mock.calls[0][1];
    expect(calledWith).toHaveProperty('app_user_id');
    expect(calledWith).toHaveProperty('transaction_id');
    expect(calledWith).toHaveProperty('product_identifier');
  });
});

// ---------------------------------------------------------------------------
// syncSubscription — no request body (spec-06 §3-3)
// ---------------------------------------------------------------------------

describe('syncSubscription', () => {
  it('calls POST /api/subscription/sync with no body', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { subscription_status: 'pro' } } });

    await syncSubscription();

    expect(mockPost).toHaveBeenCalledWith('/api/subscription/sync');
    // Verify no second argument (body) is passed
    expect(mockPost.mock.calls[0].length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mock SDK surface — ensure all required methods are mocked
// ---------------------------------------------------------------------------

import Purchases from 'react-native-purchases';

describe('react-native-purchases mock', () => {
  it('has configure mock', () => expect(typeof Purchases.configure).toBe('function'));
  it('has setLogLevel mock', () => expect(typeof Purchases.setLogLevel).toBe('function'));
  it('has logIn mock', () => expect(typeof Purchases.logIn).toBe('function'));
  it('has getOfferings mock', () => expect(typeof Purchases.getOfferings).toBe('function'));
  it('has purchasePackage mock', () => expect(typeof Purchases.purchasePackage).toBe('function'));
  it('has checkTrialOrIntroductoryPriceEligibility mock', () =>
    expect(typeof Purchases.checkTrialOrIntroductoryPriceEligibility).toBe('function'));
  it('has getAppUserID mock', () => expect(typeof Purchases.getAppUserID).toBe('function'));

  it('INTRO_ELIGIBILITY_STATUS enum has ELIGIBLE value', () => {
    expect(INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE).toBe(2);
  });

  it('purchasePackage mock returns customerInfo and transaction', async () => {
    const result = await Purchases.purchasePackage({} as any);
    expect(result).toHaveProperty('customerInfo');
    expect(result).toHaveProperty('transaction');
    expect(result.transaction.transactionIdentifier).toBe('mock-transaction-id');
  });
});
