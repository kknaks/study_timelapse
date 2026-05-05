---
id: planning-01
type: planning
title: 녹화→타임랩스→저장 파이프라인 요구·시나리오·제약
status: draft
created: 2026-05-03
updated: 2026-05-04
status_note: "D-PLAN-1~6 합의 (2026-05-03). D-PLAN-4 월 구독 Free/Pro (결제 별도 plan). D-PLAN-7~10 추가 (2026-05-04): 음성 미포함 + 프레임 샘플링 + native 유지 + 캡처 schedule 동적 함수."
sources: []
tags: [planning, recording, timelapse, overlay, pipeline, mobile]
---

# 녹화→타임랩스→저장 파이프라인 요구·시나리오·제약

## Summary

공부 타임랩스의 핵심 플로우(녹화 → 타임랩스 변환 → 오버레이 합성 → 갤러리 저장)에 대한 사용자 시나리오·입출력 요구·비기능 요구·제약을 정리한다. 이 문서가 spec/adr/policy/plan 작성의 최상위 근거가 된다.

---

## 1. 사용자 시나리오

### 핵심 시나리오

| # | 시나리오 | 사용자 기대 |
|---|---------|------------|
| S1 | 공부 2시간 녹화 → 60초 타임랩스 → 갤러리 저장 → 인스타그램 공유 | 저장까지 자동 완료, 공유 버튼 1탭으로 인스타 이동 |
| S2 | 설정 시간(e.g. 45분) 경과 전 수동 정지 | **정지 전** 화면 인디케이터 + 정지 모달로 결과 영상 길이 사전 인지. 비례 짧은 출력 (D-PLAN-10) |
| S3 | 타임랩스 프리뷰 후 오버레이 스타일 바꿔서 저장 | result 화면에서 none/timer/progress/streak 중 선택 → saving으로 이동 |
| S4 | Pro 구독 사용자가 워터마크 제거 + Progress bar 오버레이 사용 | 구독 활성 동안 모든 Pro 기능 unlock |
| S5 | 무료 사용자가 Progress bar 옵션 탭 | 🔒 자물쇠 표시 + 구독 안내 화면 이동 |
| S6 | 무료 사용자가 같은 날 두 번째 저장 시도 | 일일 한도(1회/일) 도달 안내 + 구독 안내 |

### 엣지 시나리오

| # | 이벤트 | 사용자 기대 |
|---|--------|------------|
| E1 | 녹화 중 전화 수신 | 녹화 일시정지, 전화 후 resume 가능 |
| E2 | 앱이 백그라운드로 전환 | **자동 정지 + 사용자 알림 (D-PLAN-7-c). 화면 자동 꺼짐도 방지 (idle timer disabled)** — 데이터 손실 없음 |
| E3 | 녹화 중 디스크 부족 | 경고 알림 + 현재까지 캡처 프레임으로 타임랩스 생성 가능 |
| E4 | 카메라 권한 거절 | 권한 요청 화면 표시, 거절 시 세션 시작 불가 안내 (마이크 권한 불필요 — 음성 미포함) |
| E5 | 변환(generating) 중 앱 강제 종료 | 재진입 시 이전 세션 복구 불가 안내 (캐시 lifecycle 정책은 Phase 1 spec) |
| E6 | 갤러리 저장 권한 거절 | 저장 실패 안내 + 시스템 설정 이동 링크 |
| E7 | 녹화 10초 미만 즉시 종료 | 생성 불가 안내 (최소 녹화 시간 미달, §2-1 일치) |
| E8 | 네트워크 없는 환경 | 변환은 로컬이므로 동작. 세션 API 실패 시 로컬 완료 후 재시도 안내 |
| E9 | Pro 구독 만료 직후 Progress bar/워터마크 제거 사용 시도 | 만료 안내 + Free 다운그레이드 (이후 일일 1회/잠금 적용) |
| E10 | 구독 갱신 실패 (결제 카드 거절 등) | 스토어 유예 기간 정책 따름. 유예 종료 시 Free 전환. |

---

## 2. 입력·출력 요구

### 2-1. 녹화 입력

| 항목 | 현재 구현 | 목표 요구 |
|------|-----------|----------|
| 최대 녹화 시간 | 슬라이더 최대 240분(4시간) → 자동 정지 | **4시간 cap 유지** (D-PLAN-1 ✅). 프레임 샘플링 채택으로 자원 부담 적음 |
| 최소 녹화 시간 | 미정의 (0초도 가능) | **최소 10초** (E7 일치, focus.tsx 가드 추가 필요) |
| 카메라 방향 | 전면/후면 선택 (녹화 시작 전) | 현행 유지. 녹화 중 전환 불가 |
| **음성 포함** | 포함 (Vision Camera audio=true) | **❌ 미포함** (D-PLAN-7 ✅). `audio=false`. 마이크 권한 불필요 |
| **녹화 패러다임** | 연속 30fps 녹화 + scaleTimeRange 변환 | **프레임 샘플링** (D-PLAN-8 ✅). N초 인터벌 캡처 → 정적 이미지 모음 → AVAssetWriter stitch |
| 비율(aspect ratio) | 9:16/1:1/16:9/4:5/3:4 (모바일 프론트) | **4:5 통일** (D-PLAN-2 ✅, Phase 0 완료) |
| 일시정지/재개 | 지원 (연속 녹화 기준) | 프레임 샘플링: 인터벌 timer 일시정지/재개로 동작. UX 동일 |
| 정지 전 사전 안내 | 없음 | 화면 실시간 인디케이터 ("정지 시 결과 영상 약 Z초") + 정지 버튼 모달 (D-PLAN-10) |
| 캡처 schedule | 균등 인터벌 (현행 비례) | 동적 schedule 함수 (`goalSec`, `outputSec`, `outputFps` 입력) — D-PLAN-10 |
| 타이머 모드 | countdown / countup | 현행 유지 |

### 2-2. 출력 영상

| 항목 | 현재 구현 | 목표 요구 |
|------|-----------|----------|
| 출력 시간 옵션 | 5/10/15/30/45/60/90/120초 | **5~120초 8개 유지** (D-PLAN-3 ✅) |
| 출력 최소 길이 | `Math.max(1, ...)` — 1초 가능 | **`Math.max(3, ...)` — 3초 하한** (D-PLAN-9 ✅, policy-01 명문화) |
| 해상도 | 9:16→720×1280, 1:1→720×720, 16:9→1280×720, 4:5→720×900, 3:4→810×1080 | 현행 유지 |
| 비트레이트 | 고정 3.5Mbps (AVAssetExportSession) | 프레임 샘플링: AVAssetWriter outputSettings 로 동등 수준. 추후 정책화 |
| FPS | 압축비 기준 자동 조정 (15~30fps) | 출력 fps 30 고정 가능 (입력이 이미 샘플링됨). 또는 압축비 따라 24/30 |
| 형식 | MP4 (H.264, AVFoundation) | iOS: AVAssetWriter MP4. Android: MediaCodec + MediaMuxer |
| 음성 트랙 | 있음 | **없음** (D-PLAN-7) |

**캡처 인터벌 — 동적 schedule** (D-PLAN-10):

균등 인터벌 (linear) 은 짧은 녹화에 취약 (1분 정지 = 8장만 캡처). 따라서 **시간 따라 가변하는 schedule 함수** 사용:
```
schedule(t; goalSec, outputSec, outputFps) → 누적 캡처 프레임 수
보장: schedule(goalSec) = outputSec × outputFps 정확히 일치
보장: 초반 t<5% 구간에서 선형보다 빠르게 증가 (짧은 녹화 보호)
보장: 인터벌 ≥ 100ms (메모리/IO 보호)
```
정확한 함수 형태 (sqrt vs power vs log) 는 spec-01 / policy-01 결정.

짧은 녹화 처리: §1 E7 / §2-1 최소 10초 가드 + 결과 영상 길이 비례 (sqrt 등 schedule 결과). 사용자에게 정지 전 사전 안내 (인디케이터 + 모달).

### 2-3. 오버레이

| 종류 | 설명 | 위치 |
|------|------|------|
| 워터마크 (항상) | FocusTimelapse 로고+텍스트 | 좌하단 |
| timer | 경과/남은 시간 HH:MM:SS | 우상단 |
| progress | 목표 대비 진행 바 + 목표 라벨 | 우상단 |
| streak | N day(s) streak | 우상단 |
| none | 워터마크만 | — |

- **워터마크**: 무료 사용자에게 강제 표시. Pro 구독자는 제거 가능 (D-PLAN-4)
- **Progress bar**: Pro 전용. 무료 사용자에게는 자물쇠 표시 + 구독 유도 (D-PLAN-4)
- **오버레이 합성** (D-PLAN-8 패러다임 변경 후):
  - 캡처 시점에 정적 이미지(JPEG)에 직접 그려 박음 (UIGraphicsImageRenderer / Canvas)
  - 영상 stitch 후 별도 합성 패스 **없음** — WYSIWYG 자동 보장
  - result.tsx preview 의 RN 미리보기와 픽셀 정확도 차이 자동 해소 (PLAN-001 fontSize 이슈 본질 해결)

---

## 3. 비기능 요구 (정성)

### 신뢰성
- **캡처된 프레임은 saving 완료 전까지 캐시에서 삭제되지 않는다.** stitch 실패 시 원본 프레임 유지 (재시도 가능).
- 세션 API 실패는 로컬 완료를 막지 않는다. (서버 실패 → 로컬 저장 후 재시도)
- **Pro 구독 상태 / 일일 사용 카운트의 SSOT 는 서버.** 클라이언트 우회 차단 (디바이스 시간 변경, 앱 재설치 등으로 카운터 리셋 불가).
- **백그라운드 전환 = 즉시 정지 + 사용자 알림** (E2). 무성 정책으로 백그라운드 우회 트릭 (background audio modes) 도 불필요.

### 성능 (프레임 샘플링 기준 갱신)
- 1시간 녹화 → 60초 타임랩스 stitch **10초 이내** (정적 이미지 인코딩만)
- 4시간 녹화 → stitch **30초 이내** (프레임 1,800장 stitch)
- progress(%) 표시 필수 (캡처 진행률 + stitch 진행률 분리 표시 가능)
- 캡처 인터벌 timer 정확도 ±100ms 이내

### 자원 (프레임 샘플링 기준 갱신)
- 캡처 중 메모리 사용량 안정 유지 (이미지 한 장씩 디스크에 즉시 write)
- 4시간 녹화 시 캡처 프레임 누적 디스크 사용량 **~1~2GB 이내** (1,800장 × ~1MB JPEG)
- 캐시 파일(샘플링 프레임 + stitched MP4) 은 saving 완료 후 정리. 정확한 lifecycle 은 Phase 1 `policy-01-resource-budget` / `adr-03-cache-lifecycle`

### UX
- 취소는 generating 이전(focus 종료 시 확인 모달)만 가능. generating 진행 중 취소 불가.
- 에러 메시지는 **원인 + 다음 행동** 제시. "Error" 한 줄 금지.
- 재시도: 세션 API 실패는 무시하고 로컬 완료 진행. 완전 실패(generating crash)는 뒤로가기 유도.

---

## 4. 제약 / 가정

| 항목 | 현재 상태 | 제약 |
|------|-----------|------|
| 플랫폼 | iOS 구현 완료 (AVFoundation) | Android Phase 2 → D-PLAN-5 |
| 인증 | 세션 API `get_current_user` 의존 → 인증 필수 | 인증 없이는 세션 기록 불가. 타임랩스 생성 자체는 로컬이므로 인증 없이 가능하지만 streak/통계 연동 불가 |
| 인터넷 연결 | 타임랩스 변환은 완전 오프라인. 세션 기록은 온라인 필요 | 오프라인 시 타임랩스 생성 가능, 세션 기록만 실패 |
| 클라우드 저장 | 미구현 | 현재 Out of Scope |
| 최저 iOS | iOS 16 (확정) | AVFoundation `outputOrientation="preview"`. `Info.plist:LSMinimumSystemVersion` 12 → 16 갱신 필요 (Phase 1 코드 task) |
| 디바이스 사양 | iPhone 12 이상 가정 | A14 이상. 프레임 샘플링은 ~A12 도 충분 |
| 결제 모델 | (미구현) | **월 구독 (App Store In-App Purchase)**. Free/Pro 2-tier. 단건 결제 X. (별도 plan-NN-monetization) |
| Pro 상태 SSOT | (미구현) | **서버 측 영수증 검증 후 user.is_pro / pro_until 필드 보유**. 클라이언트는 캐시만. |
| 일일 사용 카운트 | (미구현) | **서버에서 user_id × 날짜 기준 카운트**. 자정 리셋 timezone 기준은 spec/policy 단계 결정. |
| **녹화 패러다임** | (변경 예정) | **프레임 샘플링** (D-PLAN-8). 연속 녹화 + scaleTimeRange 폐기 |
| **음성** | (변경 예정) | **미포함** (D-PLAN-7). VisionCamera `audio={false}`. 마이크 권한 plist 제거 |
| **Native 모듈 정책** | 1,027줄 buildTimelapse + applyOverlay | **유지하되 재작성** (D-PLAN-9). 신규 함수: 캡처 + 이미지 오버레이 + AVAssetWriter stitch. 추정 ~300~400줄 |
| 백그라운드 카메라 | iOS 정책상 일반 앱 불가 | 우회 X. 백그라운드 진입 = 즉시 정지 (E2) |
| **카메라 점유 (단일 AVCaptureSession)** | VisionCamera 가 화면 preview + capture 모두 잡음 | 자체 native 모듈이 별도 AVCaptureSession 만들면 카메라 점유 충돌 → preview 멈춤 + 캡처 실패. 캡처는 **VisionCamera frame processor plugin** 으로 통합 (T-010-fix2 시 신규 ADR). |
| **권한 문구 (Info.plist)** | 미정 | iOS: `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription` 필수. **영어 1종** (D-SPEC-1-3). `NSMicrophoneUsageDescription` 제거. |
| 권한 문구 본문 (영어) | 미작성 | Camera: `"FocusTimelapse needs camera access to record your study session and create a timelapse video."` / Photo: `"FocusTimelapse needs permission to save the completed timelapse video to your gallery."` |
| 다국어 권한 문구 | 미정 | 본 plan out of scope. 별도 i18n plan 에서 KO/ZH/JA/ES 추가 |

---

## 5. 결정이 필요한 항목

### D-PLAN-1: 최대 녹화 시간 — ✅ **결정: B (4시간 cap 유지, 2026-05-04 재확인)** (2026-05-03)

> 2026-05-04 재확인: 프레임 샘플링 (D-PLAN-8) 채택으로 디스크/시간 부담 크게 감소. 8시간 확장도 기술적 가능했으나 **현행 4시간 유지**. 향후 사용자 데이터 기반 별도 plan 에서 재검토.


| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| A | 무제한 (현재: 슬라이더 max 240분) | 자유로움 | 4시간 초과 시 파일 크기·변환 시간 폭주 |
| **B** | **4시간(240분) 하드 cap** | 현재 슬라이더 max와 일치, 일반 학습 커버 | 마라톤 학습(수능 7~8시간) 불가 |
| C | 사용자 설정 시간 ± 10% (초과 시 자동 정지) | 의도와 일치 | 설정 안 한 케이스 별도 처리 필요 |

Why: 일반 학습 시나리오 충분히 커버. 4시간 이상은 변환 시간/파일 크기 사용자 경험 저하. 현재 슬라이더 max와 일치하여 추가 구현 0.

---

### D-PLAN-2: 비율(aspect ratio) 불일치 해소 — ✅ **결정: A (4:5 통일, 백엔드 수정)** (2026-05-03)

현재 **프론트(모바일)**: 9:16 / 1:1 / 16:9 / **4:5** / 3:4
현재 **백엔드(세션 API)**: 9:16 / 16:9 / 1:1 / **4:3** / 3:4 → 4:5 미허용

| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| A | 4:5 통일 (백엔드에 4:5 추가, 4:3 제거) | SNS (인스타 세로) 최적 비율, 프론트 현행 유지 | 백엔드 VALID_ASPECT_RATIOS 수정 필요 |
| B | 4:3 통일 (프론트 4:5 → 4:3 변경) | 전통 사진 비율 호환 | SNS 콘텐츠 맥락 부적합 |
| C | 둘 다 지원 (4:3 + 4:5) | 선택지 최대 | 비율 6종 → UI 복잡, 해상도 정의 추가 |

Why: 인스타그램 세로 포맷(4:5)이 SNS 공유 핵심 시나리오. 백엔드 수정 1줄로 해결.

---

### D-PLAN-3: 출력 시간(outputSeconds) 옵션 정리 — ✅ **결정: A (현행 유지)** (2026-05-03)

현재: 5/10/15/30/45/60/90/120초 (8개). 2시간 초과 시 5s/10s 비활성화.
PRD: 30/60/90초 + 커스텀

| 안 | 옵션 구성 | 장점 | 단점 |
|---|----------|------|------|
| A | 현행 유지 (5~120초, 8개) | 이미 구현 완료, 세분화된 선택 | 5s/10s는 edge case, 사용자 혼란 가능 |
| B | 심플화: 15/30/60/90/120초 (5개) | 직관적, 실용적 | 5s/10s 제거 → 특수 케이스 지원 불가 |
| C | 30/60/90초 + 커스텀 입력 (PRD 원안) | 자유도 최대 | 커스텀 입력 UI 구현 필요, 검증 복잡 |

Why: 이미 구현 완료. 5s/10s는 짧은 공부 세션(데모/테스트) 용도로 유효. 변경 비용 대비 이득 낮음.

---

### D-PLAN-4: 수익화 모델 — ✅ **결정: A (월 구독 + Free/Pro 2-tier) — 단, 본 plan 범위 밖** (2026-05-03)

> **Scope 정정 (2026-05-03)**: Free/Pro 매트릭스는 *기획상* 정의되지만, **결제 구현은 별도 `plan-NN-monetization` 으로 분리**.
> 본 planning 의 후속 plan-01 에서는 **모든 사용자 = Pro 가정**으로 구현하고, 가드레일 자리만 TODO 주석으로 표시. 결제 plan 시작 시 가드만 켜면 활성화되는 구조.
> S5 (Progress bar 자물쇠), S6 (일일 한도), E9~E10 (구독 만료/갱신 실패) 시나리오는 결제 plan 활성화 시점에서 적용.

현재: result 화면에 "Remove Watermark (Upgrade)" 버튼 → `/paywall` 라우트. 미구현.

#### Free vs Pro 매트릭스

| 항목 | Free | Pro (월 구독) |
|------|------|---------------|
| 워터마크 | **강제 (FocusTimelapse 표시)** | **제거 가능** |
| Progress bar 오버레이 | **🔒 잠김 (선택 시 결제 안내)** | **사용 가능** |
| 일일 사용 한도 | **1회/일** | **무제한** |
| timer / streak / none 오버레이 | 사용 가능 | 사용 가능 |
| 녹화 길이 cap (D-1) | 4시간 | 4시간 |
| 비율 (D-2) | 모두 사용 가능 | 모두 사용 가능 |

#### 결제 모델

- **월 구독 (App Store In-App Purchase)**. 단건 결제 X.
- 구독 활성 기간 동안만 Pro 기능 unlock. 만료 시 Free 다운그레이드.
- 영수증 검증은 서버 책임 (planning §3, §4 참조).

#### Why (옵션 비교는 참고)

| 안 | 모델 | 채택 근거 / 탈락 사유 |
|---|------|---|
| **A** | **월 구독** | **반복 수익 + 신규 기능 추가 시 모든 가입자 자동 unlock. SaaS 표준** |
| B | 단건 인앱결제 | 사용자 부담은 낮으나 일회성 수익. 신규 Pro 기능 추가 시 재구매 강요 어색 |
| C | 미구현 유지 | 수익화 불가 |

#### spec/policy 단계로 위임 (이번 planning 범위 아님)

- "일일 1회"의 정확한 단위 (저장 완료 vs 변환 시작 vs 녹화 시작) → policy
- 자정 리셋 timezone (서버 UTC vs 디바이스 로컬) → policy
- 영수증 검증 흐름 (sandbox/production, 만료 시점 처리) → spec
- 구독 가격 (₩/월), 무료 trial 기간 → policy + 비즈니스 결정
- Paywall 화면 UX/카피 → 별도 design spec
- 한도 도달 안내 화면 디자인 → 별도 design spec

---

### D-PLAN-5: Android 지원 시기 — ✅ **결정: A (iOS 우선, Android Phase 2)** (2026-05-03)

| 안 | 시기 | 장점 | 단점 |
|---|------|------|------|
| A | iOS Phase 1 완성 후 Android 이식 (현재 방향) | 리소스 집중, 품질 보장 | Android 사용자 대기 |
| B | iOS·Android 동시 개발 | 시장 동시 진입 | 리소스 2배, 검증 복잡 |
| C | iOS만 (Android 미지원) | 단순 | 시장 절반 포기 |

Why: AVFoundation ↔ MediaCodec 이식 작업이 있으나 React Native 레이어는 공유. iOS 안정화 후 이식.

---

### D-PLAN-6: generating + saving 세션 이중 업데이트 해소 — ✅ **결정: A (saving 에서만)** (2026-05-03)

> Phase 0 코드 완료 (T-004): `generating.tsx` updateSession 호출 제거됨.


현재: `updateSession` 이 `generating.tsx`(변환 완료 시) + `saving.tsx`(저장 완료 시) 양쪽에서 호출됨.

| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| A | saving에서만 (최종 완료 기준) | 완성된 영상 저장 완료가 진짜 완료 | generating 단계 결과 기록 안 됨 |
| B | generating에서만 (변환 완료 기준) | 세션 duration이 정확히 기록됨 | 저장 실패해도 completed 처리 |
| C | 현행 유지 (두 번 업데이트) | 단계별 기록 가능 | 불필요한 API 중복, 상태 덮어쓰기 |

Why: "세션 완료"의 의미는 갤러리 저장까지 포함. generating 성공 여부는 세션 status가 아니라 별도 로깅으로 처리.

---

### D-PLAN-7: 음성 포함 정책 — ✅ **결정: 미포함** (2026-05-04)

| 안 | 동작 | 장점 | 단점 |
|---|------|------|------|
| A | 음성 포함 (현행 audio=true) | 학습 환경음 기록 | 프레임 샘플링 패러다임과 양립 불가, 디스크/배터리 부담 |
| **B** | **음성 미포함 (audio=false)** | 프레임 샘플링 가능, 마이크 권한 불필요, 디스크 ↓ | 환경음 기록 불가 |

Why: 타임랩스 산출물은 어차피 배속이라 음성이 의미 없음 (SNS 타임랩스 대다수 무음/BGM). 음성을 포기함으로써 프레임 샘플링 패러다임 (D-PLAN-8) 의 모든 비기능 우월성 (디스크 1/4, 변환 시간 1/10, 발열 ↓, 배터리 ↓) 확보.

**Consequences**:
- focus.tsx VisionCamera `audio={false}`
- `Info.plist` `NSMicrophoneUsageDescription` 제거
- 시나리오 E4 (마이크 권한 거절) 자동 해소
- D-PLAN-8 의 사실상 전제 조건

(상세: `adr-NN-recording-paradigm` 후속 작성)

---

### D-PLAN-8: 녹화 패러다임 — ✅ **결정: 프레임 샘플링** (2026-05-04)

| 안 | 방식 | 디스크 (4h) | 변환 시간 | 비기능 |
|---|------|-----------|---------|--------|
| A | **연속 30fps + scaleTimeRange (현행)** | 4~8GB | 4~12분 | 발열·배터리 부담 |
| **B** | **프레임 샘플링 (N초 인터벌 캡처 + AVAssetWriter stitch)** | ~1~2GB | 수십초 | 발열·배터리 ↓ |

**Decision: B (프레임 샘플링)**

Why:
1. D-PLAN-7 음성 미포함으로 연속 녹화의 마지막 정당화 사라짐
2. T-007 워커 정량 비교에서 음성 외 모든 비기능 지표 B 우월
3. **WYSIWYG 자동 보장**: 캡처 시점에 이미지에 오버레이 burn-in → preview ↔ 저장본 픽셀 차이 자체가 사라짐. PLAN-001 fontSize 이슈 본질 해결.
4. Apple Camera 의 내장 Timelapse 모드 패턴

**Consequences**:
- `TimelapseCreatorModule.swift` `buildTimelapse` (~200줄) + `applyOverlay` (~300줄) **폐기 후 재작성**
- 신규 함수: capture timer + JPEG write + 정적 오버레이 그리기 + AVAssetWriter stitch (추정 300~400줄)
- plan-01 Phase 1 노력 규모 M → L. Phase 2 (overlay 재설계) 일부 자동 해소
- Phase 4 (Android 이식) 부담 ↓ — 새 모듈이 단순해서 Camera2 + MediaCodec/MediaMuxer 이식 짧아짐
- D-PLAN-1 4시간 cap 자원적으로 부담 없음 확정

**인터벌 계산 공식** (재게시):
```
interval = goalSeconds / (outputSeconds × frameRate)
```

(상세: `adr-NN-recording-paradigm` 후속 작성)

---

### D-PLAN-10: 짧은 녹화 처리 + 캡처 schedule — ✅ **결정** (2026-05-04)

#### 전제 (변수 구분 — 헷갈림 방지)

| 변수 | 의미 | 범위 / 출처 |
|------|------|------------|
| `outputSec` | 사용자가 선택하는 **목표 영상 길이** | 5/10/15/30/45/60/90/120초 (D-PLAN-3) |
| `goalSec` | 사용자가 설정하는 **목표 공부 시간** | 10초 ~ 4시간 (D-PLAN-1) |
| `outputFps` | 출력 영상의 fps | 30 (또는 압축비 따라 24/30) |
| `recordingSec` | 실제 정지 시점까지 (입력) | 절대 최소 10초 |
| `결과 영상 길이` | stitch 후 실제 영상 길이 (출력) | `recordingSec` 비례 — schedule 함수 결과 |

#### Decision

1. **출력 옵션 5~120초 모두 유효**. 짧은 출력도 사용자 의도 존중. 5초 출력도 정상 케이스.
2. **녹화 시간 절대 최소 = 10초** (§2-1 일치). 출력 설정과 무관한 절대값. 출력 시간에 따라 동적으로 강제 X.
3. **캡처 schedule = 동적 함수**:
   ```
   schedule(t; goalSec, outputSec, outputFps) → 누적 캡처 프레임 수
   ```
   3개 변수 모두 입력. 외부 하드코딩 X.

4. **schedule 의 6개 보장 속성** (정확한 함수 형태 선택 시 반드시 만족):
   - **입력 의존**: 3개 변수 모두 함수 내 사용
   - **종점 정확도**: `schedule(goalSec) = outputSec × outputFps` 정확히 일치
   - **단조 증가**: t1 < t2 → schedule(t1) ≤ schedule(t2)
   - **짧은 녹화 보호**: 초반 t<5% 구간에서 선형보다 빠르게 증가 (예: sqrt 곡선) — 1분 정지해도 stop-motion 안 되도록
   - **연속**: 시간 t에 대해 연속 함수 (계단 점프 X)
   - **인터벌 floor**: 어떤 시점에도 캡처 인터벌 ≥ 100ms (메모리/IO 보호)

5. **정확한 함수 형태** (sqrt vs power(α) vs log vs 계단) 는 **spec-01 / policy-01 단계 결정**. planning 은 요구사항만.

6. **결과 영상 길이 = `(누적 캡처 / outputFps)`**. 짧은 녹화면 비례 짧음. 사용자 자율 존중.

#### UX 안내 (사전 인지)

사용자가 정지 버튼 누르기 *전에* 결과 영상 길이를 인지하도록:

- **A. 녹화 화면 실시간 인디케이터**: "정지 시 결과 영상 약 Z초" (계속 표시)
- **B. 정지 버튼 모달**: "목표 X분 중 Y분 진행. 결과 영상 약 Z초. [정지 / 계속]"
- **A + B 조합 채택**

(자세한 카피/디자인 위치/스타일은 spec-01 또는 별도 design spec)

#### Consequences

- focus.tsx 에 인디케이터 + 정지 모달 추가
- native 모듈 캡처 timer 가 schedule 함수 출력에 따라 가변 인터벌
- spec-01 / policy-01 에서 정확한 schedule 함수 결정 (사용자 합의 필요)
- 후속 ADR 후보:
  - `adr-NN-capture-schedule-function` (sqrt 채택 시)
  - `adr-NN-stop-confirmation-ux`

---

### D-PLAN-9: Native 모듈 vs JS 라이브러리 — ✅ **결정: Native 유지 (재작성)** (2026-05-04)

프레임 샘플링 채택 시 native 모듈을 계속 쓸지, RN/JS 라이브러리로 대체할지.

| 단계 | 옵션 | 권장 | Why |
|------|------|------|-----|
| 캡처 | (a) native AVCapturePhotoOutput / (b) expo-camera takePictureAsync + setInterval / (c) VisionCamera frame processor | **(a)** | JS setInterval 정확도 ±10~50ms. expo-camera takePictureAsync 는 셔터음/포커스 reset. **인터벌 정확도 필수** |
| 오버레이 그리기 | (a) native UIGraphicsImageRenderer (캡처와 같은 컨텍스트) / (b) JS expo-image-manipulator / @shopify/react-native-skia | **(a)** | JS bridge 왕복 없음, 캡처 직후 같은 native 컨텍스트에서 그리기 효율적 |
| Stitch | (a) native AVAssetWriter (이미지→MP4) / (b) ffmpeg-kit-react-native (~50MB 패키지, LGPL) | **(a)** | AVAssetWriter 코드 짧음. ffmpeg-kit 패키지 크기/라이선스 부담 |

**Decision: 모든 단계 (a) — Native 유지**

Why:
1. 인터벌 정확도 (캡처) — 프레임 샘플링 품질의 핵심
2. 메모리/IO 효율 (캡처 → 오버레이 → 저장 한 컨텍스트)
3. 외부 패키지 의존 최소화
4. 결과: 새 모듈 ~300~400줄 (현 1,027줄의 1/3 이하). 복잡도 (videoComposition / scaleTimeRange / CALayer animation tool 다 사라짐) 도 큼

**Consequences**:
- Android 이식 시 동일 패턴 (Camera2 + Canvas + MediaCodec + MediaMuxer)
- expo-modules-core 기반 wrapper 유지

(상세: `adr-NN-recording-paradigm` 또는 별도 ADR 에서 흡수)

---

## 6. 명시적 비목표 (Out of Scope)

이번 파이프라인 planning에서 **다루지 않는** 것:

- **웹 클라이언트 녹화 파이프라인**: 별도 planning 필요. 현재 web 화면은 스켈레톤만 존재.
- **클라우드 저장/공유**: 갤러리 로컬 저장만. 클라우드 업로드/스트리밍 미포함.
- **동영상 편집 기능**: 트리밍, 필터, 음악 추가 등 편집 기능 미포함.
- **실시간 스트리밍**: 녹화→변환→저장 배치 플로우만.
- **여러 세션 병합**: 단일 세션 단위 처리만.
- **i18n (다국어)**: PRD 목표이나 이번 planning 범위 외. 별도 spec 필요.
- **공부 통계 대시보드 상세**: stats 화면은 별도 planning 범위.
- **Android 구현 상세**: Phase 2. 현재는 iOS AVFoundation 기준으로만 명세.
