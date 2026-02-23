from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import timelapse, upload

v1_router = APIRouter()

v1_router.include_router(upload.router, tags=["Upload"])
v1_router.include_router(timelapse.router, tags=["Timelapse"])
