# Web Frontend — Study Timelapse

## 기술 스택

- React 19, TypeScript 5.9, Vite 7

## 디렉토리 구조

```
frontend/web/src/
├── pages/        # 페이지 컴포넌트
├── components/   # 공통 컴포넌트
├── hooks/        # 커스텀 훅
├── utils/        # 유틸리티
└── App.tsx       # 앱 루트
```

## 명령어

```bash
# 개발서버
cd frontend/web && npm run dev

# 빌드
cd frontend/web && npm run build

# 린트
cd frontend/web && npm run lint
```

## 코딩 컨벤션

- **페이지 컴포넌트**: `src/pages/`에 배치
- **유틸리티**: `src/utils/`에 배치
- **import alias**: `@` → `./src`, `@shared` → `../packages/shared`
- **앱 플로우**: setup → recording → themeSelect → conversion → complete
- **상태 관리**: React hooks (useState), prop drilling
- **API 호출**: fetch + `VITE_API_BASE_URL` 환경변수
- **스타일**: CSS 파일 (CSS-in-JS 아님)

## 주의사항

- Canvas API로 오버레이 렌더링 (웹 전용)
- MediaRecorder API로 녹화 — 브라우저 호환성 주의
- 테스트 미구성
