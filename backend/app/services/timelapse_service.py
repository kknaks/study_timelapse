from __future__ import annotations

import asyncio
import logging
import math
import os
import uuid

from app.config import settings
from app.services.upload_service import UploadService

logger = logging.getLogger(__name__)

task_store: dict[str, dict] = {}

BASE_FPS = 30
MAX_PICK_EVERY = 60  # 이 이상이면 뚝뚝 끊김 → fps 올려서 보상


class TimelapseService:
    """타임랩스 변환 서비스."""

    def __init__(self, upload_service: UploadService) -> None:
        self.upload_service = upload_service

    async def create_task(
        self,
        file_id: str,
        output_seconds: int,
        recording_seconds: float,
        aspect_ratio: str = "9:16",
    ) -> str:
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
            self._run_ffmpeg(
                task_id, file_info["file_path"], output_path,
                output_seconds, total_frames, duration,
                recording_seconds, aspect_ratio,
            )
        )

        return task_id

    def get_task(self, task_id: str) -> dict | None:
        return task_store.get(task_id)

    # ── 타임랩스 파라미터 계산 ──

    def _calc_timelapse_params(
        self, total_frames: int, output_seconds: int
    ) -> tuple[str, int, int]:
        """
        Returns (case, pick_every, output_fps)

        case1: 정상 — pick_every <= MAX, 30fps로 충분
        case2: 프레임 부족 — 전부 사용, 짧게 출력
        case3: 프레임 과다 — pick_every 고정, fps 올려서 빽빽하게
        """
        needed_frames = BASE_FPS * output_seconds  # 30fps * 30s = 900

        # case2: 프레임 부족 → 전부 사용
        if total_frames <= needed_frames:
            # 있는 프레임 전부 30fps로 출력 → 자연스럽게 짧은 영상
            actual_seconds = max(1, total_frames // BASE_FPS)
            logger.info(
                f"case2: frames={total_frames} <= needed={needed_frames}, "
                f"output={actual_seconds}s (all frames @ {BASE_FPS}fps)"
            )
            return "case2", 1, BASE_FPS

        pick_every = math.floor(total_frames / needed_frames)

        # case1: 정상 범위
        if pick_every <= MAX_PICK_EVERY:
            logger.info(f"case1: pick_every={pick_every}, {BASE_FPS}fps → {output_seconds}s")
            return "case1", pick_every, BASE_FPS

        # case3: 프레임 과다 → fps 올려서 보상
        # pick_every를 MAX_PICK_EVERY로 고정, fps를 역산
        usable_frames = total_frames // MAX_PICK_EVERY
        adjusted_fps = math.ceil(usable_frames / output_seconds)
        adjusted_fps = min(adjusted_fps, 240)  # 플레이어 호환 최대

        # 역산한 fps로 다시 pick_every 확인
        actual_needed = adjusted_fps * output_seconds
        pick_every = max(1, math.floor(total_frames / actual_needed))

        logger.info(
            f"case3: frames={total_frames}, pick_every={pick_every}, "
            f"{adjusted_fps}fps → {output_seconds}s"
        )
        return "case3", pick_every, adjusted_fps

    # ── 비율별 crop/scale ──

    def _get_crop_and_scale(self, aspect_ratio: str) -> tuple[str, str, str]:
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
        recording_seconds: float,
        aspect_ratio: str = "9:16",
    ) -> None:
        task = task_store[task_id]
        try:
            # 프레임수/길이 파악 (업로드 시 실패했을 경우 재시도)
            if total_frames <= 0 or duration <= 0:
                total_frames, duration = await self._probe_clean(input_path, recording_seconds)
                logger.info(f"[{task_id}] probed: frames={total_frames}, duration={duration}s")

            # recordingSeconds가 0이면 ffprobe duration으로 대체
            if recording_seconds <= 0 and duration > 0:
                recording_seconds = duration
                task["recording_seconds"] = recording_seconds
                logger.warning(f"[{task_id}] recordingSeconds was 0, using duration={duration}s")

            case, pick_every, actual_fps = self._calc_timelapse_params(total_frames, output_seconds)

            if case == "case2":
                actual_output = max(1, total_frames // BASE_FPS)
                task["output_seconds"] = actual_output

            # ── Pass 2: clean mp4 → 타임랩스 ──
            source_duration = duration if duration > 0 else recording_seconds
            if source_duration > 0 and case != "case2":
                needed_frames = actual_fps * output_seconds
                sample_fps = needed_frames / source_duration
            else:
                sample_fps = BASE_FPS

            crop_filter, scale_filter, pad_filter = self._get_crop_and_scale(aspect_ratio)

            filters = [f"fps={sample_fps:.4f}"]
            if crop_filter:
                filters.append(crop_filter)
            filters.extend([
                f"setpts=N/{actual_fps}/TB",
                f"{scale_filter}:force_original_aspect_ratio=decrease",
                pad_filter,
            ])
            filter_str = ",".join(filters)

            logger.info(
                f"[{task_id}] [{case}] sample_fps={sample_fps:.4f}, "
                f"output_fps={actual_fps}"
            )

            cmd = [
                "ffmpeg", "-y",
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

            logger.info(f"[{task_id}] pass2 cmd: {' '.join(cmd)}")

            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()

            stderr_text = stderr.decode() if stderr else ""
            logger.info(f"[{task_id}] pass2 exit: {process.returncode}")
            if stderr_text:
                logger.info(f"[{task_id}] pass2 stderr (last 500): {stderr_text[-500:]}")

            if process.returncode == 0 and os.path.exists(output_path):
                task["status"] = "completed"
                task["progress"] = 100
            else:
                task["status"] = "failed"
                logger.error(f"[{task_id}] pass2 failed (code {process.returncode})")

        except Exception as e:
            task["status"] = "failed"
            logger.exception(f"[{task_id}] Conversion error: {e}")

    async def _probe_clean(self, file_path: str, fallback_seconds: float) -> tuple[int, float]:
        """깨끗한 mp4에서 프레임수/길이 파악."""
        import json
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=nb_frames,duration",
            "-show_entries", "format=duration",
            "-of", "json",
            file_path,
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await proc.communicate()
            data = json.loads(out.decode())

            streams = data.get("streams", [])
            total_frames = 0
            duration = 0.0

            if streams:
                val = streams[0].get("nb_frames", "0")
                if val and val != "N/A":
                    total_frames = int(val)
                val = streams[0].get("duration", "N/A")
                if val and val != "N/A":
                    duration = float(val)

            if duration <= 0:
                val = data.get("format", {}).get("duration", "N/A")
                if val and val != "N/A":
                    duration = float(val)

            if duration <= 0:
                duration = fallback_seconds

            if total_frames <= 0 and duration > 0:
                total_frames = int(duration * 30)

            return total_frames, duration
        except Exception:
            return int(fallback_seconds * 30), fallback_seconds
