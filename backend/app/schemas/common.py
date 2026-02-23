from __future__ import annotations

from pydantic import BaseModel


class ApiResponse[T](BaseModel):
    """통일 성공 응답."""

    success: bool = True
    data: T | None = None
    message: str = "OK"


class ApiErrorResponse(BaseModel):
    """통일 에러 응답."""

    success: bool = False
    error_code: str
    message: str
    detail: dict | list | None = None


class PaginatedResponse[T](BaseModel):
    """페이지네이션 응답."""

    success: bool = True
    data: list[T]
    total: int
    page: int
    size: int
    pages: int
