from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import settings
from app.schemas.timelapse import (
    TimelapseCreateResponse,
    TimelapseFromPhotosRequest,
    TimelapseStatusResponse,
    UploadPhotosResponse,
)
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

    if not file_id or output_seconds not in (15, 30, 45, 60, 90, 120):
        raise HTTPException(
            status_code=400,
            detail="Invalid request: outputSeconds must be 15, 30, 45, 60, 90, or 120",
        )

    if recording_seconds is None:
        raise HTTPException(status_code=400, detail="Invalid request: recordingSeconds is required")
    # recordingSeconds=0은 허용 (프론트 타이머 버그 대응, ffprobe로 보정)

    valid_ratios = ("9:16", "1:1", "4:5", "16:9")
    if aspect_ratio not in valid_ratios:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid aspectRatio: must be one of {valid_ratios}",
        )

    try:
        task_id = await timelapse_service.create_task(
            file_id, output_seconds, recording_seconds, aspect_ratio,
        )
        return TimelapseCreateResponse(taskId=task_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="File not found") from e


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
    "/upload-photos",
    summary="사진 배열 업로드",
    response_model=UploadPhotosResponse,
    status_code=201,
)
async def upload_photos(files: list[UploadFile]) -> UploadPhotosResponse:
    """여러 장의 JPEG 사진을 업로드하고 fileId 목록을 반환한다."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    os.makedirs(settings.upload_dir, exist_ok=True)
    file_ids: list[str] = []

    for file in files:
        file_id = str(uuid.uuid4())
        file_path = os.path.join(settings.upload_dir, f"{file_id}.jpg")

        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        upload_service.store_photo(file_id, file_path)
        file_ids.append(file_id)

    return UploadPhotosResponse(fileIds=file_ids, count=len(file_ids))


@router.post(
    "/timelapse-from-photos",
    summary="사진 배열로 타임랩스 생성",
    response_model=TimelapseCreateResponse,
    status_code=202,
)
async def create_timelapse_from_photos(
    request: TimelapseFromPhotosRequest,
) -> TimelapseCreateResponse:
    """저장된 사진 ID 배열을 타임랩스 영상으로 변환하는 작업을 시작한다."""
    if not request.fileIds:
        raise HTTPException(status_code=400, detail="fileIds must not be empty")

    try:
        task_id = await timelapse_service.create_task_from_photos(
            request.fileIds,
            request.outputSeconds,
            request.aspectRatio,
        )
        return TimelapseCreateResponse(taskId=task_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


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
