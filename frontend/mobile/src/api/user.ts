import { apiClient } from './client';
import type { User } from '../types';

export const getMe = () => apiClient.get<User>('/api/users/me');

export const updateProfile = (name: string) =>
  apiClient.put<{ success: boolean; data: { name: string } }>('/api/users/me/profile', { name });

export const agreeToTerms = () =>
  apiClient.put<{ success: boolean }>('/api/users/me/terms-agree', {
    terms_agreed: true,
    privacy_agreed: true,
  });
