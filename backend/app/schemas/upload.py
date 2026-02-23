from __future__ import annotations

from pydantic import BaseModel


class UploadResponse(BaseModel):
    """업로드 응답."""

    fileId: str
    filename: str
    totalFrames: int = 0
    duration: float = 0.0
