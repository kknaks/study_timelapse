---
id: tech-debt
type: index
title: Tech Debt 인덱스
status: living
created: 2026-05-05
updated: 2026-05-05
tags: [tech-debt, index]
---

# Tech Debt 인덱스

의도적으로 *현재는* 보류한 항목. 일반 task 와 분리.

검증 시점 — phase 종료, 사용자 컴플레인, 외부 트리거 (e.g., 다른 디바이스 비율) 마다 이 doc 한 번 검토.

각 항목 schema: `id, title, status, severity, trigger, fix_path, related`.

---

## D1 — RN preview vidW < 화면 폭

- **status**: open
- **severity**: low (현재 시각 부조화 미미)
- **created**: 2026-05-05 (Phase 1 본질 종료 시점)

### 현상
`result.tsx` 의 RN preview 박스가 화면 폭 100% 가 아닌 ~73% (iPhone 14 Pro 기준 vidW=287pt). `vidH = vidW / (9/16) = 698pt > areaH(~510pt)` 이라 swap 발동:
```
let vidW = areaW;
let vidH = areaW / ratio;
if (areaH > 0 && vidH > areaH) {
  vidH = areaH;
  vidW = areaH * ratio;  // ← swap
}
```

결과: preview 박스가 화면 폭보다 좁음. 사진첩 final 영상은 화면 폭 100% 표시 → 동일 overlay 가 preview 에서 절대 사이즈로 더 작게 보임.

`buildScaledLayout(vidW)` 로 overlay 가 박스에 비례 스케일이라 *각자 캔버스에 같은 비율* 은 보장 (시각 부조화 거의 없음). 다만 preview 와 final 을 같은 화면에서 비교하면 절대 사이즈 차이 존재.

### 보류 사유
- 현재 시각 부조화 사용자 인지 안 됨 (native 측 logo aspect / NSShadow fix 후)
- Fullscreen 으로 늘리면 layout 재설계 필요 (bottom card 가 영상 위 overlay 형태로 변경) → UX 변경 비용
- preview 와 final 각자 안에서 비례는 정확

### 트리거 (언제 갚나)
- 사용자 컴플레인 재발 (preview vs final 비교 시 부조화 호소)
- Phone 비율 다양 테스트 시 어느 디바이스에서 vidW 가 너무 좁아 overlay 가 무리해 작아지는 케이스 발견
- Phase 2 (Android 이식) 시 layout 재설계 같이

### Fix 방향
- previewArea 를 absolute fullscreen, bottomCard 를 `position: 'absolute', bottom: 0` overlay
- 9:16 비율 유지 위해 vidW = full screen width 강제, vidH 가 areaH 초과해도 OK
- 또는 화면 비율 맞춤 — vidH = full, vidW = vidH × ratio (현 swap 동작 유지하되 chrome 줄여서 vidW 가 화면 폭에 가깝도록)

### Related
- `frontend/mobile/app/result.tsx` (vidW 계산부)
- `frontend/mobile/src/constants/overlayLayout.ts` (`buildScaledLayout`)
- spec-01 D-SPEC-1-1 (preview = raw 영상 + RN 오버레이 시뮬)

---

## D2 — backend `pyproject.toml` ↔ `requirements.txt` 분기

- **status**: open
- **severity**: low (운영 빌드는 requirements.txt 기준이라 영향 없음)
- **created**: 2026-05-05 (T-018 dead code 정리 시 워커가 언급)

### 현상
`backend/pyproject.toml` 의 dependencies 와 `requirements.txt` 가 **완전히 일치하지 않음**.

워커 보고 (T-018) 인용:
> `.venv` 가 Python 3.9→3.13 으로 재생성된 상태에서 requirements.txt 패키지(PyJWT, google-auth 등) 가 미설치 상태였음. uv pip install -r requirements.txt 로 복구. pyproject.toml 에 이 의존성들이 누락되어 있음.

즉 일부 패키지가 `requirements.txt` 에만 있고 `pyproject.toml` 에 없음. 결과:
- `uv sync` 또는 `pip install -e .` 만으로는 PyJWT/google-auth 미설치
- `pip install -r requirements.txt` 별도 실행 필요
- 두 파일 동기화 책임자 불명 (수동 sync)

### 보류 사유
- Docker build (운영) 는 `pip install -r requirements.txt` 사용 → 영향 없음
- 로컬 dev 환경에서만 hassle (`uv run` 시 추가 설치 필요)
- 진짜 fix 는 둘 중 하나로 통일:
  - `pyproject.toml` 만 사용 → `requirements.txt` 제거 + Dockerfile 도 `pyproject` 기반으로
  - 또는 `pip-compile` / `uv lock` 로 한 쪽이 진짜 source, 다른 쪽이 lockfile 형태

### 트리거
- 새 contributor 가 dev 환경 셋업 시 헷갈리는 케이스 빈번해지면
- `uv` 로 표준화하기로 결정하면

### Fix 방향 (제안)
- `uv` 채택: `pyproject.toml` 을 single source 로, `uv lock` 으로 `uv.lock` 생성, Dockerfile 도 `uv sync` 사용
- 또는 `pip-tools`: `pyproject.toml` 입력 → `pip-compile` 로 `requirements.txt` 자동 생성

### Related
- `backend/pyproject.toml`
- `backend/requirements.txt`
- `backend/Dockerfile`

---

## (미사용)

향후 부채 추가 시 위 형식 따라 D3, D4, ... 로 누적.
