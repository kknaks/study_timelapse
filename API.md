# API 명세서 — Study Timelapse

프론트엔드 ↔ 백엔드 통신 API 정의.

> Base URL: `http://localhost:8000`

---

## 플로우 요약

```
[프론트엔드]                         [백엔드]
    │                                    │
    │  1. POST /api/upload               │
    │  ─────── 영상 파일 ──────────────→  │  파일 저장
    │  ←───── { fileId, filename } ────  │
    │                                    │
    │  2. POST /api/timelapse            │
    │  ─────── { fileId, outputSeconds } →│  FFmpeg 변환 시작
    │  ←───── { taskId } ───────────────  │
    │                                    │
    │  3. GET /api/timelapse/:taskId     │
    │  ─────── (폴링, 2초 간격) ────────→  │  진행률 반환
    │  ←───── { status, progress } ────  │
    │                                    │
    │  4. GET /api/download/:taskId      │
    │  ─────── (변환 완료 후) ───────────→  │  MP4 파일 반환
    │  ←───── video/mp4 ───────────────  │
```

---

## 1. 영상 업로드

### `POST /api/upload`

녹화된 영상 파일을 서버에 업로드합니다.

**Request**

| 항목 | 값 |
|------|---|
| Content-Type | `multipart/form-data` |
| Body | `file`: 영상 파일 (webm, mov, mp4) |

```
POST /api/upload
Content-Type: multipart/form-data

file: recording.webm (binary)
```

**지원 입력 포맷**

| 플랫폼 | 확장자 | 코덱 | MIME Type |
|--------|--------|------|-----------|
| 웹 (Chrome) | `.webm` | VP9 | `video/webm` |
| 웹 (Safari) | `.mp4` | H.264 | `video/mp4` |
| iOS (React Native) | `.mov` | H.264 | `video/quicktime` |
| Android (React Native) | `.mp4` | H.264 | `video/mp4` |

> 백엔드는 확장자/MIME 기반으로 입력 포맷을 판별하되, FFmpeg가 자동 디코딩하므로 별도 분기 처리 없이 동일 파이프라인으로 처리 가능. 출력은 항상 **MP4 (H.264)**로 통일.

**Response — 200 OK**

```json
{
  "fileId": "abc123-def456",
  "filename": "recording.webm"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `fileId` | string | 업로드된 파일의 고유 ID (UUID) |
| `filename` | string | 저장된 파일명 |

**에러 응답**

| 상태 코드 | 설명 |
|----------|------|
| 400 | 파일 누락 또는 지원하지 않는 형식 (webm, mp4, mov만 허용) |
| 413 | 파일 크기 초과 |
| 500 | 서버 저장 오류 |

---

## 2. 타임랩스 변환 요청

### `POST /api/timelapse`

업로드된 영상을 타임랩스로 변환하는 작업을 시작합니다.

**Request**

```json
{
  "fileId": "abc123-def456",
  "outputSeconds": 60
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `fileId` | string | O | 업로드 API에서 받은 파일 ID |
| `outputSeconds` | number | O | 목표 출력 시간 (30, 60, 90초) |

**Response — 202 Accepted**

```json
{
  "taskId": "task-789xyz"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `taskId` | string | 변환 작업 ID (상태 조회에 사용) |

**에러 응답**

| 상태 코드 | 설명 |
|----------|------|
| 400 | 잘못된 요청 (fileId 누락, 잘못된 outputSeconds) |
| 404 | fileId에 해당하는 파일 없음 |
| 500 | 변환 시작 실패 |

**비즈니스 규칙**
- `outputSeconds`는 30, 60, 90 중 하나
- 배속 = 원본 길이 / outputSeconds (자동 계산)
- 변환은 비동기 처리 (FFmpeg 백그라운드 실행)

---

## 3. 변환 상태 조회

### `GET /api/timelapse/:taskId`

변환 작업의 진행 상태를 조회합니다. 프론트엔드가 **2초 간격으로 폴링**합니다.

**Request**

```
GET /api/timelapse/task-789xyz
```

**Response — 200 OK**

```json
{
  "taskId": "task-789xyz",
  "status": "processing",
  "progress": 45,
  "downloadUrl": null
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `taskId` | string | 작업 ID |
| `status` | string | `"processing"` \| `"completed"` \| `"failed"` |
| `progress` | number | 진행률 (0~100) |
| `downloadUrl` | string \| null | 완료 시 다운로드 URL, 미완료 시 null |

**status 값**

| 값 | 설명 |
|---|------|
| `processing` | 변환 진행 중 |
| `completed` | 변환 완료 (downloadUrl 포함) |
| `failed` | 변환 실패 |

**변환 완료 시 응답 예시**

```json
{
  "taskId": "task-789xyz",
  "status": "completed",
  "progress": 100,
  "downloadUrl": "/api/download/task-789xyz"
}
```

**에러 응답**

| 상태 코드 | 설명 |
|----------|------|
| 404 | taskId에 해당하는 작업 없음 |

---

## 4. 타임랩스 다운로드

### `GET /api/download/:taskId`

완성된 타임랩스 영상을 다운로드합니다.

**Request**

```
GET /api/download/task-789xyz
```

**Response — 200 OK**

| 항목 | 값 |
|------|---|
| Content-Type | `video/mp4` |
| Content-Disposition | `attachment; filename="timelapse.mp4"` |
| Body | MP4 바이너리 |

**에러 응답**

| 상태 코드 | 설명 |
|----------|------|
| 404 | taskId에 해당하는 파일 없음 또는 변환 미완료 |

---

## 타입 정의 (TypeScript)

백엔드 구현 시 참고할 타입 정의입니다.

```typescript
// 업로드 응답
interface UploadResponse {
  fileId: string;
  filename: string;
}

// 타임랩스 요청
interface TimelapseRequest {
  fileId: string;
  outputSeconds: number;  // 30 | 60 | 90
}

// 타임랩스 상태 응답
interface TimelapseStatusResponse {
  taskId: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;       // 0~100
  downloadUrl?: string;   // completed일 때만
}
```

---

## 제약 조건

| 항목 | 값 |
|------|---|
| 최대 업로드 파일 크기 | TBD (권장: 500MB~2GB) |
| 영상 포맷 (입력) | WebM (VP9), MP4 (H.264), MOV (H.264) |
| 영상 포맷 (출력) | MP4 (H.264) |
| 최소 공부 시간 | 60초 (1분) |
| 최대 공부 시간 | 43,200초 (12시간) |
| 출력 옵션 | 30초, 60초, 90초 |
| 폴링 간격 | 2초 |

---

## CORS

프론트엔드 개발 시 `http://localhost:5173` (Vite 기본 포트)에서 접근합니다.

```python
# FastAPI 예시
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
