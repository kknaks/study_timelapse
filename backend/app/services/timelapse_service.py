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

    async def create_task(self, file_id: str, output_seconds: int, recording_seconds: float, aspect_ratio: str = "16:9") -> str:
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
            "aspect_ratio": aspect_ratio,
            "status": "processing",
            "progress": 0,
            "output_path": output_path,
        }

        asyncio.create_task(
            self._run_ffmpeg(task_id, file_info["file_path"], output_path, output_seconds, recording_seconds, aspect_ratio)
        )

        return task_id

    def get_task(self, task_id: str) -> Optional[dict]:
        return task_store.get(task_id)

    def _get_crop_and_scale(self, aspect_ratio: str) -> tuple[str, str, str]:
        """비율별 crop → scale → pad 필터 반환."""
        # 입력: 1280x720 (16:9)
        # crop은 입력 기준 중앙 크롭, scale은 출력 해상도
        # crop 값을 2의 배수로 내림 (h264 짝수 해상도 필수)
        configs = {
            "9:16": ("crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0", "scale=1080:1920", "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"),
            "1:1":  ("crop=trunc(ih/2)*2:trunc(ih/2)*2:(iw-trunc(ih/2)*2)/2:0", "scale=1080:1080", "pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black"),
            "4:5":  ("crop=trunc(ih*4/5/2)*2:ih:(iw-trunc(ih*4/5/2)*2)/2:0", "scale=1080:1350", "pad=1080:1350:(ow-iw)/2:(oh-ih)/2:black"),
            "16:9": ("", "scale=1920:1080", "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"),
        }
        return configs.get(aspect_ratio, configs["16:9"])

    async def _run_ffmpeg(
        self,
        task_id: str,
        input_path: str,
        output_path: str,
        output_seconds: int,
        recording_seconds: float,
        aspect_ratio: str = "16:9",
    ) -> None:
        """FFmpeg로 타임랩스 변환."""
        task = task_store[task_id]
        try:
            # 배속 계산: 프론트에서 받은 녹화 시간 사용
            speed_factor = recording_seconds / output_seconds
            logger.info(f"[{task_id}] recording={recording_seconds}s, output={output_seconds}s, speed={speed_factor}x, ratio={aspect_ratio}")

            # 타임랩스: fps 필터로 출력 fps 계산하여 프레임 샘플링
            output_fps = 30
            target_input_fps = output_fps / speed_factor

            logger.info(f"[{task_id}] target_input_fps={target_input_fps}, output_fps={output_fps}")

            # 비율별 crop/scale 필터
            crop_filter, scale_filter, pad_filter = self._get_crop_and_scale(aspect_ratio)

            # 필터 체인 구성: fps → crop(있으면) → setpts → scale → pad → drawtext
            filters = [f"fps={target_input_fps}"]
            if crop_filter:
                filters.append(crop_filter)
            filters.extend([
                f"setpts=N/{output_fps}/TB",
                f"{scale_filter}:force_original_aspect_ratio=decrease",
                pad_filter,
                (
                    f"drawtext=text='%{{pts\\:hms}}':"
                    f"fontsize=48:fontcolor=white:"
                    f"x=20:y=20:box=1:boxcolor=black@0.5:boxborderw=8"
                ),
            ])
            filter_str = ",".join(filters)

            cmd = [
                "ffmpeg", "-y",
                "-fflags", "+genpts",
                "-i", input_path,
                "-vsync", "cfr",
                "-vf", filter_str,
                "-r", str(output_fps),
                "-an",
                "-c:v", "libx264",
                "-profile:v", "high",
                "-level", "4.1",
                "-pix_fmt", "yuv420p",
                "-crf", "23",
                "-maxrate", "5M",
                "-bufsize", "10M",
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
