from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    """앱 기본 예외."""

    def __init__(self, status_code: int, error_code: str, message: str) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message


class NotFoundException(AppException):
    def __init__(self, resource: str, id: str | int) -> None:
        super().__init__(404, "NOT_FOUND", f"{resource} {id} not found")


class DuplicateException(AppException):
    def __init__(self, resource: str, field: str) -> None:
        super().__init__(409, "DUPLICATE", f"{resource} with this {field} already exists")


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(401, "UNAUTHORIZED", message)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Permission denied") -> None:
        super().__init__(403, "FORBIDDEN", message)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error_code": exc.error_code, "message": exc.message},
    )
