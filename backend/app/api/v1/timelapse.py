from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.schemas.timelapse import TimelapseCreateResponse, TimelapseRequest, TimelapseStatusResponse
from app.services.timelapse_service import TimelapseService
from app.services.upload_service import UploadService

router = APIRouter()
upload_service = UploadService()
timelapse_service = TimelapseService(upload_service)


@router.post(
    "/timelapse",
    summary="타임랩스 변환 요청",
    response_model=TimelapseCreateResponse,
    status_code=202,
)
async def create_timelapse(request: dict) -> TimelapseCreateResponse:
    """업로드된 영상을 타임랩스로 변환하는 작업을 시작한다."""
    file_id = request.get("fileId")
    output_seconds = request.get("outputSeconds")
    recording_seconds = request.get("recordingSeconds")
    aspect_ratio = request.get("aspectRatio", "9:16")

    if not file_id or output_seconds not in (30, 60, 90):
        raise HTTPException(status_code=400, detail="Invalid request: outputSeconds must be 30, 60, or 90")

    if recording_seconds is None:
        raise HTTPException(status_code=400, detail="Invalid request: recordingSeconds is required")
    # recordingSeconds=0은 허용 (프론트 타이머 버그 대응, ffprobe로 보정)

    valid_ratios = ("9:16", "1:1", "4:5", "16:9")
    if aspect_ratio not in valid_ratios:
        raise HTTPException(status_code=400, detail=f"Invalid aspectRatio: must be one of {valid_ratios}")

    try:
        task_id = await timelapse_service.create_task(file_id, output_seconds, recording_seconds, aspect_ratio)
        return TimelapseCreateResponse(taskId=task_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@router.get(
    "/timelapse/{task_id}",
    summary="변환 상태 조회",
    response_model=TimelapseStatusResponse,
)
async def get_timelapse_status(task_id: str) -> TimelapseStatusResponse:
    """변환 작업의 진행 상태를 조회한다."""
    task = timelapse_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    download_url = f"/api/download/{task_id}" if task["status"] == "completed" else None

    return TimelapseStatusResponse(
        taskId=task["task_id"],
        status=task["status"],
        progress=task["progress"],
        outputSeconds=task.get("output_seconds"),
        downloadUrl=download_url,
    )


@router.get(
    "/download/{task_id}",
    summary="타임랩스 다운로드",
)
async def download_timelapse(task_id: str) -> FileResponse:
    """완성된 타임랩스 영상을 다운로드한다."""
    task = timelapse_service.get_task(task_id)
    if not task or task["status"] != "completed":
        raise HTTPException(status_code=404, detail="File not found or not ready")

    output_path = task["output_path"]
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Output file not found")

    return FileResponse(
        path=output_path,
        media_type="video/mp4",
        filename="timelapse.mp4",
    )


@router.post(
    "/timelapse/{task_id}/save",
    summary="타임랩스 메타데이터 저장",
    status_code=200,
)
async def save_timelapse_meta(task_id: str, request: dict) -> dict:
    """프론트에서 오버레이 합성 후 테마 메타데이터를 기록한다."""
    task = timelapse_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # 메타데이터 저장 (현재 in-memory, 추후 DB)
    overlay = request.get("overlay", {})
    composited = request.get("composited", False)

    task["overlay"] = overlay
    task["composited"] = composited

    return {"success": True}
