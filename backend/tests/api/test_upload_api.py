import io

import pytest
from httpx import AsyncClient


class TestUploadFile:
    """POST /api/upload - 영상 파일 업로드

    요구사항:
    ========
    1. 목적: 녹화된 영상 파일을 서버에 업로드
    2. 입력: multipart/form-data (file: mp4, mov)
    3. 응답: fileId (UUID), filename
    4. 에러: 파일 누락 400, 지원하지 않는 형식 400
    5. 제약: 최대 2GB
    """

    @pytest.mark.asyncio
    async def test_should_upload_file_when_valid_video(self, client: AsyncClient) -> None:
        """정상 업로드

        Given: 유효한 mp4 영상 파일
        When: 업로드 API 호출
        Then: 200 반환, fileId와 filename 포함
        """
        # Given
        file_content = b"fake-video-content"
        files = {"file": ("recording.mp4", io.BytesIO(file_content), "video/mp4")}

        # When
        response = await client.post("/api/upload", files=files)

        # Then
        assert response.status_code == 200
        data = response.json()
        assert "fileId" in data
        assert data["filename"] is not None

    @pytest.mark.asyncio
    async def test_should_upload_mp4_file(self, client: AsyncClient) -> None:
        """MP4 파일 업로드

        Given: 유효한 mp4 영상 파일
        When: 업로드 API 호출
        Then: 200 반환
        """
        # Given
        files = {"file": ("recording.mp4", io.BytesIO(b"fake-mp4"), "video/mp4")}

        # When
        response = await client.post("/api/upload", files=files)

        # Then
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_should_upload_mov_file(self, client: AsyncClient) -> None:
        """MOV 파일 업로드

        Given: 유효한 mov 영상 파일
        When: 업로드 API 호출
        Then: 200 반환
        """
        # Given
        files = {"file": ("recording.mov", io.BytesIO(b"fake-mov"), "video/quicktime")}

        # When
        response = await client.post("/api/upload", files=files)

        # Then
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_should_reject_unsupported_format(self, client: AsyncClient) -> None:
        """지원하지 않는 형식 거부

        Given: txt 파일
        When: 업로드 API 호출
        Then: 400 반환
        """
        # Given
        files = {"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")}

        # When
        response = await client.post("/api/upload", files=files)

        # Then
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_should_reject_missing_file(self, client: AsyncClient) -> None:
        """파일 누락 시 거부

        Given: 파일 없이 요청
        When: 업로드 API 호출
        Then: 422 반환
        """
        # When
        response = await client.post("/api/upload")

        # Then
        assert response.status_code == 422
