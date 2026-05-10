---
id: adr-20
type: adr
title: RevenueCat Webhook 인증 — Authorization Bearer
status: accepted
created: 2026-05-09
updated: 2026-05-09
sources:
  - "[[planning-03-revenuecat]]"
  - "[[plan-04-revenuecat-roadmap]]"
related_to:
  - "[[adr-15-receipt-verification-dual-path]]"
  - "[[adr-22-status-source-cache-with-sync]]"
tags: [adr, payment, subscription, revenuecat, webhook, auth, security, phase2]
---

# RevenueCat Webhook 인증 — Authorization Bearer

## Summary

RevenueCat webhook 수신 시 `Authorization: Bearer <token>` 헤더 검증(D-PLAN-2-9 A). 토큰은 ENV 변수 `REVENUECAT_WEBHOOK_AUTH_TOKEN` 으로 관리. RevenueCat 대시보드에서 동일 토큰 설정.

---

## Context

- Phase 2 에서 `POST /api/subscription/webhook` 신규 엔드포인트 추가 (adr-15)
- RevenueCat 이 webhook 을 backend 에 push 할 때 인증 필요 — 무인증 시 외부 위변조 이벤트 수신 가능
- planning-03 D-PLAN-2-9 결정

---

## Options

| 안 | 방식 | 장점 | 단점 |
|---|------|------|------|
| **A** | **Authorization Bearer** — RevenueCat 대시보드에서 설정한 webhook secret 을 Bearer token 으로 검증 | RevenueCat 표준. 구현 단순 (1줄 헤더 검증). HTTPS 하에서 충분한 보안 | token 유출 시 위변조 가능 (HTTPS + 환경변수 저장으로 방어) |
| B | HMAC signature 검증 | 높은 보안 | RevenueCat 표준이 아님. 커스텀 구현 필요 |

---

## Decision

**A 채택 — Authorization Bearer 토큰 검증.**

### 설정 규칙

```
# RevenueCat Dashboard
Webhook URL: https://{backend-host}/api/subscription/webhook
Authorization: Bearer {REVENUECAT_WEBHOOK_AUTH_TOKEN}

# Backend ENV (.env.secret, gitignored)
REVENUECAT_WEBHOOK_AUTH_TOKEN=<strong-random-token>

# Backend 검증 로직
if request.headers.get("Authorization") != f"Bearer {REVENUECAT_WEBHOOK_AUTH_TOKEN}":
    return 401 Unauthorized
```

### 토큰 관리 규칙

- 토큰 생성: 최소 32바이트 랜덤 문자열 (예: `secrets.token_urlsafe(32)`)
- 저장: `secret.env` (gitignored) 또는 배포 시크릿 관리 시스템
- 로테이션: RevenueCat 대시보드와 backend ENV 동시 교체
- 로깅: 토큰 값 자체 로그 금지

### 보안 전제

- HTTPS 강제 (TLS 하에서 Bearer 토큰 평문 노출 없음)
- 토큰 유출 시 즉시 로테이션 절차 runbook 에 포함 (P2.4 runbook task)

**Why**: RevenueCat 공식 문서 권장 방식. 구현 1일 이내. HTTPS + 환경변수 저장으로 보안 충분.

---

## Consequences

### backend/api (○)
- `POST /api/subscription/webhook` 엔드포인트에 Bearer 토큰 검증 미들웨어 또는 의존성 주입
- 401 응답 시 RevenueCat 이 자동 재시도 (5xx 와 동일하게 재시도)
- `REVENUECAT_WEBHOOK_AUTH_TOKEN` ENV 변수 backend 설정 파일에 추가

### frontend/mobile-fe (×)
### frontend/web-fe (×)
### frontend/shared-fe (×)

### 운영 절차
- RevenueCat 대시보드에서 webhook URL + Authorization 헤더 설정 (P2.0 사전 준비 체크리스트)
- 토큰 로테이션 절차: runbook-NN-store-sandbox-testing 또는 별도 runbook 에 포함
