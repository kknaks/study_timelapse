import { apiClient } from './client';

export interface MockPurchaseResponse {
  success: boolean;
  idempotent: boolean;
  subscription_status: string;
}

export interface SubscriptionVerifyRequest {
  app_user_id: string;
  transaction_id: string;
  product_identifier: string;
}

export interface SubscriptionStatusResponse {
  subscription_status: string;
  pro_until: string | null;
  is_pro: boolean;
  grace_until: string | null;
  idempotent?: boolean;
}

export const mockPurchase = (plan: 'monthly') =>
  apiClient.post<{ data: MockPurchaseResponse }>('/api/subscription/mock-purchase', { plan });

export const verifySubscription = (data: SubscriptionVerifyRequest) =>
  apiClient.post<{ data: SubscriptionStatusResponse }>('/api/subscription/verify', data);

export const syncSubscription = () =>
  apiClient.post<{ data: SubscriptionStatusResponse }>('/api/subscription/sync');
