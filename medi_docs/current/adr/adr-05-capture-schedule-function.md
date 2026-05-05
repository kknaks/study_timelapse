---
id: adr-05
type: adr
title: 캡처 스케줄 함수 — Linear vs Sqrt vs 기타
status: accepted
created: 2026-05-04
updated: 2026-05-04
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
  - "[[planning-01-recording-pipeline]]"
depends_on:
  - "[[adr-04-recording-paradigm]]"
related_to:
  - "[[adr-07-stop-confirmation-ux]]"
  - "[[adr-08-cache-lifecycle]]"
tags: [adr, recording, capture, schedule, timelapse, mobile]
---

# 캡처 스케줄 함수 — Linear vs Sqrt vs 기타

## Summary

**Sqrt 스케줄 채택.** `schedule(t) = ceil(N_total × √(t / goalSec))` — 초반 집중 캡처·후반 여유 + 종점 정확 + 짧은 녹화 보호를 수식 1줄로 만족.

---

## Context

`adr-04`에서 프레임 샘플링 패러다임 채택. 이제 캡처 타이머가 **언제** 각 프레임을 찍을지를 결정하는 스케줄 함수가 필요.

입력 변수:
- `goalSec`: 사용자가 설정한 목표 공부 시간 (초)
- `outputSec`: 타임랩스 출력 길이 (초)
- `outputFps`: 출력 영상 프레임레이트 (기본 30fps)
- `N_total = outputSec × outputFps`: 총 필요 캡처 수 (예: 60초×30fps = 1,800장)

요구사항 — 스케줄 함수가 만족해야 하는 6 보장 속성:
1. **입력 의존**: goalSec / outputSec / outputFps 에 자동 적응
2. **종점 정확**: t = goalSec 시점에 정확히 N_total 장 캡처 완료
3. **단조 증가**: `t1 < t2 → schedule(t1) ≤ schedule(t2)`
4. **짧은 녹화 보호**: 초반에 캡처 밀도가 높아 조기 정지해도 어느 정도 프레임 확보
5. **연속**: 경계 없는 수식 (계단식 lookup 테이블 불필요)
6. **인터벌 floor 별도 가드**: 100ms 미만 인터벌은 별도 하드 제한 (함수 본체 밖)

---

## Options

| 안 | 수식 | 초반 밀도 | 짧은 녹화(30초/4h) | 종점 정확 | 단조 | 구현 복잡도 |
|---|---|---|---|---|---|---|
| **A. Linear** | `schedule(t) = ceil(N_total × t / goalSec)` | 균등 | 4장 (취약) | ✅ | ✅ | 낮음 |
| **B. Sqrt** | `schedule(t) = ceil(N_total × √(t / goalSec))` | 높음 | 22장 (보호) | ✅ | ✅ | 낮음 |
| **C. Power(α)** | `schedule(t) = ceil(N_total × (t/goalSec)^α)` | α에 의존 | α=0.5 시 B와 동일 | ✅ | ✅ | 낮음 (α 고정 시 B와 동일) |
| **D. Log** | `schedule(t) = ceil(N_total × log(1+t/goalSec)/log(2))` | 매우 높음 | 높음 | ✅ (보정 필요) | ✅ | 중간 |
| **E. 계단식 lookup** | 손튜닝 테이블 | 설계에 의존 | 설계에 의존 | 별도 보정 | 설계에 의존 | 높음 |

**짧은 녹화 보호 비교 (4시간 설정, 30초 정지 시 캡처 장수)**:
- A(Linear): 30/14400 × 1800 ≈ **4장**
- B(Sqrt): √(30/14400) × 1800 ≈ **22장**

---

## Decision

**B 채택 — Sqrt 스케줄**

**수식**:
```
# 시각 t에서의 누적 캡처 목표
schedule(t) = ceil(N_total × √(t / goalSec))
  where N_total = outputSec × outputFps

# N번째 캡처가 발생해야 하는 시각
t_N = goalSec × (N / N_total)²

# 인터벌 (N → N+1 사이)
interval_N = t_{N+1} - t_N = goalSec × ((N+1)² - N²) / N_total²
           = goalSec × (2N+1) / N_total²
```

**인터벌 floor 가드**: `max(interval_N, 100ms)` — 메모리·IO 보호. 함수 본체 밖에서 clamp.

Why:
1. 수식 1줄로 6 보장 속성 모두 만족
2. "초반 자주, 후반 띄엄" 이라는 사용자 직관과 일치 (초반 공부 시작·설정·집중 장면 보존)
3. C(Power α)는 α=0.5 고정 시 B와 동일 — 일반화 불필요
4. D(Log)는 t → goalSec 구간에서 포화(saturation) → 후반 캡처 밀도 0 수렴, 오버슈팅 보정 필요
5. E(lookup)는 입력 조합마다 재튜닝 필요 → 확장성 없음

**α 값 고정**: 현재 0.5. 추후 사용자 피드백으로 0.3~0.7 범위 조정은 spec 단계에서 정책화.

---

## Consequences

### 구현 영향

| 항목 | 내용 |
|---|---|
| Native 모듈 캡처 타이머 | `t_N = goalSec × (N / N_total)²` 로 다음 캡처 시각 계산 후 타이머 예약 |
| 인터벌 floor | `max(interval_N, 0.1초)` 하드 제한 |
| 종점 보정 | `t = goalSec` 도달 시 `schedule()` 결과가 `N_total` 이 되도록 ceil 보장 |
| 조기 정지 | 정지 시점의 `schedule(elapsed)` 값이 실제 캡처 완료 장수 → adr-07 인디케이터 계산에 사용 |

### 후속 작업

- `spec-02-capture-pipeline`: 정확한 인터벌 계산식·floor 가드·종점 보정 구현 명세
- `policy-01-resource-budget`: N_total 상한 정의 (디스크 예산 제한)
- `adr-07-stop-confirmation-ux`: 정지 시 예상 결과 길이 = `schedule(elapsed) / outputFps`
