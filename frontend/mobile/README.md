# Study Timelapse — Mobile (Phase 2)

React Native (Expo) 모바일 앱.

## 세팅 (Phase 2에서 진행)

```bash
npx create-expo-app@latest . --template blank-typescript
```

## 공유 코드

`@shared/*`에서 import:

```tsx
import type { TimerConfig } from '@shared/types';
import { formatTime } from '@shared/utils';
import { createTranslator } from '@shared/i18n';
```

## 모바일 전용 기능

- F9: expo-camera 네이티브 녹화
- F10: expo-sharing 소셜 공유
- F11: 계정/로그인
- F12: 공부 통계 대시보드

---

## 프레임 저장 전략

### 문제

녹화 중 프레임을 메모리(RAM)에 저장하면 모바일에서 OOM(Out of Memory) 크래시 발생.

- 1280x720 JPEG (quality 0.85) ≈ 80~120KB/장
- 1시간 녹화, 2초 간격 = 1,800프레임 → **약 180MB**
- 모바일 앱 메모리 제한: ~200~400MB → 💀 터짐

### 플랫폼별 전략

| | Web | Mobile (React Native) |
|---|---|---|
| **저장소** | OPFS (Origin Private File System) | `expo-file-system` cacheDirectory |
| **폴백** | 메모리 Blob[] (OPFS 미지원 시) | 없음 (파일시스템 항상 가능) |
| **쓰기** | FileSystemWritableFileStream | `FileSystem.writeAsStringAsync` (base64) |
| **읽기** | `FileHandle.getFile()` → Blob | `FileSystem.readAsStringAsync` (base64) |
| **정리** | `removeEntry({ recursive: true })` | `FileSystem.deleteAsync` |

### 모바일 구현 가이드

```typescript
import * as FileSystem from 'expo-file-system';

// 세션별 캐시 디렉토리
const sessionDir = `${FileSystem.cacheDirectory}frames/session_${Date.now()}/`;
await FileSystem.makeDirectoryAsync(sessionDir, { intermediates: true });

// 프레임 저장 (캡처 시)
const framePath = `${sessionDir}frame_${String(index).padStart(6, '0')}.jpg`;
await FileSystem.writeAsStringAsync(framePath, base64Data, {
  encoding: FileSystem.EncodingType.Base64,
});

// 프레임 읽기 (타임랩스 생성 시)
const base64 = await FileSystem.readAsStringAsync(framePath, {
  encoding: FileSystem.EncodingType.Base64,
});

// 세션 정리 (완료 후)
await FileSystem.deleteAsync(sessionDir, { idempotent: true });
```

### 메모리 vs 디스크 비교

```
1시간 녹화 (2초 간격, 1800프레임):
  RAM 방식: ~180MB 메모리 점유 → 모바일 OOM 위험
  디스크 방식: ~180MB 캐시 → RAM은 버퍼 10프레임 = ~1MB만 사용
```

### 주의사항

- **RAM 버퍼**: 10프레임 단위로 모아서 디스크에 flush (I/O 최소화)
- **캡처 중 앱 백그라운드**: iOS는 백그라운드에서 카메라 접근 불가 → 일시정지 필요
- **캐시 용량**: iOS는 시스템이 캐시를 자동 정리할 수 있음 → 녹화 완료 후 즉시 타임랩스 생성 권장
- **expo-camera snapshot**: `takePictureAsync({ base64: true, quality: 0.85 })` 로 직접 JPEG 캡처 가능 (Canvas 불필요)
- **타임랩스 파라미터**: `packages/shared`의 `calcTimelapseParams` 로직 공유 (3케이스 시스템)
