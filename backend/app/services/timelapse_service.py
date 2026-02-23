from __future__ import annotations

import asyncio
import json
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
        asyncio.create_task(
            self._run_ffmpeg(task_id, file_info["file_path"], output_path, output_seconds)
        )

        return task_id

    def get_task(self, task_id: str) -> Optional[dict]:
        return task_store.get(task_id)

    async def _run_ffmpeg(
        self, task_id: str, input_path: str, output_path: str, output_seconds: int
    ) -> None:
        """FFmpeg로 타임랩스 변환."""
        task = task_store[task_id]
        try:
            logger.info(f"[{task_id}] Starting FFmpeg conversion: {input_path}")

            # 원본 영상 길이 조회
            duration = await self._get_duration(input_path)
            logger.info(f"[{task_id}] Input duration: {duration}s")

            if duration <= 0:
                logger.error(f"[{task_id}] Could not determine video duration")
                # duration을 못 구하면 기본 배속 사용
                speed_factor = 10.0
            else:
                speed_factor = duration / output_seconds

            logger.info(f"[{task_id}] Speed factor: {speed_factor}x")

            # FFmpeg 타임랩스 변환 + 경과시간 오버레이
            # setpts로 배속, drawtext로 경과시간 표시
            filter_str = (
                f"setpts=PTS/{speed_factor},"
                f"drawtext=text='%{{pts\\:hms}}':"
                f"fontsize=36:fontcolor=white:"
                f"x=10:y=10:box=1:boxcolor=black@0.5:boxborderw=5"
            )

            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-vf", filter_str,
                "-an",
                "-c:v", "libx264",
                "-preset", "fast",
                output_path,
            ]

            logger.info(f"[{task_id}] FFmpeg cmd: {' '.join(cmd)}")

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

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

    async def _get_duration(self, file_path: str) -> float:
        """영상 길이(초) 조회. 여러 방법 시도."""
        # 방법 1: format.duration
        duration = await self._probe_format_duration(file_path)
        if duration > 0:
            return duration

        # 방법 2: 스트림 디코딩으로 실제 길이 측정 (webm 등 duration 메타데이터 없는 경우)
        logger.info(f"format.duration failed, trying stream decode for {file_path}")
        duration = await self._probe_stream_duration(file_path)
        if duration > 0:
            return duration

        logger.error(f"Could not determine duration for {file_path}")
        return 0

    async def _probe_format_duration(self, file_path: str) -> float:
        """ffprobe format.duration으로 조회."""
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            file_path,
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()
            stdout_text = stdout.decode() if stdout else ""
            if not stdout_text.strip():
                return 0
            data = json.loads(stdout_text)
            return float(data.get("format", {}).get("duration", 0))
        except Exception:
            return 0

    async def _probe_stream_duration(self, file_path: str) -> float:
        """ffprobe로 스트림을 읽어 실제 길이 측정 (webm 대응)."""
        cmd = [
            "ffprobe", "-v", "quiet",
            "-select_streams", "v:0",
            "-count_packets",
            "-show_entries", "stream=duration,nb_read_packets,r_frame_rate",
            "-print_format", "json",
            file_path,
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()
            stdout_text = stdout.decode() if stdout else ""
            logger.info(f"stream probe output: {stdout_text[:500]}")
            if not stdout_text.strip():
                return 0

            data = json.loads(stdout_text)
            streams = data.get("streams", [])
            if not streams:
                return 0

            stream = streams[0]

            # stream.duration이 있으면 사용
            dur = float(stream.get("duration", 0))
            if dur > 0:
                return dur

            # nb_read_packets + r_frame_rate로 계산
            packets = int(stream.get("nb_read_packets", 0))
            fps_str = stream.get("r_frame_rate", "30/1")
            num, den = fps_str.split("/")
            fps = float(num) / float(den) if float(den) != 0 else 30.0
            if packets > 0 and fps > 0:
                estimated = packets / fps
                logger.info(f"Estimated duration from packets: {packets}/{fps} = {estimated}s")
                return estimated

            return 0
        except Exception as e:
            logger.exception(f"stream probe error: {e}")
            return 0
