# Mobile Frontend — Study Timelapse

## 기술 스택

- React Native 0.83, Expo 55, Expo Router, TypeScript 5.9

## 디렉토리 구조

```
frontend/mobile/
├── app/              # Expo Router 스크린 (파일 기반 라우팅)
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── session-setup.tsx
│   ├── focus.tsx
│   ├── saving.tsx
│   ├── result.tsx
│   └── stats.tsx
├── modules/
│   └── timelapse-creator/   # Expo 네이티브 모듈 (AVAssetWriter / MediaCodec)
├── src/
│   ├── api/          # API 클라이언트 (axios)
│   ├── components/   # 공통 컴포넌트
│   ├── constants/    # 상수 (COLORS 등)
│   └── types/        # TypeScript 타입 정의
└── assets/           # 이미지, 폰트
```

## 명령어

```bash
# 개발서버
cd frontend/mobile && npm start

# iOS
cd frontend/mobile && npm run ios

# Android
cd frontend/mobile && npm run android

# EAS 빌드
eas build --platform [ios|android] --profile [development|preview|production]
```

## 코딩 컨벤션

- **네비게이션**: Expo Router — 파일 기반 라우팅, `app/` 디렉토리
- **상태 관리**: React Query (`@tanstack/react-query`) + useState
- **API 클라이언트**: axios (`src/api/client.ts`), baseURL = `EXPO_PUBLIC_API_BASE_URL`
- **스타일**: `StyleSheet.create()`
- **색상**: `src/constants/index.ts`의 COLORS 객체 사용
- **타입**: `src/types/index.ts`에 정의
- **카메라**: expo-camera의 CameraView
- **영상 처리**: Expo Modules API 네이티브 모듈 (`modules/timelapse-creator`) — iOS: AVAssetWriter, Android: MediaCodec

## 주의사항

- 사진 캡처 → 서버 업로드 → FFmpeg 변환 흐름
- `Platform.OS` 분기 코드 존재 (웹 폴백)
- Reanimated 플러그인은 `babel.config.js` 마지막에 위치해야 함
- 린트/테스트 미구성
