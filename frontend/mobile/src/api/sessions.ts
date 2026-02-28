import { apiClient } from './client';
import type { Session, CreateSessionRequest } from '../types';

export const getSessions = () => apiClient.get<Session[]>('/api/sessions');

export const createSession = (data: CreateSessionRequest) =>
  apiClient.post<Session>('/api/sessions', data);

export const updateSession = (id: string, data: Partial<Session>) =>
  apiClient.put<Session>(`/api/sessions/${id}`, data);
