from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Optional

from app.config import settings
from app.services.upload_service import UploadService

logger = logging.getLogger(__name__)

# In-memory 태스크 저장소
task_store: dict[str, dict] = {}


class TimelapseService:
    """타임랩스 변환 서비스."""

    def __init__(self, upload_service: UploadService) -> None:
        self.upload_service = upload_service

    async def create_task(self, file_id: str, output_seconds: int, recording_seconds: float) -> str:
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
            "recording_seconds": recording_seconds,
            "status": "processing",
            "progress": 0,
            "output_path": output_path,
        }

        asyncio.create_task(
            self._run_ffmpeg(task_id, file_info["file_path"], output_path, output_seconds, recording_seconds)
        )

        return task_id

    def get_task(self, task_id: str) -> Optional[dict]:
        return task_store.get(task_id)

    async def _run_ffmpeg(
        self,
        task_id: str,
        input_path: str,
        output_path: str,
        output_seconds: int,
        recording_seconds: float,
    ) -> None:
        """FFmpeg로 타임랩스 변환."""
        task = task_store[task_id]
        try:
            # 배속 계산: 프론트에서 받은 녹화 시간 사용
            speed_factor = recording_seconds / output_seconds
            logger.info(f"[{task_id}] recording={recording_seconds}s, output={output_seconds}s, speed={speed_factor}x")

            # 타임랩스: N프레임마다 1개 선택 → 30fps 출력 → 경과시간 오버레이
            # 원본 fps 추정 (보통 30fps)
            src_fps = 30.0
            total_frames = recording_seconds * src_fps
            target_frames = output_seconds * 30  # 출력도 30fps
            select_every_n = max(1, int(total_frames / target_frames))

            logger.info(f"[{task_id}] total_frames={total_frames}, target={target_frames}, select_every={select_every_n}")

            filter_str = (
                f"select=not(mod(n\\,{select_every_n})),"
                f"setpts=N/30/TB,"
                f"drawtext=text='%{{pts\\:hms}}':"
                f"fontsize=36:fontcolor=white:"
                f"x=10:y=10:box=1:boxcolor=black@0.5:boxborderw=5"
            )

            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-vf", filter_str,
                "-r", "30",
                "-an",
                "-c:v", "libx264",
                "-profile:v", "baseline",
                "-level", "3.0",
                "-pix_fmt", "yuv420p",
                "-preset", "fast",
                "-movflags", "+faststart",
                output_path,
            ]

            logger.info(f"[{task_id}] FFmpeg cmd: {' '.join(cmd)}")

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            _, stderr = await process.communicate()

            stderr_text = stderr.decode() if stderr else ""
            logger.info(f"[{task_id}] FFmpeg exit code: {process.returncode}")
            if stderr_text:
                logger.info(f"[{task_id}] FFmpeg stderr (last 500): {stderr_text[-500:]}")

            if process.returncode == 0 and os.path.exists(output_path):
                task["status"] = "completed"
                task["progress"] = 100
                logger.info(f"[{task_id}] Conversion completed: {output_path}")
            else:
                task["status"] = "failed"
                logger.error(f"[{task_id}] FFmpeg failed (code {process.returncode})")

        except Exception as e:
            task["status"] = "failed"
            logger.exception(f"[{task_id}] Conversion error: {e}")
