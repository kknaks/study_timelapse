import os
import tempfile

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def setup_test_env(tmp_path):
    """테스트마다 임시 upload 디렉토리 사용 + store 리셋."""
    # 임시 디렉토리 설정
    settings.upload_dir = str(tmp_path / "uploads")
    os.makedirs(settings.upload_dir, exist_ok=True)

    # In-memory store 리셋
    from app.services.upload_service import file_store
    from app.services.timelapse_service import task_store
    file_store.clear()
    task_store.clear()

    # upload/timelapse 서비스가 같은 store를 공유하도록
    from app.api.v1 import upload as upload_mod, timelapse as timelapse_mod
    upload_mod.upload_service = upload_mod.UploadService()
    timelapse_mod.upload_service = upload_mod.upload_service
    timelapse_mod.timelapse_service = timelapse_mod.TimelapseService(upload_mod.upload_service)

    yield


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
