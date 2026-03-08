import { apiClient } from './client';
import type { User } from '../types';

export const getMe = () => apiClient.get<User>('/api/users/me');

export const updateProfile = (name: string) =>
  apiClient.put<{ success: boolean; data: { name: string } }>('/api/users/me/profile', { name });
