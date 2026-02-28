from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, sessions, stats, timelapse, upload, users

v1_router = APIRouter()

v1_router.include_router(upload.router, tags=["Upload"])
v1_router.include_router(timelapse.router, tags=["Timelapse"])
v1_router.include_router(auth.router, tags=["Auth"])
v1_router.include_router(users.router, tags=["Users"])
v1_router.include_router(sessions.router, tags=["Sessions"])
v1_router.include_router(stats.router, tags=["Stats"])
