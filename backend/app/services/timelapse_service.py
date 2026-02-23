from __future__ import annotations

import asyncio
import logging
import math
import os
import uuid
from typing import Optional

from app.config import settings
from app.services.upload_service import UploadService

logger = logging.getLogger(__name__)

# In-memory 태스크 저장소
task_store: dict[str, dict] = {}

OUTPUT_FPS = 30

# 자연스러운 타임랩스를 위한 배속 범위
# pick_every가 이 범위 안에 있어야 자연스러움
MIN_PICK_EVERY = 2    # 최소 2프레임당 1개 (너무 원본에 가까우면 타임랩스 느낌 없음)
MAX_PICK_EVERY = 60   # 최대 60프레임당 1개 (2초에 1프레임, 이 이상이면 뚝뚝 끊김)


class TimelapseService:
    """타임랩스 변환 서비스."""

    def __init__(self, upload_service: UploadService) -> None:
        self.upload_service = upload_service

    async def create_task(
        self,
        file_id: str,
        output_seconds: int,
        recording_seconds: float,
        aspect_ratio: str = "16:9",
    ) -> str:
        """변환 태스크를 생성하고 백그라운드에서 FFmpeg 실행."""
        file_info = self.upload_service.get_file(file_id)
        if not file_info:
            raise FileNotFoundError(f"File {file_id} not found")

        task_id = str(uuid.uuid4())
        output_path = os.path.join(settings.upload_dir, f"{task_id}_timelapse.mp4")

        total_frames = file_info.get("total_frames", 0)
        duration = file_info.get("duration", 0.0)

        task_store[task_id] = {
            "task_id": task_id,
            "file_id": file_id,
            "output_seconds": output_seconds,
            "recording_seconds": recording_seconds,
            "aspect_ratio": aspect_ratio,
            "total_frames": total_frames,
            "duration": duration,
            "status": "processing",
            "progress": 0,
            "output_path": output_path,
        }

        asyncio.create_task(
            self._run_ffmpeg(task_id, file_info["file_path"], output_path,
                             output_seconds, total_frames, duration, aspect_ratio)
        )

        return task_id

    def get_task(self, task_id: str) -> Optional[dict]:
        return task_store.get(task_id)

    # ── 타임랩스 파라미터 계산 ──

    def _calc_timelapse_params(
        self, total_frames: int, output_seconds: int
    ) -> tuple[int, int]:
        """
        자연스러운 타임랩스를 위한 (pick_every, output_fps) 계산.

        output_seconds는 유저가 정한 값 그대로 유지.
        pick_every가 MAX_PICK_EVERY를 넘으면 output_fps를 올려서 보상.

        pick_every = total_frames / output_frames
        output_frames = output_fps * output_seconds
        """
        if total_frames <= 0:
            return 1, OUTPUT_FPS

        # 기본 30fps로 계산
        output_frames = OUTPUT_FPS * output_seconds
        pick_every = math.floor(total_frames / output_frames) if output_frames > 0 else 1

        if pick_every <= MAX_PICK_EVERY:
            # 자연스러운 범위 → 30fps 그대로
            return max(pick_every, 1), OUTPUT_FPS

        # pick_every가 너무 큼 → output_fps를 올려서 프레임 빽빽하게
        # pick_every = MAX_PICK_EVERY로 고정, output_fps를 역산
        # output_frames = total_frames / MAX_PICK_EVERY
        # output_fps = output_frames / output_seconds
        adjusted_output_frames = math.ceil(total_frames / MAX_PICK_EVERY)
        adjusted_fps = math.ceil(adjusted_output_frames / output_seconds)
        adjusted_fps = min(adjusted_fps, 240)  # 최대 240fps (대부분 플레이어 지원)

        # adjusted_fps로 다시 pick_every 계산
        actual_output_frames = adjusted_fps * output_seconds
        pick_every = math.floor(total_frames / actual_output_frames)

        logger.info(
            f"high frame density: pick_every={pick_every}, "
            f"output_fps={adjusted_fps} (was {OUTPUT_FPS})"
        )
        return max(pick_every, 1), adjusted_fps

    # ── 비율별 crop/scale ──

    def _get_crop_and_scale(self, aspect_ratio: str) -> tuple[str, str, str]:
        """비율별 crop → scale → pad 필터 반환."""
        # crop 값을 2의 배수로 내림 (h264 짝수 해상도 필수)
        configs = {
            "9:16": (
                "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0",
                "scale=1080:1920",
                "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
            ),
            "1:1": (
                "crop=trunc(ih/2)*2:trunc(ih/2)*2:(iw-trunc(ih/2)*2)/2:0",
                "scale=1080:1080",
                "pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black",
            ),
            "4:5": (
                "crop=trunc(ih*4/5/2)*2:ih:(iw-trunc(ih*4/5/2)*2)/2:0",
                "scale=1080:1350",
                "pad=1080:1350:(ow-iw)/2:(oh-ih)/2:black",
            ),
            "16:9": (
                "",
                "scale=1920:1080",
                "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
            ),
        }
        return configs.get(aspect_ratio, configs["16:9"])

    # ── FFmpeg 실행 ──

    async def _run_ffmpeg(
        self,
        task_id: str,
        input_path: str,
        output_path: str,
        output_seconds: int,
        total_frames: int,
        duration: float,
        aspect_ratio: str = "16:9",
    ) -> None:
        """FFmpeg로 타임랩스 변환 (균등 프레임 추출 방식)."""
        task = task_store[task_id]
        try:
            # 출력에 필요한 프레임 수
            output_frames = OUTPUT_FPS * output_seconds  # e.g. 30 * 30 = 900

            if total_frames <= 0:
                recording_seconds = task.get("recording_seconds", 0)
                total_frames = int(recording_seconds * 30)
                logger.warning(f"[{task_id}] ffprobe failed, estimated frames={total_frames}")

            # 타임랩스 파라미터 계산 (output_seconds 고정, fps 동적)
            pick_every, actual_fps = self._calc_timelapse_params(total_frames, output_seconds)

            min_required = actual_fps * output_seconds
            if total_frames <= min_required:
                pick_every = 1
                select_filter = "select='1'"
                logger.warning(f"[{task_id}] not enough frames: {total_frames}, using all")
            else:
                select_filter = f"select='not(mod(n\\,{pick_every}))'"
                logger.info(
                    f"[{task_id}] timelapse: {total_frames} frames, "
                    f"pick every {pick_every}th, {actual_fps}fps → {output_seconds}s"
                )

            # 비율별 crop/scale
            crop_filter, scale_filter, pad_filter = self._get_crop_and_scale(aspect_ratio)

            # 필터 체인: select → crop → setpts → scale → pad → drawtext
            filters = [select_filter]
            if crop_filter:
                filters.append(crop_filter)
            filters.extend([
                f"setpts=N/{actual_fps}/TB",
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
                "-vf", filter_str,
                "-r", str(actual_fps),
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
