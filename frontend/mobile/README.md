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
