# Backend — Study Timelapse API

## 기술 스택

- Python 3.12, FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic, FFmpeg

## 디렉토리 구조

```
backend/
├── app/
│   ├── api/v1/          # API 라우트
│   ├── services/        # 비즈니스 로직
│   ├── models/          # SQLAlchemy 모델
│   ├── schemas/         # Pydantic v2 스키마
│   ├── repositories/    # DB 접근 계층
│   ├── config.py        # Settings 클래스 (환경변수)
│   ├── database.py      # DB 연결
│   ├── dependencies.py  # FastAPI 의존성
│   ├── exceptions.py    # AppError 계층
│   └── main.py          # 앱 진입점
├── tests/               # pytest 테스트
├── alembic/             # DB 마이그레이션
└── uploads/             # 업로드 파일 저장
```

## 명령어

```bash
# 개발서버
cd backend && source .venv/bin/activate && fastapi dev app/main.py --reload

# 테스트
cd backend && pytest --tb=short -q

# 린트
cd backend && ruff check .

# 린트 자동수정
cd backend && ruff check --fix .

# DB 마이그레이션 적용
cd backend && alembic upgrade head

# 새 마이그레이션 생성
cd backend && alembic revision --autogenerate -m "설명"
```

## 코딩 컨벤션

- **line-length**: 100
- **ruff 룰**: E, F, I, N, UP, B
- **비동기 패턴**: async/await 사용, 동기 DB 호출 금지
- **API 라우트**: `app/api/v1/`에 추가 → `router.py`에 등록
- **서비스 로직**: `app/services/`에 분리
- **에러 처리**: `app/exceptions.py`의 AppError 상속 (NotFoundError, UnauthorizedError 등)
- **스키마**: Pydantic v2 모델 (`app/schemas/`)
- **환경변수**: `app/config.py`의 Settings 클래스

## 테스트

- pytest + pytest-asyncio
- asyncio_mode="auto"

## 주의사항

- task_store/file_store는 인메모리 — 서버 재시작 시 초기화됨
- FFmpeg 명령은 `asyncio.create_subprocess_exec` 사용
- 업로드 파일: UUID 기반 네이밍
