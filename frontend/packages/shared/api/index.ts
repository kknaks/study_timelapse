// ============================================
// Study Timelapse - API 클라이언트
// Web / Mobile 공통 (fetch 기반)
// ============================================

import { API_BASE_URL, API_ENDPOINTS } from '../constants';
import type {
  UploadResponse,
  TimelapseRequest,
  TimelapseStatusResponse,
  TimelapseSaveRequest,
} from '../types';

/**
 * 영상 업로드
 * @param file - 녹화된 영상 (Blob 또는 FormData)
 * @param onProgress - 업로드 진행률 콜백 (0~100)
 */
export async function uploadVideo(
  file: Blob,
  onProgress?: (percentage: number) => void,
): Promise<UploadResponse> {
  const formData = new FormData();
  const ext = file.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('file', file, `recording.${ext}`);

  // XMLHttpRequest로 진행률 추적 (fetch는 upload progress 미지원)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('POST', `${API_BASE_URL}${API_ENDPOINTS.UPLOAD}`);
    xhr.send(formData);
  });
}

/**
 * 타임랩스 변환 요청
 */
export async function requestTimelapse(
  request: TimelapseRequest,
): Promise<{ taskId: string }> {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.TIMELAPSE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Timelapse request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * 타임랩스 변환 상태 조회
 */
export async function getTimelapseStatus(
  taskId: string,
): Promise<TimelapseStatusResponse> {
  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.TIMELAPSE_STATUS(taskId)}`,
  );

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * 타임랩스 다운로드 URL 생성
 */
export function getDownloadUrl(taskId: string): string {
  return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD(taskId)}`;
}

/**
 * 변환 완료까지 폴링
 * @param taskId - 작업 ID
 * @param onProgress - 진행률 콜백
 * @param intervalMs - 폴링 간격 (기본 2초)
 */
export async function pollUntilComplete(
  taskId: string,
  onProgress?: (percentage: number) => void,
  intervalMs: number = 2000,
): Promise<TimelapseStatusResponse> {
  while (true) {
    const status = await getTimelapseStatus(taskId);

    if (onProgress) {
      onProgress(status.progress);
    }

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * 타임랩스 최종 저장 (테마 메타데이터)
 */
export async function saveTimelapse(
  request: TimelapseSaveRequest,
): Promise<{ success: boolean }> {
  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.TIMELAPSE_SAVE(request.taskId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    throw new Error(`Save failed: ${response.status}`);
  }

  return response.json();
}

/**
 * 합성된 영상 업로드 (Canvas에서 녹화한 최종 영상)
 */
export async function uploadComposited(
  taskId: string,
  blob: Blob,
  onProgress?: (percentage: number) => void,
): Promise<{ success: boolean }> {
  const formData = new FormData();
  formData.append('file', blob, 'composited.mp4');
  formData.append('taskId', taskId);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('POST', `${API_BASE_URL}${API_ENDPOINTS.TIMELAPSE_SAVE(taskId)}`);
    xhr.send(formData);
  });
}
