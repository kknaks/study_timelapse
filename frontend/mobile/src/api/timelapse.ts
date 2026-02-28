import { apiClient } from './client';
import type { TimelapseStatus, UploadResponse } from '../types';

export const uploadVideo = async (fileUri: string, mimeType: string) => {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'recording.mp4',
    type: mimeType,
  } as unknown as Blob);

  return apiClient.post<UploadResponse>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 minutes for large files
  });
};

export const requestTimelapse = (data: {
  fileId: string;
  outputSeconds: number;
  recordingSeconds: number;
  aspectRatio: string;
}) => apiClient.post<{ taskId: string }>('/api/timelapse', data);

export const getTimelapseStatus = (taskId: string) =>
  apiClient.get<TimelapseStatus>(`/api/timelapse/${taskId}`);
