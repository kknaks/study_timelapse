from __future__ import annotations

import asyncio
import logging
from typing import Optional
import os
import uuid

from fastapi import UploadFile

from app.config import settings

logger = logging.getLogger(__name__)

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

        # ffprobe로 총 프레임 수 & 길이 파악
        total_frames, duration = await self._probe_video(file_path)

        file_store[file_id] = {
            "file_id": file_id,
            "filename": saved_filename,
            "original_filename": file.filename,
            "file_path": file_path,
            "mime_type": file.content_type,
            "total_frames": total_frames,
            "duration": duration,
        }

        logger.info(f"[{file_id}] uploaded: frames={total_frames}, duration={duration}s")

        return {"fileId": file_id, "filename": saved_filename}

    def _validate(self, file: UploadFile) -> None:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file format: {ext}")

    def get_file(self, file_id: str) -> Optional[dict]:
        return file_store.get(file_id)

    async def _probe_video(self, file_path: str) -> tuple[int, float]:
        """ffprobe로 총 프레임 수와 길이(초)를 반환한다."""
        # 프레임 수
        frame_cmd = [
            "ffprobe", "-v", "error",
            "-count_frames", "-select_streams", "v:0",
            "-show_entries", "stream=nb_read_frames",
            "-of", "csv=p=0",
            file_path,
        ]
        # 길이
        duration_cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            file_path,
        ]

        try:
            frame_proc = await asyncio.create_subprocess_exec(
                *frame_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            frame_out, _ = await frame_proc.communicate()

            duration_proc = await asyncio.create_subprocess_exec(
                *duration_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            duration_out, _ = await duration_proc.communicate()

            total_frames = int(frame_out.decode().strip())
            duration = float(duration_out.decode().strip())

            return total_frames, duration
        except Exception as e:
            logger.warning(f"ffprobe failed: {e}, using fallback")
            return 0, 0.0
