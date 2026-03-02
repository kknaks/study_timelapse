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

export const uploadPhotos = async (photoUris: string[]) => {
  const formData = new FormData();
  photoUris.forEach((uri, i) => {
    formData.append('files', {
      uri,
      name: `frame_${String(i).padStart(4, '0')}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob);
  });
  return apiClient.post<{ fileIds: string[]; count: number }>(
    '/api/upload-photos',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2분
    },
  );
};

export const requestTimelapseFromPhotos = (data: {
  fileIds: string[];
  outputSeconds: number;
  aspectRatio: string;
}) => apiClient.post<{ taskId: string }>('/api/timelapse-from-photos', data);
