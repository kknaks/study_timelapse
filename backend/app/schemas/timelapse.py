from __future__ import annotations

from pydantic import BaseModel, field_validator


class TimelapseRequest(BaseModel):
    """타임랩스 변환 요청."""

    fileId: str
    outputSeconds: int

    @field_validator("outputSeconds")
    @classmethod
    def validate_output_seconds(cls, v: int) -> int:
        if v not in (30, 60, 90):
            raise ValueError("outputSeconds must be 30, 60, or 90")
        return v


class TimelapseCreateResponse(BaseModel):
    """타임랩스 생성 응답."""

    taskId: str


class TimelapseStatusResponse(BaseModel):
    """타임랩스 상태 응답."""

    taskId: str
    status: str
    progress: int
    outputSeconds: int | None = None
    downloadUrl: str | None = None
