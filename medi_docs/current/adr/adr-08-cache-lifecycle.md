---
id: adr-08
type: adr
title: 캐시 파일 생명주기 — 캡처 프레임 / Stitch MP4 정리 시점
status: accepted
created: 2026-05-04
updated: 2026-05-04
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
  - "[[planning-01-recording-pipeline]]"
depends_on:
  - "[[adr-04-recording-paradigm]]"
related_to:
  - "[[adr-05-capture-schedule-function]]"
tags: [adr, cache, lifecycle, storage, mobile, ios]
---

# 캐시 파일 생명주기 — 캡처 프레임 / Stitch MP4 정리 시점

## Summary

**D안 권장 — saving 완료 즉시 stitch MP4 정리 + 캡처 프레임은 5분 재시도 윈도우 후 자동 삭제.** 재시도 가능성과 디스크 자동 회수의 균형.

> **상태: ✅ accepted (2026-05-04 사용자 합의 — 5분 TTL 채택)**

---

## Context

`adr-04` 채택(프레임 샘플링)으로 생성되는 캐시 파일:

| 파일 종류 | 4시간 녹화 기준 크기 | 생성 시점 |
|---|---|---|
| 캡처 프레임 (JPEG) | ~1.8GB (1800장 × ~1MB) | focus 녹화 중 |
| Stitch MP4 | ~50~150MB | generating 완료 시 |

현재 코드 cleanup 현황:
- `FileSystem.deleteAsync` / `FileSystem.delete` 호출: **없음** (T-006 리포트 및 코드 확인)
- 결과: 세션마다 캐시 누적 → 디스크 부족(E3 시나리오) 직접 유발

결정이 필요한 두 가지:
1. **언제** 캡처 프레임을 삭제할 것인가
2. **언제** Stitch MP4를 삭제할 것인가

관련 시나리오:
- `planning-01 §1 E3`: 녹화 중 디스크 부족 → 경고 + 현재까지 녹화본으로 타임랩스 생성 가능
- `planning-01 §1 E5`: generating 중 강제 종료 → 재진입 시 복구 불가 안내 (현재 캐시 경로 유실)
- `planning-01 §3 신뢰성`: "녹화본은 saving 완료 전까지 삭제되지 않는다"

---

## Options

| 안 | 캡처 프레임 삭제 시점 | Stitch MP4 삭제 시점 | 재시도 | 구현 복잡도 |
|---|---|---|---|---|
| A | saving 완료 즉시 | saving 완료 즉시 | ❌ 불가 | 낮음 |
| B | 24h TTL (백그라운드 타이머) | saving 완료 즉시 | ✅ 24h 안에 가능 | 중간 (타이머 관리) |
| C | saving 완료 즉시 정리 + generating 실패 시 캡처 보존 (resume 기능) | saving 완료 즉시 | ✅ resume 화면 구현 시 | 높음 (resume UI+로직) |
| **D** | **saving 완료 즉시 stitch 삭제. 캡처 프레임은 5분 TTL 후 자동 정리** | saving 완료 즉시 | ✅ 5분 안에 가능 | 낮음~중간 |

---

## Decision (권장)

**D 권장 — saving 완료 즉시 stitch MP4 삭제 + 캡처 프레임 5분 TTL**

Why:
1. **A 탈락**: generating 실패 후 재시도 불가. `planning-01 §3` "녹화본은 saving 완료 전까지 삭제 안 됨"과 충돌. stitch 실패 시 4시간치 캡처를 다시 찍어야 함 → 치명적 UX 손실.
2. **B 탈락**: 24h 캡처 파일 유지 = 최대 1.8GB 누적. 여러 세션이면 디스크 포화 위험. E3 시나리오 악화.
3. **C 탈락**: resume 기능은 별도 상태머신 + UI 구현 필요 → Phase 1 범위 초과. 향후 검토 가능.
4. **D 채택**: stitch는 saving 직후 불필요(갤러리에 저장됨) → 즉시 삭제. 캡처 프레임 5분 보존 = generating 재시도 가능 윈도우. 5분 후 자동 삭제로 디스크 자동 회수. 구현은 `setTimeout(deleteCaptures, 5 * 60 * 1000)` 수준.

**5분 근거**: generating(stitch) 소요 시간이 수십초 이내(adr-04 예상). 5분은 충분한 재시도 버퍼이며 디스크 점유도 짧다.

**삭제 트리거 정의**:
```
캡처 디렉토리 삭제: saving 완료 후 5분 타이머
Stitch MP4 삭제:   saving 완료 즉시 (MediaLibrary 복사 완료 후)
세션 취소(Exit):   캡처 디렉토리 + Stitch 즉시 삭제
```

> **사용자/admin 승인 필요**: 5분 TTL이 적정한가? 재시도 윈도우를 더 짧게(1분) 또는 더 길게(10분)로 조정할 수 있음.

---

## Consequences

### 구현 영향

| 항목 | 변경 내용 |
|---|---|
| `saving.tsx` | 갤러리 저장 완료 후 stitch MP4 `FileSystem.deleteAsync` 호출 |
| `saving.tsx` | 5분 타이머 설정 → `captures/` 디렉토리 전체 삭제 |
| `focus.tsx` `confirmExit` | 캡처 디렉토리 + stitch 즉시 삭제 (세션 취소) |
| 디렉토리 구조 | `cacheDirectory/session_{id}/captures/` — 세션별 독립 경로로 관리 |
| E3 시나리오 | 디스크 잔여량 모니터링 + `captures/` 누적 크기 경고 — `policy-01-resource-budget`에서 임계값 정의 |

### 후속 작업

- `policy-01-resource-budget`: 캡처 디렉토리 최대 크기 정책 + E3 경고 임계값 (디스크 여유 500MB 미만 등)
- `spec-01-recording-state-machine`: saving 완료 → cleanup 상태 전이 명세
- 재시도 UX (generating 실패 시 "다시 시도" 버튼 유지 여부) — spec-01에서 결정
