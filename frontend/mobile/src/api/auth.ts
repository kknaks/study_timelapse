import { apiClient } from './client';

export interface GoogleLoginPayload {
  id_token: string;
  terms_agreed: boolean;
  privacy_agreed: boolean;
  timezone: string;
}

export const loginWithGoogle = (payload: GoogleLoginPayload) =>
  apiClient.post<{
    success: boolean;
    data: {
      tokens: { access_token: string; refresh_token: string };
      user: { id: string; provider: string; email: string | null; name: string | null; is_new: boolean };
    };
  }>('/api/auth/google', payload);

export const refreshToken = (refreshToken: string) =>
  apiClient.post<{
    success: boolean;
    data: { access_token: string; refresh_token: string };
  }>('/api/auth/refresh', { refresh_token: refreshToken });
