from __future__ import annotations

from typing import Optional
import os
import uuid

from fastapi import UploadFile

from app.config import settings

ALLOWED_EXTENSIONS = {".webm", ".mp4", ".mov"}
ALLOWED_MIME_TYPES = {"video/webm", "video/mp4", "video/quicktime"}

# In-memory 파일 저장소 (MVP: DB 대신 dict 사용)
file_store: dict[str, dict] = {}


class UploadService:
    """파일 업로드 서비스."""

    async def upload(self, file: UploadFile) -> dict[str, str]:
        """파일을 저장하고 fileId를 반환한다."""
        self._validate(file)

        file_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename or "")[1].lower()
        saved_filename = f"{file_id}{ext}"
        file_path = os.path.join(settings.upload_dir, saved_filename)

        os.makedirs(settings.upload_dir, exist_ok=True)

        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        file_store[file_id] = {
            "file_id": file_id,
            "filename": saved_filename,
            "original_filename": file.filename,
            "file_path": file_path,
            "mime_type": file.content_type,
        }

        return {"fileId": file_id, "filename": saved_filename}

    def _validate(self, file: UploadFile) -> None:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file format: {ext}")

    def get_file(self, file_id: str) -> Optional[dict]:
        return file_store.get(file_id)
