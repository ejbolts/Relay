from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn, Protocol

from .config import Settings

logger = logging.getLogger(__name__)
# Upload-only access cannot read owner-only processingDetails. This scope authorizes both
# videos.insert and videos.list(part=processingDetails) for the account's own videos.
YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"


class YouTubeUploadError(Exception):
    pass


@dataclass(frozen=True)
class UploadResult:
    video_id: str
    url: str


class YouTubeUploader(Protocol):
    is_mock: bool

    def upload(self, video_path: Path, title: str, description: str) -> UploadResult: ...

    def processing_status(self, video_id: str) -> str: ...


class MockYouTubeUploader:
    """Deterministic local implementation for development and automated tests."""

    is_mock = True

    def upload(self, video_path: Path, title: str, description: str) -> UploadResult:
        if not video_path.exists():
            raise YouTubeUploadError("Combined video is missing.")
        video_id = f"mock-{video_path.stem[-12:]}"
        logger.info("Mock YouTube upload complete", extra={"video_id": video_id, "title": title})
        return UploadResult(video_id=video_id, url=f"https://youtu.be/{video_id}")

    def processing_status(self, video_id: str) -> str:
        return "succeeded"


class GoogleYouTubeUploader:
    is_mock = False

    def __init__(self, settings: Settings):
        self.settings = settings

    def _raise_api_error(self, error: Exception) -> NoReturn:
        raise YouTubeUploadError(str(error)) from error

    def _youtube_client(self):
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
        except ImportError as error:
            raise YouTubeUploadError("Google upload dependencies are not installed.") from error

        token_path = self.settings.youtube_token_path
        if not token_path.exists():
            raise YouTubeUploadError(
                f"No YouTube token at {token_path}. Run `python -m app.oauth_setup` first."
            )
        try:
            credentials = Credentials.from_authorized_user_file(str(token_path), [YOUTUBE_SCOPE])
            if credentials.expired and credentials.refresh_token:
                credentials.refresh(Request())
                token_path.write_text(credentials.to_json(), encoding="utf-8")
            if not credentials.valid:
                raise YouTubeUploadError("YouTube token is invalid. Run OAuth setup again.")
            return build("youtube", "v3", credentials=credentials, cache_discovery=False)
        except YouTubeUploadError:
            raise
        except Exception as error:  # Google client exposes several transport-specific exceptions.
            self._raise_api_error(error)

    def upload(self, video_path: Path, title: str, description: str) -> UploadResult:
        try:
            from googleapiclient.http import MediaFileUpload
        except ImportError as error:
            raise YouTubeUploadError("Google upload dependencies are not installed.") from error

        try:
            youtube = self._youtube_client()
            media = MediaFileUpload(
                str(video_path), mimetype="video/mp4", resumable=True, chunksize=8 * 1024 * 1024
            )
            request = youtube.videos().insert(
                part="snippet,status",
                body={
                    "snippet": {"title": title[:100], "description": description[:5_000]},
                    "status": {"privacyStatus": self.settings.youtube_privacy_status},
                },
                media_body=media,
            )
            response = None
            while response is None:
                _, response = request.next_chunk()
            video_id = response["id"]
            return UploadResult(video_id=video_id, url=f"https://youtu.be/{video_id}")
        except YouTubeUploadError:
            raise
        except Exception as error:  # Google client exposes several transport-specific exceptions.
            self._raise_api_error(error)

    def processing_status(self, video_id: str) -> str:
        try:
            response = (
                self._youtube_client()
                .videos()
                .list(part="processingDetails", id=video_id)
                .execute()
            )
            items = response.get("items", [])
            if not items:
                raise YouTubeUploadError("YouTube could not find the uploaded video.")
            return str(items[0].get("processingDetails", {}).get("processingStatus", "processing"))
        except YouTubeUploadError:
            raise
        except Exception as error:  # Google client exposes several transport-specific exceptions.
            self._raise_api_error(error)


def make_uploader(
    settings: Settings,
    *,
    session_factory=None,
    user_id: str | None = None,
    channel_id: str | None = None,
) -> YouTubeUploader:
    if settings.youtube_mock_mode:
        return MockYouTubeUploader()
    # Imported lazily because the connection layer builds on this uploader interface.
    from .youtube_connections import ConnectedYouTubeUploader

    if session_factory is None:
        raise YouTubeUploadError("A personal YouTube connection is required.")
    return ConnectedYouTubeUploader(settings, session_factory, user_id, channel_id)
