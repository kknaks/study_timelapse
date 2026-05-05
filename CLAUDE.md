# Study Timelapse

공부 타임랩스 생성 서비스. 사용자가 공부하는 모습을 캡처하여 타임랩스 영상으로 변환한다.

## 아키텍처

3-tier 구조:
- **Backend**: FastAPI (Python) — API 서버, FFmpeg 영상 처리
- **Mobile Frontend** (★ 주력): React Native + Expo — 모바일 앱. 본 서비스의 메인 클라이언트
- **Web Frontend** (legacy MVP): React + Vite — MVP 단계에서 만든 브라우저 버전. 장기적으로 분리/축소 가능

> **개발 우선순위: Mobile-first.** 카메라 촬영, 타임랩스 합성, 갤러리 저장 등 본질 feature 는 모바일에서 일어남. Web 은 MVP 단계 산물이며 현재는 보조. 신규 feature 는 mobile 부터 설계/구현, web 은 필요시 후속.

> **공유 패키지 (`frontend/packages/shared/`):** MVP 시점에 web/mobile 양쪽에서 import 의도였으나, 현재는 web 만 사용. mobile 은 자체 `src/types/` 보유. mobile-shared 통합은 미래 부채 (web 분리 시 재검토).

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

### 문서 작업 위치
- **모든 신규 문서는 `medi_docs/current/` 에 작성한다.** 루트 (`*.md`) 나 `docs/` 에 새 문서 박지 않는다.
- **`planning/` 이 단일 진실점 (SSoT)** — 모든 다른 카테고리 (`spec`, `policy`, `plan`, `adr` 등) 는 frontmatter `sources:` 로 `planning` 문서를 root 로 두는 lineage 를 가져야 한다 (D4 룰).
- 문서 생성: `medi-new` skill 호출 (카테고리·frontmatter 자동 scaffold).
- 검증: `docs-validate` skill — `medi_docs/current/**` 변경 시 H1 hook 으로 자동 실행.
- 기존 루트 문서 (`ARCHITECTURE.md`, `PRD.md`, `API.md`, `docs/`) 는 read-only 참조 자료로 두고, 변경이 필요하면 `medi_docs/` 로 이주 후 수정한다.
- 자세한 9 카테고리 흐름은 아래 `medi_docs/ (harness plugin)` § 참조.

## 서브에이전트 지침

각 영역별 CLAUDE.md를 참조:
- `backend/CLAUDE.md` — 백엔드 컨벤션, 빌드/테스트 명령어
- `frontend/web/CLAUDE.md` — 웹 프론트 컨벤션, 빌드/테스트 명령어
- `frontend/mobile/CLAUDE.md` — 모바일 프론트 컨벤션, 빌드/테스트 명령어

서브에이전트는 자신의 영역 CLAUDE.md에 정의된 명령어와 컨벤션을 따른다.
<!-- medi-docs-managed:start v=0.1.2 -->
## medi_docs/ (harness plugin)

이 프로젝트의 docs 는 `medi_docs/current/` 의 9 카테고리에 정형화되어있다.

**진입점**: `medi_docs/planning/` 부터 읽고 frontmatter `sources:` 그래프 따라 내려간다. 관계 그래프는 `medi_docs/current/_map.md`.

**9 카테고리**: `planning` (무엇을) → `plan` (언제·어떻게) → `spec/policy` (명세·정책) → `adr` (결정) → `runbook` `test` `release-notes` `retrospective`.

**버전 모델**: `current/` = 살아있는 작업 + `v{label}/` = cut 시점 박제 (read-only).

**SKILLs (자연어 호출 — description-trigger)**:
<!-- medi-docs-managed:skill-list:start -->
- `api-design` — 신규·수정 API 엔드포인트의 *구현 전* 설계 합의 — 5 단계 절차 (충돌 점검 → ERD/DB 정합 → Request/Response → ...
- `code-review` — 백엔드 변경분의 컨벤션 준수 + 설계 적정성 + 줄단위 보안/성능 점검을 4단계로 검토하고 심각도 5분류 (🔴blocking/🟡important...
- `docs-validate` — medi_docs/current/ 의 frontmatter (R4-R9 최소셋) + 관계 (D4 lineage 필수) 검증 + _map
- `medi-new` — medi_docs/current/ 의 9 카테고리 중 하나에 새 문서를 박는다
- `medi-version-cut` — medi_docs/current/ 전체를 v{label}/ 으로 박제 (read-only 스냅샷)
- `refactor-layered` — 라우터 1 개 단위 4 계층 (Router/Service/Repository/Schema) 정렬 리팩토링
- `tdd-cycle` — 테스트 주도 개발 Red→Green→Refactor 3 단계 루프
- `test-design` — 백엔드 신규 도메인·API 의 테스트 설계 단계 (구현 전) 산출물을 합의 가능한 정형 리포트로 만든다 — 의도 표현 원칙·3계층 docstri...
<!-- medi-docs-managed:skill-list:end -->

**자동 hook**:
- `medi_docs/current/**` 변경 시 frontmatter + 관계 자동 검증 (H1).
- 신규 세션 진입 시 `medi_docs/` 부재면 scaffold 안내 (H2).

**강제 룰**:
- D1 (cut 직전 검증) — `current/` 전체가 frontmatter 통과해야 cut 가능.
- D4 (lineage 필수) — 비-`planning` 문서는 `sources:` 최소 1개 필수.

(이 섹션은 harness plugin 이 자동 박음 + 갱신. 마커 외부 내용은 보존됨.)
<!-- medi-docs-managed:end -->
