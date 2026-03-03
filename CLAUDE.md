# Study Timelapse

공부 타임랩스 생성 서비스. 사용자가 공부하는 모습을 캡처하여 타임랩스 영상으로 변환한다.

## 아키텍처

3-tier 구조:
- **Backend**: FastAPI (Python) — API 서버, FFmpeg 영상 처리
- **Web Frontend**: React + Vite — 브라우저 기반 클라이언트
- **Mobile Frontend**: React Native + Expo — 모바일 앱

## 로컬 개발 환경

`docker-compose.yml`로 실행:
- 백엔드 API: `http://localhost:18001`
- PostgreSQL: `localhost:15434`

## 공통 규칙

### 커밋 메시지
- prefix는 영어: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- 본문은 한국어 허용
- 예: `feat: 타임랩스 생성 API 추가`

### 코드 수정 범위
- 다른 영역의 코드를 수정하지 않는다
- 백엔드 작업 → `backend/` 디렉토리만 수정
- 웹 프론트 작업 → `frontend/web/` 디렉토리만 수정
- 모바일 프론트 작업 → `frontend/mobile/` 디렉토리만 수정
- 공유 타입/상수가 필요하면 → `frontend/packages/shared/` 수정 가능

## 서브에이전트 지침

각 영역별 CLAUDE.md를 참조:
- `backend/CLAUDE.md` — 백엔드 컨벤션, 빌드/테스트 명령어
- `frontend/web/CLAUDE.md` — 웹 프론트 컨벤션, 빌드/테스트 명령어
- `frontend/mobile/CLAUDE.md` — 모바일 프론트 컨벤션, 빌드/테스트 명령어

서브에이전트는 자신의 영역 CLAUDE.md에 정의된 명령어와 컨벤션을 따른다.
