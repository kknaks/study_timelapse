import { apiClient } from './client';

export const loginWithGoogle = (idToken: string) =>
  apiClient.post<{
    success: boolean;
    data: {
      tokens: { access_token: string; refresh_token: string };
      user: { id: string; provider: string; email: string | null; name: string | null; is_new: boolean };
    };
  }>('/api/auth/google', { id_token: idToken });

export const refreshToken = (refreshToken: string) =>
  apiClient.post<{
    success: boolean;
    data: { access_token: string; refresh_token: string };
  }>('/api/auth/refresh', { refresh_token: refreshToken });
