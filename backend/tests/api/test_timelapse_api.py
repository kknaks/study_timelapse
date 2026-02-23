import io

import pytest
from httpx import AsyncClient


class TestCreateTimelapse:
    """POST /api/timelapse - 타임랩스 변환 요청

    요구사항:
    ========
    1. 목적: 업로드된 영상을 타임랩스로 변환 시작
    2. 입력: fileId, outputSeconds (30, 60, 90)
    3. 응답: taskId (202 Accepted)
    4. 에러: fileId 없음 404, 잘못된 outputSeconds 400
    5. 비즈니스 규칙: outputSeconds는 30, 60, 90만 허용
    """

    @pytest.mark.asyncio
    async def test_should_create_task_when_valid_request(self, client: AsyncClient) -> None:
        """정상 변환 요청

        Given: 유효한 fileId + outputSeconds
        When: 타임랩스 변환 API 호출
        Then: 202 반환, taskId 포함
        """
        # Given - 먼저 파일 업로드
        files = {"file": ("test.mp4", io.BytesIO(b"fake-video"), "video/mp4")}
        upload_res = await client.post("/api/upload", files=files)
        file_id = upload_res.json()["fileId"]

        # When
        response = await client.post("/api/timelapse", json={
            "fileId": file_id,
            "outputSeconds": 60, "recordingSeconds": 120,
        })

        # Then
        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data

    @pytest.mark.asyncio
    async def test_should_reject_invalid_output_seconds(self, client: AsyncClient) -> None:
        """잘못된 outputSeconds 거부

        Given: outputSeconds가 45 (허용값 아님)
        When: 타임랩스 변환 API 호출
        Then: 400 반환
        """
        # Given
        files = {"file": ("test.mp4", io.BytesIO(b"fake-video"), "video/mp4")}
        upload_res = await client.post("/api/upload", files=files)
        file_id = upload_res.json()["fileId"]

        # When
        response = await client.post("/api/timelapse", json={
            "fileId": file_id,
            "outputSeconds": 45,
        })

        # Then
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_should_reject_nonexistent_file(self, client: AsyncClient) -> None:
        """존재하지 않는 fileId 거부

        Given: 존재하지 않는 fileId
        When: 타임랩스 변환 API 호출
        Then: 404 반환
        """
        # When
        response = await client.post("/api/timelapse", json={
            "fileId": "nonexistent-id",
            "outputSeconds": 60, "recordingSeconds": 120,
        })

        # Then
        assert response.status_code == 404


class TestGetTimelapseStatus:
    """GET /api/timelapse/{taskId} - 변환 상태 조회

    요구사항:
    ========
    1. 목적: 변환 작업 진행 상태 확인
    2. 응답: taskId, status, progress, downloadUrl
    3. 에러: 존재하지 않는 taskId 404
    """

    @pytest.mark.asyncio
    async def test_should_return_status_when_valid_task(self, client: AsyncClient) -> None:
        """정상 상태 조회

        Given: 유효한 taskId (변환 요청 후)
        When: 상태 조회 API 호출
        Then: 200 반환, status/progress 포함
        """
        # Given - 파일 업로드 → 변환 요청
        files = {"file": ("test.mp4", io.BytesIO(b"fake-video"), "video/mp4")}
        upload_res = await client.post("/api/upload", files=files)
        file_id = upload_res.json()["fileId"]

        task_res = await client.post("/api/timelapse", json={
            "fileId": file_id,
            "outputSeconds": 60, "recordingSeconds": 120,
        })
        task_id = task_res.json()["taskId"]

        # When
        response = await client.get(f"/api/timelapse/{task_id}")

        # Then
        assert response.status_code == 200
        data = response.json()
        assert data["taskId"] == task_id
        assert data["status"] in ("processing", "completed", "failed")
        assert 0 <= data["progress"] <= 100

    @pytest.mark.asyncio
    async def test_should_return_404_when_task_not_found(self, client: AsyncClient) -> None:
        """존재하지 않는 task 조회 시 404

        Given: 존재하지 않는 taskId
        When: 상태 조회 API 호출
        Then: 404 반환
        """
        # When
        response = await client.get("/api/timelapse/nonexistent-task-id")

        # Then
        assert response.status_code == 404


class TestDownloadTimelapse:
    """GET /api/download/{taskId} - 타임랩스 다운로드

    요구사항:
    ========
    1. 목적: 완성된 타임랩스 영상 다운로드
    2. 응답: video/mp4 바이너리
    3. 에러: 존재하지 않는 taskId 404, 변환 미완료 404
    """

    @pytest.mark.asyncio
    async def test_should_return_404_when_task_not_found(self, client: AsyncClient) -> None:
        """존재하지 않는 task 다운로드 시 404

        Given: 존재하지 않는 taskId
        When: 다운로드 API 호출
        Then: 404 반환
        """
        # When
        response = await client.get("/api/download/nonexistent-task-id")

        # Then
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_should_return_404_when_not_completed(self, client: AsyncClient) -> None:
        """변환 미완료 시 다운로드 404

        Given: 변환 중인 taskId
        When: 다운로드 API 호출
        Then: 404 반환
        """
        # Given
        files = {"file": ("test.mp4", io.BytesIO(b"fake-video"), "video/mp4")}
        upload_res = await client.post("/api/upload", files=files)
        file_id = upload_res.json()["fileId"]

        task_res = await client.post("/api/timelapse", json={
            "fileId": file_id,
            "outputSeconds": 60, "recordingSeconds": 120,
        })
        task_id = task_res.json()["taskId"]

        # When
        response = await client.get(f"/api/download/{task_id}")

        # Then
        assert response.status_code == 404
