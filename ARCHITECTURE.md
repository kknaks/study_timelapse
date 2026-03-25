# FocusTimelapse — 시스템 아키텍처 문서

> 최종 업데이트: 2025-03-25  
> 버전: v1.0 (빌드 73, 빌드 74 준비 중)

---

## 목차

1. [개요](#1-개요)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [프론트엔드 (iOS 앱)](#3-프론트엔드-ios-앱)
4. [화면 플로우](#4-화면-플로우)
5. [핵심 Native Module: timelapse-creator](#5-핵심-native-module-timelapse-creator)
6. [데이터 플로우](#6-데이터-플로우)
7. [백엔드 API](#7-백엔드-api)
8. [인증 플로우](#8-인증-플로우)
9. [해상도 및 영상 설정](#9-해상도-및-영상-설정)
10. [빌드 및 배포 파이프라인](#10-빌드-및-배포-파이프라인)
11. [디렉토리 구조](#11-디렉토리-구조)
12. [향후 로드맵](#12-향후-로드맵)

---

## 1. 개요

**FocusTimelapse**는 사용자의 공부/작업 모습을 녹화하여 타임랩스 영상으로 변환해주는 iOS 앱이다.

| 항목 | 내용 |
|------|------|
| 앱 이름 | FocusTimelapse |
| 플랫폼 | iOS (React Native + Expo) |
| 백엔드 | Python FastAPI + PostgreSQL |
| 번들 ID | `com.kknaks.studytimelapse` |
| 레포지토리 | https://github.com/kknaks/study_timelapse |
| API 서버 | https://studylaps-api.kknaks.cloud |

---

## 2. 전체 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   iOS App (Expo)                     │
│                                                     │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ expo-router│  │ Vision Camera│  │  timelapse-  │ │
│  │ (Screens)  │  │  v4 (녹화)   │  │  creator     │ │
│  └─────┬─────┘  └──────┬───────┘  │  (Native)    │ │
│        │               │          └──────┬───────┘ │
│  ┌─────┴───────────────┴─────────────────┘         │
│  │         React Native Bridge                      │
│  └─────────────────┬───────────────────────────────┘
│                    │                                 │
│  ┌─────────────────┴───────────────────┐            │
│  │  @tanstack/react-query              │            │
│  │  (서버 상태 관리 + 캐싱)              │            │
│  └─────────────────┬───────────────────┘            │
└────────────────────┼────────────────────────────────┘
                     │ HTTPS (JWT)
                     ▼
┌────────────────────────────────────────┐
│         Backend Server                  │
│         210.113.34.187:18001           │
│                                        │
│  ┌──────────┐    ┌──────────────────┐  │
│  │ FastAPI   │───▶│  PostgreSQL      │  │
│  │ (Python)  │    │  (Docker)        │  │
│  └──────────┘    └──────────────────┘  │
│                                        │
│  Nginx Reverse Proxy                   │
│  studylaps-api.kknaks.cloud            │
└────────────────────────────────────────┘
```

### 핵심 설계 원칙

1. **온디바이스 영상 처리**: 타임랩스 생성과 오버레이 합성은 모두 iOS 디바이스에서 AVFoundation을 사용하여 처리. 서버 부하 없음.
2. **2-pass 렌더링**: 1차 타임랩스 생성(속도 압축 + crop) → 2차 오버레이 합성(CALayer). 미리보기 후 오버레이 선택이 가능하도록 분리.
3. **JWT 기반 인증**: Google/Apple OAuth → 서버에서 JWT 발급 → 클라이언트 SecureStore 저장 → 401 자동 갱신.

---

## 3. 프론트엔드 (iOS 앱)

### 기술 스택

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| React Native | 0.83.2 | 크로스플랫폼 UI 프레임워크 |
| Expo SDK | 55 | 관리형 워크플로 |
| expo-router | ~55.0.3 | 파일 기반 라우팅 |
| react-native-vision-camera | v4.7.3 | 카메라 녹화 |
| expo-video | ~55.0.10 | VideoView 미리보기 |
| @tanstack/react-query | ^5.90 | 서버 상태 관리 + 캐싱 |
| expo-media-library | ~55.0.9 | 갤러리 저장 |
| expo-file-system | ~55.0.10 | 파일 경로 관리 |
| expo-asset | ~11.1.4 | 로컬 에셋 (로고 등) 로드 |
| expo-secure-store | ^55.0.8 | JWT 토큰 보안 저장 |
| axios | ^1.13.6 | HTTP 클라이언트 |
| react-native-reanimated | ^3.19.1 | 애니메이션 |
| react-native-gesture-handler | ^2.30.0 | 제스처 처리 |

### 프론트엔드 디렉토리 구조

```
frontend/mobile/
├── app/                    # expo-router 페이지 (화면)
│   ├── _layout.tsx         # 루트 레이아웃 (QueryClient, AuthProvider)
│   ├── index.tsx           # 홈 화면
│   ├── login.tsx           # 로그인
│   ├── session-setup.tsx   # 세션 설정
│   ├── focus.tsx           # 녹화 (포커스 타이머)
│   ├── generating.tsx      # 타임랩스 생성 중
│   ├── result.tsx          # 결과 미리보기 + 오버레이 선택
│   ├── saving.tsx          # 오버레이 합성 + 저장 중
│   ├── stats.tsx           # 통계 / 완료 화면
│   └── paywall.tsx         # 결제 화면
├── src/
│   ├── api/                # API 클라이언트 모듈
│   │   ├── client.ts       # axios 인스턴스 (interceptor, 토큰 갱신)
│   │   ├── auth.ts         # 인증 API
│   │   ├── sessions.ts     # 세션 API
│   │   ├── user.ts         # 유저 API
│   │   └── stats.ts        # 통계 API
│   ├── auth/
│   │   ├── AuthContext.tsx  # 인증 Context Provider
│   │   └── tokenStore.ts   # SecureStore 토큰 관리
│   ├── components/         # 재사용 컴포넌트
│   ├── constants/          # 상수 정의
│   └── types/              # TypeScript 타입 정의
└── modules/
    └── timelapse-creator/  # 커스텀 네이티브 모듈
        └── ios/
            ├── TimelapseCreatorModule.swift
            └── TimelapseCreator.podspec
```

---

## 4. 화면 플로우

```
                    ┌──────────┐
                    │  login   │ ◄─── Google / Apple OAuth
                    └────┬─────┘
                         │ 인증 완료
                         ▼
┌──────────┐      ┌──────────┐      ┌───────────────┐
│  index   │─────▶│ session- │─────▶│    focus       │
│  (홈)    │      │  setup   │      │  (녹화 중)     │
└──────────┘      │(세션설정) │      │  VisionCamera  │
                  └──────────┘      └───────┬───────┘
                                            │ 녹화 완료
                                            ▼
                                   ┌───────────────┐
                                   │  generating   │
                                   │ (타임랩스 생성)│
                                   │ createTimelapse│
                                   └───────┬───────┘
                                           │ 생성 완료
                                           ▼
                                   ┌───────────────┐
                                   │   result      │
                                   │ (미리보기 +    │
                                   │  오버레이 선택)│
                                   │ expo-video     │
                                   └───────┬───────┘
                                           │ Save 버튼
                                           ▼
                                   ┌───────────────┐
                                   │   saving      │
                                   │ (오버레이 합성 │
                                   │  + 갤러리 저장)│
                                   │ applyOverlay   │
                                   └───────┬───────┘
                                           │ 저장 완료
                                           ▼
                                   ┌───────────────┐
                                   │   stats       │
                                   │ (통계/완료)    │
                                   │ 공유 / 홈으로  │
                                   └───────────────┘
```

### 각 화면 상세

| 화면 | 파일 | 주요 기능 |
|------|------|----------|
| 홈 | `index.tsx` | 세션 시작, 유저 streak 표시, 로그인 확인 |
| 로그인 | `login.tsx` | Google / Apple 소셜 로그인 |
| 세션 설정 | `session-setup.tsx` | 목표 시간, 해상도 등 세팅 |
| 포커스 | `focus.tsx` | 전면/후면 카메라 녹화, 타이머 표시, 세션 기록 |
| 생성 중 | `generating.tsx` | `createTimelapse` 호출, 진행률 표시 |
| 결과 | `result.tsx` | 타임랩스 미리보기(VideoView), 오버레이 스타일 선택 |
| 저장 중 | `saving.tsx` | `applyOverlay` 호출, 갤러리 저장 |
| 통계 | `stats.tsx` | 세션 결과 표시, 공유 옵션 |
| 페이월 | `paywall.tsx` | Pro 구독 / 크레딧 구매 |

---

## 5. 핵심 Native Module: timelapse-creator

**위치**: `frontend/mobile/modules/timelapse-creator/ios/TimelapseCreatorModule.swift`

이 모듈은 Expo Modules API를 사용하여 Swift로 작성된 커스텀 네이티브 모듈로, 영상 처리의 핵심 로직을 담당한다.

### 5.1. createTimelapse (buildTimelapse)

타임랩스 생성 — 원본 녹화 영상을 시간 압축 + 해상도 조정하여 타임랩스로 변환.

```
원본 영상 (MOV/MP4, 수십 분~수 시간)
    │
    ▼
AVMutableComposition
    │ scaleTimeRange: 원본 전체 → outputSeconds로 시간 압축
    ▼
AVMutableVideoComposition
    │ propertiesOf: 원본 속성 기반
    │ preferredTransform: 카메라 회전 보정
    │ aspect-fill crop: 목표 해상도에 맞게 크롭
    ▼
AVAssetExportSession
    │ preset: passthrough
    │ outputFileType: .mp4
    ▼
타임랩스 MP4 (최종 해상도, crop 완료)
```

**입력 파라미터:**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| sourceUri | String | 원본 녹화 영상 경로 |
| outputWidth | Int | 출력 가로 해상도 |
| outputHeight | Int | 출력 세로 해상도 |
| outputSeconds | Double | 출력 영상 길이 (초) |
| fps | Int | 출력 FPS |
| bitrate | Int | 출력 비트레이트 |
| debugStep | Int | 디버그 단계 (0/1/2) |

**debugStep 상세:**
- `0` — passthrough: composition만 적용 (디버그용)
- `1` — videoComposition only: 크롭 없이 transform만 적용
- `2` — transform + crop: 전체 파이프라인 적용 (기본값)

### 5.2. applyOverlay (buildOverlay)

오버레이 합성 — 이미 생성된 타임랩스 위에 정보 오버레이를 합성.

```
타임랩스 MP4 (최종 해상도)
    │
    ▼
AVMutableComposition
    │
    ▼
AVVideoCompositionCoreAnimationTool
    │
    ├── parentLayer (isGeometryFlipped = true)
    │   ├── videoLayer (영상 원본)
    │   └── overlayLayer (CALayer 기반 오버레이)
    │       ├── 워터마크 (항상 표시)
    │       ├── Timer (선택)
    │       ├── ProgressBar (선택)
    │       └── Streak (선택)
    │
    ▼
AVAssetExportSession
    │
    ▼
오버레이 합성된 최종 MP4
```

**입력 파라미터:**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| sourceUri | String | 타임랩스 영상 경로 |
| overlayStyle | String | 오버레이 스타일 (none/minimal/full 등) |
| streak | Int | 연속 학습 일수 |
| recordingSeconds | Double | 실제 녹화 시간 (초) |
| goalSeconds | Double | 목표 시간 (초) |
| logoPath | String | 로고 이미지 경로 |

**오버레이 스케일링:**
```
scale = videoWidth / 390
```
- 기준: iPhone 화면 너비 390pt
- 모든 오버레이 요소의 크기와 위치를 이 scale 값으로 변환 (pt → px)

---

## 6. 데이터 플로우

### 6.1. 영상 처리 파이프라인

```
[카메라 녹화]                    [타임랩스 생성]              [오버레이 합성]
VisionCamera                   createTimelapse              applyOverlay
     │                              │                            │
     ▼                              ▼                            ▼
원본 MOV/MP4                   타임랩스 MP4                  최종 MP4
(수 GB, 수십 분)               (수 MB, 수십 초)              (오버레이 포함)
     │                              │                            │
     └── FileSystem 임시 경로 ──────┘                            │
                                                                 ▼
                                                          MediaLibrary
                                                          (갤러리 저장)
```

### 6.2. 서버 통신 플로우

```
┌──────────────────────────────────────────────────────────┐
│                        App                                │
│                                                          │
│  AuthContext ──▶ tokenStore (SecureStore)                 │
│       │              │                                    │
│       ▼              ▼                                    │
│  api/client.ts (axios instance)                          │
│       │                                                   │
│       ├── Request Interceptor: Authorization header 추가  │
│       └── Response Interceptor: 401 → refresh → retry    │
│                                                          │
│  @tanstack/react-query                                   │
│       │                                                   │
│       ├── useQuery  → GET /api/v1/users/me               │
│       ├── useMutation → POST /api/v1/sessions            │
│       └── useMutation → PATCH /api/v1/sessions/{id}      │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS
                       ▼
              Backend (FastAPI)
```

### 6.3. 인증 토큰 갱신 플로우

```
Client                          Server
  │                                │
  ├── API Request ────────────────▶│
  │   (Authorization: Bearer AT)   │
  │                                │
  │◀──── 401 Unauthorized ────────┤
  │                                │
  ├── POST /auth/refresh ─────────▶│
  │   (refresh_token: RT)          │
  │                                │
  │◀──── { access_token, RT } ────┤
  │                                │
  ├── 원래 요청 재시도 ──────────────▶│
  │   (Authorization: Bearer 새AT) │
  │                                │
  │◀──── 200 OK ──────────────────┤
```

---

## 7. 백엔드 API

### 7.1. 기술 스택

| 구성 요소 | 기술 |
|----------|------|
| 프레임워크 | FastAPI (Python) |
| 데이터베이스 | PostgreSQL |
| ORM | SQLAlchemy |
| 마이그레이션 | Alembic |
| 컨테이너 | Docker / Docker Compose |
| 인증 | JWT (access + refresh token) |
| 서버 | 210.113.34.187:18001 |
| 도메인 | studylaps-api.kknaks.cloud (HTTPS) |

### 7.2. 백엔드 디렉토리 구조

```
backend/
├── app/
│   ├── main.py              # FastAPI 앱 진입점
│   ├── config.py            # 환경 설정
│   ├── database.py          # DB 연결 설정
│   ├── dependencies.py      # 의존성 주입
│   ├── exceptions.py        # 커스텀 예외
│   ├── api/
│   │   └── v1/
│   │       ├── router.py    # API v1 라우터 통합
│   │       ├── auth.py      # 인증 (Google/Apple OAuth)
│   │       ├── sessions.py  # 세션 CRUD
│   │       ├── users.py     # 유저 정보
│   │       ├── stats.py     # 통계
│   │       ├── timelapse.py # 타임랩스 관련
│   │       └── upload.py    # 파일 업로드
│   ├── models/              # SQLAlchemy 모델
│   │   ├── base.py          # 공통 베이스 모델
│   │   ├── user.py          # User 모델
│   │   ├── session.py       # Session 모델
│   │   └── daily_focus.py   # DailyFocus 모델
│   ├── schemas/             # Pydantic 스키마
│   ├── services/            # 비즈니스 로직
│   └── repositories/        # 데이터 접근 계층
├── alembic/                 # DB 마이그레이션
├── tests/                   # 테스트
├── Dockerfile               # 컨테이너 빌드
└── requirements.txt         # Python 패키지
```

### 7.3. 주요 API 엔드포인트

#### 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/auth/google` | Google OAuth 로그인 |
| POST | `/api/v1/auth/apple` | Apple OAuth 로그인 |
| POST | `/api/v1/auth/refresh` | 토큰 갱신 |

#### 사용자

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/users/me` | 현재 유저 정보 (streak 포함) |

#### 세션

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/sessions` | 새 포커스 세션 생성 |
| PATCH | `/api/v1/sessions/{id}` | 세션 업데이트 (완료/중단) |
| GET | `/api/v1/sessions` | 세션 목록 조회 |

#### 통계

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/stats` | 유저 통계 조회 |

### 7.4. 데이터 모델

```
┌──────────────┐       ┌──────────────────┐       ┌─────────────────┐
│    User      │       │    Session        │       │  DailyFocus     │
├──────────────┤       ├──────────────────┤       ├─────────────────┤
│ id (PK)      │──1:N─▶│ id (PK)          │       │ id (PK)         │
│ email        │       │ user_id (FK)     │       │ user_id (FK)    │
│ name         │       │ goal_seconds     │       │ date            │
│ provider     │       │ recording_seconds│       │ total_seconds   │
│ provider_id  │       │ status           │       │ session_count   │
│ streak       │       │ created_at       │       └─────────────────┘
│ created_at   │       │ updated_at       │
└──────────────┘       └──────────────────┘
```

---

## 8. 인증 플로우

### Google OAuth

```
1. 앱: @react-native-google-signin → Google ID Token 획득
2. 앱 → 서버: POST /api/v1/auth/google { id_token }
3. 서버: Google ID Token 검증 → 유저 생성/조회
4. 서버 → 앱: { access_token, refresh_token }
5. 앱: SecureStore에 토큰 저장
```

### Apple OAuth

```
1. 앱: expo-apple-authentication → Authorization Code + Identity Token
2. 앱 → 서버: POST /api/v1/auth/apple { identity_token, authorization_code }
3. 서버: Apple Identity Token 검증 → 유저 생성/조회
4. 서버 → 앱: { access_token, refresh_token }
5. 앱: SecureStore에 토큰 저장
```

---

## 9. 해상도 및 영상 설정

### 지원 비율별 출력 해상도

| 비율 | 해상도 (WxH) | 용도 |
|------|-------------|------|
| 9:16 | 720 x 1280 | 인스타 릴스, 틱톡 (기본) |
| 1:1 | 720 x 720 | 인스타 피드 |
| 16:9 | 1280 x 720 | 유튜브, 일반 |
| 4:5 | 720 x 900 | 인스타 피드 (세로) |
| 3:4 | 810 x 1080 | 세로 콘텐츠 |

### 오버레이 스타일

- **워터마크**: 항상 표시 (앱 로고)
- **Timer**: 실제 녹화 시간 표시 (hr/hrs 단위)
- **ProgressBar**: 목표 대비 진행률
- **Streak**: 연속 학습 일수 (🔥 아이콘)

---

## 10. 빌드 및 배포 파이프라인

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ 로컬 개발    │────▶│  EAS Build   │────▶│ App Store       │
│             │     │ (Cloud)      │     │ Connect         │
│ expo start  │     │              │     │                 │
│ expo run:ios│     │ eas build    │     │ eas submit      │
└─────────────┘     │ --platform   │     │ --platform ios  │
                    │ ios          │     │                 │
                    └──────┬───────┘     └────────┬────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌─────────────────┐
                    │  .ipa 생성    │     │  TestFlight     │
                    │  (빌드 번호)  │     │  (내부 테스트)   │
                    └──────────────┘     └─────────────────┘
                                                  │
                                                  ▼
                                         ┌─────────────────┐
                                         │  App Store      │
                                         │  (출시)         │
                                         └─────────────────┘
```

### 빌드 설정

| 항목 | 설정 |
|------|------|
| 빌드 시스템 | EAS Build (Expo Application Services) |
| 빌드 환경 | Cloud (Expo 서버) |
| 현재 버전 | 1.0.0 |
| 현재 빌드 | 73 (빌드 74 예정) |
| OTA 업데이트 | **없음** (expo-updates 제거) |
| 배포 방식 | 모든 변경은 EAS 빌드 필수 |

### 백엔드 배포

```
로컬 코드 변경
    │
    ├── ruff check .         (lint 검사)
    ├── pytest --tb=short -q (테스트)
    │
    ▼
git push origin main
    │
    ▼
서버 (210.113.34.187)
    │
    ├── docker-compose pull
    └── docker-compose up -d
```

---

## 11. 디렉토리 구조 (전체)

```
study_timelapse/
├── ARCHITECTURE.md          # 본 문서
├── CLAUDE.md                # AI 코딩 에이전트 가이드
├── API.md                   # API 문서
├── PRD.md                   # 제품 요구사항
├── docker-compose.yml       # 로컬 개발 환경
├── docker-compose.prod.yml  # 프로덕션 환경
├── scripts/                 # 유틸리티 스크립트
├── docs/
│   └── PRD_mobile.md        # 모바일 PRD
├── backend/                 # FastAPI 백엔드
│   ├── CLAUDE.md
│   ├── app/
│   │   ├── api/v1/          # API 엔드포인트
│   │   ├── models/          # DB 모델
│   │   ├── schemas/         # Pydantic 스키마
│   │   ├── services/        # 비즈니스 로직
│   │   └── repositories/    # 데이터 접근
│   ├── alembic/             # DB 마이그레이션
│   ├── tests/
│   └── Dockerfile
└── frontend/
    ├── mobile/              # React Native (Expo) 앱
    │   ├── CLAUDE.md
    │   ├── app/             # expo-router 화면들
    │   ├── src/             # 소스코드
    │   │   ├── api/         # API 클라이언트
    │   │   ├── auth/        # 인증
    │   │   ├── components/  # 컴포넌트
    │   │   ├── constants/   # 상수
    │   │   └── types/       # 타입 정의
    │   └── modules/
    │       └── timelapse-creator/  # Native 모듈
    └── web/                 # (레거시) 웹 프론트엔드
```

---

## 12. 향후 로드맵

### v1.0 출시 (P0 + P1 + P2)

#### P0 — 출시 차단 (예상: 3-4일)

| 항목 | 예상 시간 | 상세 |
|------|----------|------|
| 오버레이 버그 수정 | 4-8h | 저장 영상 ↔ 미리보기 일치 문제. CALayer 좌표/타이밍 디버깅 |
| Debug Alert 제거 | 0.5h | `generating.tsx`의 `addDebugLogListener` Alert 삭제 |
| hr/hrs 단수복수 수정 | 2-3h | `result.tsx`, `saving.tsx`, Swift `drawOverlay` 등 전체 탐색 및 통일 |
| Apple 로그인 | 4-6h | `expo-apple-authentication` 연동, 백엔드 Apple OAuth 엔드포인트, App Store Connect 설정 |
| **P0 소계** | **~11-18h** | **약 2-3일** |

#### P1 — 출시 전 필수 (예상: 4-5일)

| 항목 | 예상 시간 | 상세 |
|------|----------|------|
| 인스타 공유 | 4-6h | Instagram Stories SDK 또는 `instagram-stories://` URL scheme. 딥링크로 영상 전달 |
| 에러 핸들링 | 4-6h | 네트워크 오류 토스트, 세션 생성 실패 재시도, API 에러 공통 처리 |
| 크래시 모니터링 | 3-4h | Sentry (`@sentry/react-native`) 또는 Firebase Crashlytics 설정 |
| 백그라운드 타이머 | 3-5h | 시작 timestamp 기반 elapsed 계산 방식 (AppState 이벤트 + Date.now() diff) |
| **P1 소계** | **~14-21h** | **약 3-4일** |

#### P2 — 수익화 (예상: 5-7일)

| 항목 | 예상 시간 | 상세 |
|------|----------|------|
| RevenueCat 결제 연동 | 8-12h | `react-native-purchases` 설정, App Store Connect 상품 등록, 구매 플로우 |
| Free/Pro 크레딧 시스템 | 6-8h | 백엔드 크레딧 모델, 프론트 크레딧 표시, 사용량 체크 로직 |
| 7일 트라이얼 | 2-3h | RevenueCat introductory offer 설정, 트라이얼 상태 UI |
| 앱 메타데이터 | 4-6h | 스크린샷(6.7"/6.5"/5.5"), 설명문, 개인정보 처리방침, 이용약관 작성 |
| **P2 소계** | **~20-29h** | **약 4-5일** |

#### **v1.0 전체: 약 9-12일 (풀타임 기준)**

---

### v1.1 (출시 후)

| 항목 | 예상 시간 | 상세 |
|------|----------|------|
| 앱 잠금 기능 | 2-3주 | FamilyControls API, Apple 별도 권한 심사 필요 (심사 기간 불확정) |
| CIFilter compositor (Phase 2) | 1-2주 | CIFilter 기반 실시간 필터/오버레이 시스템 구축 |
| AVPlayer 미리보기 (Phase 3) | 3-5일 | 현재 expo-video → AVPlayer 직접 제어로 전환 |
| 레거시 코드 정리 (Phase 4) | 2-3일 | 웹 프론트엔드, 미사용 코드, 디버그 코드 정리 |
| 틱톡 공유 | 2-3일 | TikTok Share SDK 연동 |

---

*본 문서는 프로젝트의 현재 상태를 기반으로 작성되었으며, 개발 진행에 따라 업데이트될 수 있습니다.*
