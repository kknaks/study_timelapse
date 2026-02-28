import { apiClient } from './client';
import type { Session, CreateSessionRequest } from '../types';

export const getSessions = () => apiClient.get<Session[]>('/api/sessions');

export const createSession = (data: CreateSessionRequest) =>
  apiClient.post<Session>('/api/sessions', data);
