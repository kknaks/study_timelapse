from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """앱 기본 예외."""

    def __init__(self, status_code: int, error_code: str, message: str) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message


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


async def app_exception_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error_code": exc.error_code, "message": exc.message},
    )
