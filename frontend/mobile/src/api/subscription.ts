import { apiClient } from './client';

export interface MockPurchaseResponse {
  success: boolean;
  idempotent: boolean;
  subscription_status: string;
}

export const mockPurchase = (plan: 'monthly') =>
  apiClient.post<{ data: MockPurchaseResponse }>('/api/subscription/mock-purchase', { plan });
