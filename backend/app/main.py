from fastapi import FastAPI
from app.api.v1.router import v1_router
from app.exceptions import AppException, app_exception_handler

app = FastAPI(title="study_timelapse", version="0.1.0")

app.add_exception_handler(AppException, app_exception_handler)
app.include_router(v1_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
