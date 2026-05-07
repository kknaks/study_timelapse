from __future__ import annotations

from datetime import datetime

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """앱 기본 예외."""

    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        extra: dict | None = None,
    ) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.extra = extra or {}


class NotFoundError(AppError):
    def __init__(self, resource: str, id: str | int) -> None:
        super().__init__(404, "NOT_FOUND", f"{resource} {id} not found")


class DuplicateError(AppError):
    def __init__(self, resource: str, field: str) -> None:
        super().__init__(409, "DUPLICATE", f"{resource} with this {field} already exists")


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(401, "UNAUTHORIZED", message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Permission denied") -> None:
        super().__init__(403, "FORBIDDEN", message)


class TermsNotAgreedError(AppError):
    def __init__(self) -> None:
        super().__init__(402, "TERMS_NOT_AGREED", "약관 동의가 필요합니다.")


class InvalidPlanError(AppError):
    def __init__(self) -> None:
        super().__init__(400, "INVALID_PLAN", "'monthly' 플랜만 지원합니다.")


class InvalidTargetStatusError(AppError):
    def __init__(self) -> None:
        super().__init__(400, "INVALID_TARGET_STATUS", "유효하지 않은 구독 상태입니다.")


class DailyQuotaExceededError(AppError):
    def __init__(self, daily_quota_resets_at: datetime) -> None:
        super().__init__(
            403,
            "DAILY_QUOTA_EXCEEDED",
            "오늘 일일 한도를 초과했습니다.",
            extra={"daily_quota_resets_at": daily_quota_resets_at.isoformat()},
        )


async def app_exception_handler(request: Request, exc: AppError) -> JSONResponse:
    content: dict = {
        "success": False,
        "error_code": exc.error_code,
        "message": exc.message,
    }
    content.update(exc.extra)
    return JSONResponse(status_code=exc.status_code, content=content)
