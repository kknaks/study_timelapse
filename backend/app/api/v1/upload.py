from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.upload import UploadResponse
from app.services.upload_service import UploadService

router = APIRouter()
upload_service = UploadService()


@router.post(
    "/upload",
    summary="영상 파일 업로드",
    response_model=UploadResponse,
)
async def upload_file(file: UploadFile) -> UploadResponse:
    """녹화된 영상 파일을 서버에 업로드한다."""
    try:
        result = await upload_service.upload(file)
        return UploadResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
