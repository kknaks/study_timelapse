import { apiClient } from './client';
import type { User } from '../types';

export const getMe = () => apiClient.get<User>('/api/users/me');
