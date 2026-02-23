from __future__ import annotations

from typing import Optional
import asyncio
import os
import uuid

from app.config import settings
from app.services.upload_service import UploadService

# In-memory 태스크 저장소
task_store: dict[str, dict] = {}


class TimelapseService:
    """타임랩스 변환 서비스."""

    def __init__(self, upload_service: UploadService) -> None:
        self.upload_service = upload_service

    async def create_task(self, file_id: str, output_seconds: int) -> str:
        """변환 태스크를 생성하고 백그라운드에서 FFmpeg 실행."""
        file_info = self.upload_service.get_file(file_id)
        if not file_info:
            raise FileNotFoundError(f"File {file_id} not found")

        task_id = str(uuid.uuid4())
        output_path = os.path.join(settings.upload_dir, f"{task_id}_timelapse.mp4")

        task_store[task_id] = {
            "task_id": task_id,
            "file_id": file_id,
            "output_seconds": output_seconds,
            "status": "processing",
            "progress": 0,
            "output_path": output_path,
        }

        # 백그라운드에서 FFmpeg 변환 실행
        asyncio.create_task(self._run_ffmpeg(task_id, file_info["file_path"], output_path, output_seconds))

        return task_id

    def get_task(self, task_id: str) -> Optional[dict]:
        return task_store.get(task_id)

    async def _run_ffmpeg(
        self, task_id: str, input_path: str, output_path: str, output_seconds: int
    ) -> None:
        """FFmpeg로 타임랩스 변환."""
        task = task_store[task_id]
        try:
            # 원본 영상 길이 조회
            duration = await self._get_duration(input_path)
            if duration <= 0:
                task["status"] = "failed"
                return

            # 배속 계산
            speed_factor = duration / output_seconds

            # FFmpeg 타임랩스 변환 + 경과시간 오버레이
            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-filter_complex",
                (
                    f"[0:v]setpts=PTS/{speed_factor},"
                    f"drawtext=text='%{{pts\\:hms}}':fontsize=36:fontcolor=white:"
                    f"x=10:y=10:box=1:boxcolor=black@0.5:boxborderw=5"
                ),
                "-an",  # 오디오 제거
                "-c:v", "libx264",
                "-preset", "fast",
                output_path,
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            _, stderr = await process.communicate()

            if process.returncode == 0 and os.path.exists(output_path):
                task["status"] = "completed"
                task["progress"] = 100
            else:
                task["status"] = "failed"

        except Exception:
            task["status"] = "failed"

    async def _get_duration(self, file_path: str) -> float:
        """ffprobe로 영상 길이(초) 조회."""
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            file_path,
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()
            import json
            data = json.loads(stdout)
            return float(data.get("format", {}).get("duration", 0))
        except Exception:
            return 0
