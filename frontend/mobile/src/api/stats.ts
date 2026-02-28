import { apiClient } from './client';
import type { WeeklyStats } from '../types';

export const getWeeklyStats = () => apiClient.get<WeeklyStats>('/api/stats/weekly');

export const getDailyStats = () => apiClient.get('/api/stats/daily');
