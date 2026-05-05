---
id: plan-01
type: plan
title: 녹화 파이프라인 로드맵 — Phase 분해 및 마일스톤
status: draft
created: 2026-05-03
updated: 2026-05-04
status_note: "Phase 0 완료(2026-05-03). 2026-05-04 D-PLAN-7~10 반영: 패러다임 전환(연속녹화→프레임샘플링), Phase 2(오버레이 재설계) Phase 1 흡수 후 폐기, Phase 4(Android) 노력 규모 ↓. 2026-05-04 추가: T-010 워커가 자체 AVCaptureSession 작성 → VisionCamera 와 카메라 점유 충돌 발견 → T-010-fix1 회수, adr-09-camera-integration 신설 후 spec-02 patch 예정."
sources:
  - "[[planning-01-recording-pipeline]]"
tags: [plan, recording, timelapse, overlay, pipeline, mobile, roadmap]
---

# 녹화 파이프라인 로드맵 — Phase 분해 및 마일스톤

## Summary

`planning-01` 의 D-PLAN-1~10 합의를 기반으로, 녹화→타임랩스→저장 파이프라인을 3개 활성 Phase 로 분해한다.

**현재 plan 범위 정의**:
- **결제·구독 시스템 (Free/Pro 가드)**: 별도 `plan-NN-monetization` 으로 분리. 본 plan 은 Pro 기본 가정 + TODO 주석.
- **녹화 패러다임**: 연속 녹화 (D-PLAN-8 이전) 가 아닌 **프레임 샘플링** + capture-time 오버레이 burn-in.
- **음성**: 미포함 (D-PLAN-7).

---

## 1. Phase 분해

| Phase | 목표 (한 줄) | 핵심 산출물 (후속 spec/policy/adr) | 코드 영향 영역 | 의존성 |
|---|---|---|---|---|
| **Phase 0** — 즉시 정리 ✅ 완료 | D-PLAN-2 (비율 통일) + D-PLAN-6 (세션 단일화) | adr-01-aspect-ratio-unify ✅, adr-02-session-update-policy ✅ | backend/api ✅, mobile-fe ✅ | 없음 |
| **Phase 1** — 파이프라인 재설계 + hardening | 프레임 샘플링 native 모듈 신규 작성 + 음성 제거 + 캡처 schedule + 백그라운드/정지 UX + 캐시 lifecycle + 최소 녹화 가드 | spec-01, spec-02, policy-01, adr-04, adr-05, adr-06, adr-07 | mobile-fe (focus/generating/saving + Swift module 전면 재작성), shared-fe (User placeholder 필드), backend/api (minor) | Phase 0 완료 |
| **Phase 2** — Android 이식 (구 Phase 4) | D-PLAN-5: Camera2 + MediaCodec + MediaMuxer 로 native 모듈 이식 | spec-03-android-pipeline | mobile-fe (Android native module) | Phase 1 완료 |

> **(deferred) plan-NN-monetization**: Free/Pro 결제 시스템. Phase 1 완료 후 본 plan 과 독립 병렬 가능.
> **(흡수됨) 구 Phase 2 (오버레이 재설계)**: D-PLAN-8 프레임 샘플링 채택으로 capture-time overlay burn-in 패턴이 됨 → WYSIWYG 자동 보장. 별도 phase 불필요, Phase 1 내 산출물로 흡수.

### Phase 조정 사유

- **Phase 0 분리 → 완료**: 백엔드 비율 1줄 + saving updateSession 단일화. regression 기준선 확보됨.
- **구 Phase 2 흡수**: 프레임 샘플링은 캡처된 이미지에 직접 오버레이 burn-in. preview ↔ 저장본 픽셀 차이 자체가 발생할 수 없음 (PLAN-001 fontSize 이슈 본질 해결). 별도 overlay phase 불필요.
- **Phase 1 노력 규모 M → L**: native 모듈 ~1,027줄 폐기 + 신규 ~300~400줄 작성 + 음성 제거 + schedule 함수 + 정지 UX + 백그라운드 핸들러 + 캐시 lifecycle 다 포함.
- **Phase 2 (구 4) 노력 규모 L → M**: 새 native 모듈이 단순 (~300~400줄) → Android Camera2/MediaCodec 이식 부담 ↓.
- **결제 분리 사유**: 결제 도메인이 파이프라인 안정화와 직교. RevenueCat 도입 결정 등 별도 의사결정 필요.

---

## 2. 의존성 그래프

```
Phase 0 (완료) ─ 즉시 정리
  │
  ▼
Phase 1 ─ 파이프라인 재설계 + hardening
  │  [native 재작성 + schedule + 백그라운드 + 캐시 + 정지 UX]
  ▼
Phase 2 ─ Android 이식
  │  [Camera2 + MediaCodec + MediaMuxer]
  ▼
(별도) plan-NN-monetization  ← Phase 1 완료 후 독립 병렬 가능
```

**병렬 가능 여부**:
- Phase 1 내부에서 spec/policy/adr 작성 (planning 워커) 과 native 모듈 prototype (mobile-fe 워커) 은 spec 윤곽 잡힌 후 부분 병렬 가능.
- Phase 1 완료 후 Phase 2 (Android) 와 결제 plan 은 완전 독립 병렬.

---

## 3. Phase 별 후속 산출물 매핑

| Phase | 후속 문서 | 설명 |
|---|---|---|
| Phase 0 ✅ | `adr-01-aspect-ratio-unify` | 4:5 통일 결정 (D-PLAN-2) |
| Phase 0 ✅ | `adr-02-session-update-policy` | saving 단일 PATCH (D-PLAN-6) |
| Phase 1 | `spec-01-recording-state-machine` | focus → 캡처 → stitch → saving 상태 전이, 실패 모드, 백그라운드 동작 (D-PLAN-7 백그라운드 정책 포함) |
| Phase 1 | `spec-02-capture-pipeline` | 프레임 샘플링 native 모듈 인터페이스 (캡처 timer + 이미지 오버레이 + AVAssetWriter stitch) — D-PLAN-8/D-PLAN-9 구현 명세 |
| Phase 1 | `policy-01-resource-budget` | 녹화 4시간 cap (D-PLAN-1), 최소 10초 (D-PLAN-10), 캐시 디스크 한도, 인터벌 floor 100ms |
| Phase 1 | `adr-04-recording-paradigm` | D-PLAN-7+8+9 결정 통합 기록 (음성 미포함 + 프레임 샘플링 + native 유지). 통합 ADR 또는 분리 검토 |
| Phase 1 | `adr-05-capture-schedule-function` | D-PLAN-10 의 정확한 함수 형태 결정 (sqrt vs power vs log) |
| Phase 1 | `adr-06-background-recording-policy` | 백그라운드 진입 시 정지 + idle timer 비활성 + 알림 (T-007 Q2: C+A) |
| Phase 1 | `adr-07-stop-confirmation-ux` | D-PLAN-10 정지 UX (인디케이터 + 모달 A+B) |
| Phase 1 | `adr-08-cache-lifecycle` | 캡처 프레임 / stitched MP4 생성→삭제 시점 (✅ accepted, 5분 TTL) |
| Phase 1 | `adr-09-camera-integration` | **🆕 카메라 점유 통합 패턴** — VisionCamera frame processor plugin (자체 AVCaptureSession 폐기). T-010-fix2 의 근거 (2026-05-04 추가) |
| Phase 2 | `spec-03-android-pipeline` | Android Camera2 + MediaCodec + MediaMuxer 이식 명세 |

ADR 번호 (04~09) accepted 상태. spec-02 patch 는 adr-09 합의 후 진행.

---

## 4. Pro-기본 가정 + 가드레일 주석 정책

본 plan 은 결제 가드 없이 진행한다. 다음 규칙으로 코드를 작성한다:

### 4-1. 동작 (현재 plan)
- **워터마크**: 토글로 사용자가 표시/제거 선택 가능 (제거 기본 또는 표시 기본은 spec-02 에서 결정)
- **Progress bar 오버레이**: 옵션에서 자유롭게 선택 가능 (자물쇠 X)
- **일일 사용 한도**: 무제한
- **Paywall 화면**: 진입 경로 막아두거나 placeholder. 결제 plan 활성화되면 라우팅 활성화.

### 4-2. 가드레일 자리 주석 규칙

```ts
// TODO(monetization): if (!user.is_pro) → paywall; 본 plan 에서는 Pro-default 로 통과.
```

| 영역 | 위치 | 주석 내용 |
|---|---|---|
| mobile-fe | result.tsx — Progress bar 옵션 | "if (!user.is_pro) Progress bar 자물쇠 표시" |
| mobile-fe | result.tsx — 워터마크 토글 | "if (!user.is_pro) 토글 비활성, 강제 표시" |
| mobile-fe | saving.tsx — 저장 시작 직전 | "if (!user.is_pro && dailyCount >= 1) 한도 안내" |
| mobile-fe | paywall.tsx | "결제 플로우 placeholder" |
| backend/api | sessions.py — createSession 직전 | "Pro 검증/일일 카운트 미들웨어 추가 자리" |
| backend/api | users 모델 | "is_pro / pro_until 필드 자리. 현재는 항상 true 가정." |

### 4-3. user 정보 처리

- `getMe` 응답에 `is_pro: boolean`, `pro_until: timestamp | null` 필드를 **미리 추가** (백엔드: 항상 `true / null` 반환).
- `daily_quota_used: number`, `daily_quota_limit: number | null` 도 자리 추가 (현재는 `0 / null`).
- shared-fe 의 User 타입에도 같이 추가.
- 결제 plan 시작 시 mobile UI 코드 변경 없이 backend 로직만 바꾸면 활성화.

---

## 5. 마일스톤 / 우선순위

| Phase | 우선순위 | 노력 규모 | 비즈니스 가치 | 블로킹 위험 |
|---|---|---|---|---|
| Phase 0 ✅ | 완료 | S (1일) | 기술 부채 해소 + regression 기준선 | — |
| Phase 1 | 🔴 최우선 | **L** (2.5~3.5주) | 데이터 손실 방지 + WYSIWYG 자동 보장 + 4시간 안정 처리 | 높음 — Phase 2·결제 plan 의 선행 조건 |
| Phase 2 | 🟡 보통 | **M** (1~1.5주) | Android 시장 확대 | 낮음 — Phase 1 완료 후 독립 |

### 권장 순서
```
Phase 0 ✅ → Phase 1 → (Phase 2 ‖ plan-NN-monetization)
```
예상 총 기간 (Phase 0 제외): **2.5~3.5주** (1인 기준, Phase 2·결제 plan 별도)

### Phase 1 sub-마일스톤 (참고)

Phase 1 이 큰 묶음이라 작업 순서 가이드 (순차 권장, 일부 병렬 가능):

1. **spec/policy/adr 작성** (planning 워커) — Phase 1 의 모든 spec/policy/adr 합의
2. **native 모듈 prototype** (mobile-fe) — 캡처 timer + 더미 이미지 + AVAssetWriter stitch 동작 검증
3. **음성 제거** (mobile-fe) — VisionCamera audio=false + Info.plist 마이크 권한 제거
4. **schedule 함수 구현** — adr-05 결정된 수식 native 측 구현
5. **capture-time overlay burn-in** — 캡처 이미지에 워터마크/타이머/progress/streak 그리기
6. **백그라운드 핸들러 + idle timer + AppState** (mobile-fe focus.tsx)
7. **정지 UX** — 인디케이터 + 정지 모달 (D-PLAN-10)
8. **캐시 lifecycle** — saving 완료 후 캡처 프레임 정리, generating 실패 시 보존 정책
9. **최소 녹화 시간 가드** — 10초 미만 정지 시 안내
10. **Pro 가드레일 TODO 주석** — §4-2 의 6개 위치
11. **shared-fe User 타입 확장** — placeholder 필드
12. **backend user 모델 placeholder** — is_pro/pro_until/daily_quota 필드 추가, 항상 true 반환

---

## 6. 4 코드 영역별 영향 요약

| Phase | backend/api | frontend/mobile-fe | frontend/shared-fe | frontend/web-fe |
|---|---|---|---|---|
| Phase 0 ✅ | ○ `VALID_ASPECT_RATIOS` 4:5 통일 | ○ `saving.tsx` updateSession 단일화 | × | × |
| Phase 1 | ○ user 모델 placeholder 필드 (is_pro/pro_until/daily_quota_*), 세션 status 확장 | ○ **Swift `TimelapseCreatorModule.swift` 전면 재작성** (~1027 → ~350줄), `focus.tsx` 음성 제거 + AppState + idle timer + 정지 UX, `generating.tsx` 에러 핸들러, `saving.tsx` 캐시 정리, **+ Pro 가드 TODO 주석**, `Info.plist` iOS 16 + 마이크 권한 제거 | ○ User 타입에 placeholder 필드 추가, overlayLayout 타입 정리 (capture-time burn-in 기준) | × |
| Phase 2 | × | ○ Android `TimelapseCreatorModule.kt` 신규 (Camera2 + MediaCodec + MediaMuxer) | × | × |

> 결제 plan 의 영향은 별도 `plan-NN-monetization` 에서 정의.

---

## 7. 결정 이력

### 결정 출처

본 plan 은 `planning-01-recording-pipeline.md` 의 D-PLAN-1~10 합의에 근거. plan 단계 자체 결정 (D-PLAN-7~9 plan 내부) 도 별도 표기.

### plan 내부 결정 (이력)

| ID | 결정 | 상태 |
|---|---|---|
| plan §D-1 | Phase 순서 = Phase 0 → 1 → 2 (구 4) → 결제 plan 별도 | ✅ 합의 (2026-05-03, 구 D-PLAN-7) |
| plan §D-2 | 구 Phase 2 (오버레이 재설계) 폐기 후 Phase 1 흡수 | ✅ 합의 (2026-05-04) — D-PLAN-8 프레임 샘플링 채택으로 자동 해소 |
| plan §D-3 | 결제 plan 분리 — RevenueCat 등 IAP 결정 별도 | ✅ 합의 (2026-05-03, 구 D-PLAN-9) |

### planning 측 결정 인용

| planning ID | 결정 | plan 영향 |
|---|---|---|
| D-PLAN-1 | 4시간 cap 유지 | policy-01 항목 |
| D-PLAN-2 | 4:5 비율 통일 | Phase 0 완료 |
| D-PLAN-3 | 출력 5~120초 8개 | spec/policy 입력 |
| D-PLAN-4 | 월 구독 Free/Pro | 결제 plan 으로 이관 |
| D-PLAN-5 | iOS 우선, Android Phase 2 | Phase 분해 그대로 |
| D-PLAN-6 | saving 단일 PATCH | Phase 0 완료 |
| **D-PLAN-7** | **음성 미포함** | **Phase 1: focus.tsx audio=false + Info.plist 마이크 권한 제거** |
| **D-PLAN-8** | **프레임 샘플링 패러다임** | **Phase 1: native 모듈 전면 재작성. 구 Phase 2 흡수.** |
| **D-PLAN-9** | **Native 모듈 유지 (재작성)** | **Phase 1: capture/draw/stitch 모두 native** |
| **D-PLAN-10** | **캡처 schedule 동적 함수 + 정지 UX** | **Phase 1: schedule 함수 (수식은 adr-05) + 인디케이터 + 정지 모달** |

---

## 8. 비목표 (Out of Current Scope)

본 plan 에서 **다루지 않는** 것 (별도 plan 또는 future):

- 결제·구독 시스템 (영수증 검증, 갱신, 유예, paywall UX, RevenueCat vs 직접 구현) → `plan-NN-monetization`
- Free 사용자 가드레일 (Progress bar 자물쇠 UI, 일일 한도 안내, 워터마크 강제) → 결제 plan 활성화 시
- i18n (KO/ZH/JA/EN/ES) → 별도 planning/spec 필요
- 공부 통계 대시보드 상세 → 별도 planning
- 클라우드 저장/공유, 트리밍/필터/음악 추가 등 편집 기능
- 운영 DB 의 기존 4:3 row 마이그레이션 (Phase 0 ADR 의 follow-up 로 명시됨)
