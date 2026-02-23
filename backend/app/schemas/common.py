from __future__ import annotations

from typing import Optional, Union
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """통일 성공 응답."""

    success: bool = True
    data: T | None = None
    message: str = "OK"


class ApiErrorResponse(BaseModel):
    """통일 에러 응답."""

    success: bool = False
    error_code: str
    message: str
    detail: Optional[Union[dict, list]] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """페이지네이션 응답."""

    success: bool = True
    data: list[T]
    total: int
    page: int
    size: int
    pages: int
