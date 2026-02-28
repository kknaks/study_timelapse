# FocusTimelapse — Mobile PRD v2.1

> **Turn your focus into content**

---

## 1. 개요

FocusTimelapse는 공부/집중 시간을 타임랩스 영상 콘텐츠로 변환하는 모바일 앱입니다.
사용자가 집중하는 모습을 녹화하고, 자동으로 Reels/Shorts에 최적화된 타임랩스 영상을 생성합니다.
스트릭과 세션 크레딧 시스템으로 꾸준한 학습 습관을 형성합니다.

## 2. MVP(Web)와의 차이점

| 구분 | MVP (Web) | Mobile v2.1 |
|------|-----------|-------------|
| **플랫폼** | React (웹 반응형) | React Native (iOS + Android) |
| **녹화** | MediaRecorder API (브라우저) | 네이티브 카메라 (풀스크린 포커스 모드) |
| **백그라운드** | 탭 전환 시 녹화 중단 위험 | 네이티브 백그라운드 녹화 지원 |
| **타이머** | 남은/경과 시간 표시 | 풀스크린 포커스 모드 내 타이머 |
| **오버레이** | 프론트(Canvas)에서 합성 | 서버사이드 FFmpeg 합성 |
| **세션 관리** | 없음 (무제한) | 세션 크레딧 시스템 (Free/Pro) |
| **스트릭** | 없음 | 하루 1세션 완료 기준 스트릭 |
| **통계** | 없음 (Phase 2 예정) | 오늘/주간 포커스 시간, 스트릭 대시보드 |
| **구독/결제** | 없음 | RevenueCat (Phase 2) |
| **영상 비율** | 9:16, 1:1, 4:5, 16:9 | 9:16, 1:1, 16:9 (4:5 제외) |
| **워터마크** | 없음 | Free=워터마크, Pro=클린 |
| **공유** | 다운로드만 | 내보내기 (갤러리 저장 + 공유 시트) |
| **계정** | 없음 | 소셜 로그인 (Google / Apple) |
| **다국어** | KO/ZH/JA/EN/ES | Phase 1에서는 KO/EN (추후 확장) |

## 3. 타겟 유저

- 수험생, 대학생, 직장인 자기개발러
- 인스타 Reels / 유튜브 Shorts / 틱톡에 공부 콘텐츠를 올리는 스터디그래머
- 꾸준한 학습 습관을 만들고 싶은 사람

## 4. 기술 스택

| 구분 | 스택 |
|------|------|
| **모바일** | React Native (iOS + Android) |
| **백엔드** | Python FastAPI + PostgreSQL |
| **영상 처리** | FFmpeg (서버사이드 타임랩스 변환 + 오버레이 합성) |
| **인증** | Google Sign-In, Sign in with Apple |
| **결제** | RevenueCat (Phase 2) |
| **로컬 저장** | AsyncStorage / SQLite (세션 데이터, 설정) |
| **카메라** | react-native-camera / expo-camera |

## 5. 핵심 기능

### 5.1 홈 스크린

| 요소 | 설명 |
|------|------|
| 오늘 포커스 시간 | 오늘 완료한 세션들의 총 집중 시간 |
| 주간 합계 | 이번 주 총 포커스 시간 |
| 스트릭 🔥 | 연속 집중 일수 (하루 1세션 이상 완료 기준) |
| 세션 크레딧 | 남은 세션 횟수 표시 (Free: 1/1, Pro: ∞) |
| 시작 버튼 | 세션 설정 화면으로 이동 |

### 5.2 세션 크레딧

| 플랜 | 일일 세션 | 비고 |
|------|----------|------|
| **Free** | 1회/일 | 자정(로컬 시간) 기준 리셋 |
| **Pro** | 무제한 | 구독 활성 시 |
| **신규 트라이얼** | 무제한 (7일) | 최초 설치 후 7일간 Pro 체험 |

### 5.3 세션 설정

| 설정 항목 | 옵션 |
|-----------|------|
| 공부 시간 | 시/분 입력 (최소 1분 ~ 최대 12시간) |
| 출력 길이 | 30초 / 60초 / 90초 |
| 영상 비율 | 9:16 (Reels/Shorts) / 1:1 (정방형) / 16:9 (가로) |
| 오버레이 스타일 | stopwatch / analog-clock / progress-bar / minimal / none |
| 알림 | 세션 종료 알림 ON/OFF |

### 5.4 포커스 모드 (녹화 중)

- **풀스크린 카메라 프리뷰** — 집중을 방해하지 않는 미니멀 UI
- **타이머 표시** — 경과 시간 / 남은 시간
- **Pause 버튼** — 일시정지 (녹화 일시중지)
- **Stop 버튼** — 세션 종료 → 영상 업로드 시작
- **자동 종료** — 설정 시간 도달 시 알림 + 자동 종료

### 5.5 스트릭 시스템

| 규칙 | 설명 |
|------|------|
| 유지 조건 | 하루(자정 기준) 1세션 이상 **완료** |
| 리셋 | 하루라도 미완료 시 0으로 리셋 |
| 표시 | 홈 스크린 🔥 + 연속 일수 |
| 저장 | 로컬 + 서버 DB 양쪽 저장 |

### 5.6 영상 내보내기

| 항목 | 사양 |
|------|------|
| 해상도 | 1080p |
| 포맷 | MP4 (H.264) |
| 워터마크 | Free: "FocusTimelapse" 워터마크 / Pro: 클린 |
| 최적화 | Reels/Shorts 비율 및 길이 최적화 |
| 내보내기 | 갤러리 저장 + OS 공유 시트 |

### 5.7 통계

| 지표 | 설명 |
|------|------|
| 오늘 포커스 시간 | 금일 총 집중 시간 |
| 주간 포커스 시간 | 이번 주 일별 포커스 시간 (바 차트) |
| 현재 스트릭 | 연속 집중 일수 |
| 최장 스트릭 | 역대 최장 연속 일수 |

## 6. 데이터 모델

### 로컬 (AsyncStorage / SQLite)

```
Session {
  id: string (UUID)
  startTime: datetime
  endTime: datetime
  duration: number (seconds)
  outputSeconds: number (30 | 60 | 90)
  aspectRatio: string ("9:16" | "1:1" | "16:9")
  overlayStyle: string
  status: "recording" | "uploading" | "processing" | "completed" | "failed"
  localVideoPath: string
  taskId: string (서버 변환 작업 ID)
}

UserState {
  streak: number
  lastSessionDate: string (YYYY-MM-DD)
  longestStreak: number
  totalFocusTime: number (seconds)
  trialStartDate: string (YYYY-MM-DD)
  subscriptionStatus: "free" | "trial" | "pro"
}
```

### 서버 DB (PostgreSQL)

```sql
-- 사용자
CREATE TABLE users (
  id UUID PRIMARY KEY,
  provider VARCHAR NOT NULL,           -- 'google' | 'apple'
  provider_id VARCHAR UNIQUE NOT NULL, -- Google sub / Apple user ID
  email VARCHAR,
  name VARCHAR,
  streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  total_focus_time INT DEFAULT 0,  -- seconds
  subscription_status VARCHAR DEFAULT 'free',
  trial_start_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 세션
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration INT,  -- seconds
  output_seconds INT NOT NULL,
  aspect_ratio VARCHAR DEFAULT '9:16',
  overlay_style VARCHAR DEFAULT 'stopwatch',
  status VARCHAR DEFAULT 'recording',
  file_id VARCHAR,
  task_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 일별 포커스 기록
CREATE TABLE daily_focus (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  total_seconds INT DEFAULT 0,
  session_count INT DEFAULT 0,
  UNIQUE(user_id, date)
);
```

## 7. API 설계 (모바일 추가분)

기존 MVP API(`/api/upload`, `/api/timelapse`, `/api/timelapse/:taskId`, `/api/download/:taskId`)를 그대로 활용하며, 모바일 전용 API를 추가합니다.

### 추가 API

```
POST   /api/auth/google          — Google 소셜 로그인 (id_token → JWT)
POST   /api/auth/apple           — Apple 소셜 로그인 (identity_token → JWT)
POST   /api/auth/refresh         — JWT 토큰 갱신
GET    /api/users/me              — 내 정보 (스트릭, 구독 상태, 포커스 시간)
PUT    /api/users/me/streak       — 스트릭 업데이트
POST   /api/sessions              — 세션 생성 (시작)
PUT    /api/sessions/:id          — 세션 업데이트 (종료, 상태 변경)
GET    /api/sessions              — 세션 목록 조회
GET    /api/stats/daily           — 일별 포커스 통계
GET    /api/stats/weekly          — 주간 포커스 통계
POST   /api/subscription/verify   — 구독 상태 검증 (RevenueCat, Phase 2)
```

### 기존 API 변경사항

| API | 변경 |
|-----|------|
| `POST /api/timelapse` | `watermark` 파라미터 추가 (boolean, Free=true) |
| `POST /api/timelapse` | `overlay` 합성을 서버사이드에서 직접 처리 (MVP는 프론트 Canvas) |

## 8. 화면 구조

```
1. 홈 (Home)
   ├── 오늘 포커스 시간
   ├── 주간 합계
   ├── 스트릭 🔥
   ├── 세션 크레딧 상태
   └── [세션 시작] 버튼

2. 세션 설정 (Session Setup)
   ├── 공부 시간 설정
   ├── 출력 길이 선택
   ├── 비율 선택
   ├── 오버레이 스타일
   ├── 알림 설정
   └── [시작] 버튼

3. 포커스 모드 (Focus Mode)
   ├── 풀스크린 카메라 프리뷰
   ├── 타이머 (경과/남은)
   ├── [일시정지] 버튼
   └── [종료] 버튼

4. 처리 중 (Processing)
   ├── 업로드 진행률
   └── 변환 진행률

5. 완료 (Complete)
   ├── 타임랩스 미리보기
   ├── [갤러리 저장] 버튼
   └── [공유] 버튼

6. 통계 (Stats)
   ├── 오늘 포커스 시간
   ├── 주간 바 차트
   ├── 현재 스트릭
   └── 최장 스트릭

7. 설정 (Settings)
   ├── 구독 관리
   ├── 알림 설정
   └── 앱 정보
```

## 9. 사용자 플로우

```
[앱 실행] → [홈: 스트릭/포커스 시간 확인]
    → [세션 시작] → [세션 설정: 시간/비율/오버레이]
    → [포커스 모드: 카메라 녹화 + 타이머]
    → [세션 종료 or 타이머 완료]
    → [영상 업로드] → [서버: 타임랩스 변환 + 오버레이 + 워터마크]
    → [완료: 미리보기 + 내보내기]
    → [홈: 스트릭 업데이트, 포커스 시간 갱신]
```

## 10. 구독 모델

| 플랜 | 가격 | 혜택 |
|------|------|------|
| **Free** | $0 | 하루 1세션, 워터마크 포함 |
| **Pro (월간)** | $3.99/월 | 무제한 세션, 워터마크 없음 |
| **Pro (연간)** | $29.99/년 | 무제한 세션, 워터마크 없음 (~37% 할인) |
| **신규 트라이얼** | 7일 무료 | 최초 설치 후 Pro 기능 7일 체험 |

> 결제 인프라: RevenueCat (iOS App Store + Google Play 통합)

## 11. 스코프 외 (Out of Scope)

다음 기능은 현재 버전에서 **구현하지 않습니다**:

- ❌ 소셜 기능 (팔로우, 피드, 좋아요)
- ❌ 클라우드 동기화 (기기 간 데이터 동기화)
- ❌ 4K 영상 출력
- ❌ 커스텀 폰트/색상 (오버레이)
- ❌ 이메일/비밀번호 로그인 (소셜 로그인만 지원)
- ❌ 다국어 확장 (Phase 1은 KO/EN만)

## 12. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 대용량 영상 업로드 (모바일 네트워크) | 업로드 실패, UX 저하 | 청크 업로드, 백그라운드 업로드, 재시도 로직 |
| iOS/Android 카메라 권한 | 녹화 불가 | 권한 요청 플로우 + 설정 안내 UI |
| 배터리 소모 (장시간 녹화) | 사용자 이탈 | 절전 모드 안내, 녹화 최적화 (프레임레이트 조절) |
| FFmpeg 서버 부하 | 변환 지연 | 큐 시스템 (Celery/Redis), 동시 변환 수 제한 |
| RevenueCat 연동 이슈 | 결제 실패 | 샌드박스 충분 테스트, 복원 구매 지원 |
| 오프라인 상태 | 동기화 실패 | 로컬 저장 우선, 온라인 복구 시 자동 동기화 |

## 13. 성공 지표 (KPI)

| 지표 | 목표 (출시 3개월) |
|------|------------------|
| DAU | 1,000+ |
| 세션 완료율 | 70%+ (시작 대비 완료) |
| 평균 스트릭 | 5일+ |
| Free → Pro 전환율 | 5%+ |
| 앱스토어 평점 | 4.5+ |

## 14. 상태

- [x] 아이디어
- [x] 기획 (Web MVP PRD)
- [x] 기획 (Mobile PRD v2.1) ← **현재**
- [ ] 디자인 (Figma)
- [ ] Phase 1 개발
- [ ] Phase 1 테스트/배포
- [ ] Phase 2 개발
- [ ] Phase 2 테스트/배포
