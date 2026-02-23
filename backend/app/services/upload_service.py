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

        return {
            "fileId": file_id,
            "filename": saved_filename,
            "totalFrames": total_frames,
            "duration": duration,
        }

    def _validate(self, file: UploadFile) -> None:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file format: {ext}")

    def get_file(self, file_id: str) -> Optional[dict]:
        return file_store.get(file_id)

    async def _probe_video(self, file_path: str) -> tuple[int, float]:
        """ffprobe로 총 프레임 수와 길이(초)를 반환한다."""
        # 프레임 수 + 길이를 한번에 (count_frames로 정확한 값)
        cmd = [
            "ffprobe", "-v", "error",
            "-count_frames", "-select_streams", "v:0",
            "-show_entries", "stream=nb_read_frames,duration",
            "-show_entries", "format=duration",
            "-of", "json",
            file_path,
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await proc.communicate()

            import json
            data = json.loads(out.decode())

            # 프레임 수
            total_frames = 0
            streams = data.get("streams", [])
            if streams:
                val = streams[0].get("nb_read_frames", "0")
                if val and val != "N/A":
                    total_frames = int(val)

            # 길이: stream duration → format duration 순서로 시도
            duration = 0.0
            if streams:
                val = streams[0].get("duration", "N/A")
                if val and val != "N/A":
                    duration = float(val)
            if duration <= 0:
                val = data.get("format", {}).get("duration", "N/A")
                if val and val != "N/A":
                    duration = float(val)

            # webm은 duration이 N/A일 수 있음 → 프레임수로 추정
            if duration <= 0 and total_frames > 0:
                duration = total_frames / 30.0
                logger.info(f"duration estimated from frames: {duration}s")

            return total_frames, duration
        except Exception as e:
            logger.warning(f"ffprobe failed: {e}, using fallback")
            return 0, 0.0
