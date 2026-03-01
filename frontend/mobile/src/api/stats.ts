import { apiClient } from './client';
import type { WeeklyStats } from '../types';

export const getWeeklyStats = () => apiClient.get<WeeklyStats>('/api/stats/weekly');

export const getDailyStats = (startDate?: string, endDate?: string) =>
  apiClient.get('/api/stats/daily', { params: { start_date: startDate, end_date: endDate } });
