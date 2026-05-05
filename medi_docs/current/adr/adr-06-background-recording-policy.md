---
id: adr-06
type: adr
title: 백그라운드 녹화 정책 — iOS 제약 하에서의 UX 처리
status: accepted
created: 2026-05-04
updated: 2026-05-04
sources:
  - "[[plan-01-recording-pipeline-roadmap]]"
  - "[[planning-01-recording-pipeline]]"
depends_on:
  - "[[adr-04-recording-paradigm]]"
tags: [adr, background, recording, ios, ux, mobile]
---

# 백그라운드 녹화 정책 — iOS 제약 하에서의 UX 처리

## Summary

**C+A 조합 채택 — idle timer 비활성(화면 꺼짐 방지) + 백그라운드 진입 시 자동 정지 + 사용자 안내.** iOS 일반 앱 entitlement 범위 내에서 데이터 무결성을 보장하는 최선.

---

## Context

iOS 카메라 제약:
- `AVCaptureSession`은 앱이 백그라운드로 전환되면 기본 중단
- 화면 잠금 시에도 중단
- `multitasking-camera-access` entitlement: 화상회의·보안 카메라 전용, Apple이 일반 앱에 미제공 → App Store 심사 탈락 위험

현재 코드 문제 (`reports/PLAN-002-T-007-product-planner.md` §3-1):
- `focus.tsx`: `AppState` listener **없음** — 백그라운드 전환 감지 미구현
- `focus.tsx`: idle timer 비활성 **없음** — 녹화 중 화면 자동 꺼짐 시 카메라 중단
- `TimelapseCreatorModule.swift:490` — `isIdleTimerDisabled = true` 는 변환 중에만 적용, 녹화 중 미적용
- 결과: 백그라운드 전환 시 `isRecording = true` 유지, 타이머 계속 증가, 실제 캡처는 중단 → **데이터 불일치 UX 버그**

`planning-01 §1 E2`: "녹화 유지 또는 명확한 경고 후 정지 — 데이터 손실 없음"

---

## Options

| 안 | 동작 | iOS 가능 여부 | 구현 비용 | 사용자 영향 |
|---|---|---|---|---|
| A | 백그라운드 진입 시 즉시 정지 + 알림 | ✅ `AppState` listener | 낮음 | 명확하나 화면 꺼짐 시 중단 위험 남음 |
| B | 백그라운드에서 계속 녹화 | ❌ entitlement 미제공 | — | App Store 탈락 |
| **C+A** | idle timer 비활성(녹화 중) + 백그라운드 진입 시 자동 정지 + 안내 | ✅ | 낮음 | 화면 꺼짐 방지 + 백그라운드 전환 시 명확한 정지 |
| D | 화면 잠금 후 계속 | ❌ 물리적 불가(렌즈 차단) | — | — |

---

## Decision

**C+A 채택**

구체 구현:
```ts
// focus.tsx — 녹화 시작 시
// 1. idle timer 비활성 (react-native-keep-awake 또는 native 모듈)
activateKeepAwake();

// 2. AppState listener
useEffect(() => {
  const sub = AppState.addEventListener('change', (nextState) => {
    if (nextState !== 'active' && isRecording) {
      handleStop(); // 현재까지 캡처 보존 + 정지
      showNotification('녹화가 백그라운드 전환으로 중단되었습니다.');
    }
  });
  return () => sub.remove();
}, [isRecording]);
```

Why:
1. B/D는 iOS 정책상 구현 불가, A만으로는 화면 자동 꺼짐(idle timeout) 시 카메라 중단 방지 안 됨
2. idle timer 비활성: 공부 중 화면이 꺼지지 않아야 한다는 사용자 기대에 부합 (학습 도구 UX 표준)
3. 백그라운드 진입 시 즉시 정지 + 안내: `planning-01 §1 E2` "데이터 손실 없음" 충족 — 현재까지 캡처된 프레임은 보존하고 stitch 진행 가능
4. `multitasking-camera-access` entitlement 신청은 App Store 심사 탈락 위험. 일반 공부 앱 사용 목적으로 Apple 승인 가능성 없음.

---

## Consequences

### 구현 영향

| 항목 | 변경 내용 |
|---|---|
| `focus.tsx` | `AppState.addEventListener` 추가 — 백그라운드 전환 시 `handleStop()` 호출 |
| `focus.tsx` | 녹화 시작 시 `activateKeepAwake()`, 종료 시 `deactivateKeepAwake()` |
| `Info.plist` | `UIBackgroundModes` 추가 **불필요** |
| UX 사본 | "공부 중 다른 앱으로 이동하면 녹화가 중단됩니다" — 세션 시작 전 1회 안내 또는 정지 화면에 명시 |

### 후속 작업

- `spec-01-recording-state-machine`: `active → background` 상태 전이 + `handleStop` 호출 조건 명세
- 사용자 안내 카피 / 위치는 spec-01 UX 섹션에서 결정
- E1(전화 수신) 처리: iOS `AVAudioSession` interruption → 동일한 AppState 처리로 커버 가능 여부 spec-01 에서 검토
