from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SESSION_COOKIE = "gym_session"


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables or a local .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="GYM_", extra="ignore")

    data_dir: Path = Field(default=Path("data"))
    database_path: Path = Field(default=Path("data/gym-video-logger.db"))
    max_file_size_bytes: int = Field(default=20 * 1024 * 1024 * 1024, gt=0)
    max_session_size_bytes: int = Field(default=100 * 1024 * 1024 * 1024, gt=0)
    # Starting value for the admin console's photo upload limit; the console overrides it.
    max_photo_size_bytes: int = Field(default=5 * 1024 * 1024, gt=0)
    upload_concurrency: int = Field(default=2, ge=1, le=8)
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    youtube_client_secret_path: Path = Path("secrets/youtube-client-secret.json")
    youtube_token_path: Path = Path("secrets/youtube-token.json")
    youtube_web_client_secret_path: Path = Path("secrets/youtube-web-client-secret.json")
    youtube_credentials_key_path: Path = Path("secrets/youtube-credentials.key")
    youtube_redirect_uri: str | None = None
    youtube_privacy_status: str = "unlisted"
    youtube_mock_mode: bool = True
    youtube_title_template: str = "{session_name} — {workout_date}"
    youtube_description_template: str = "{notes}\n\n{chapters}"
    youtube_processing_poll_seconds: int = Field(default=20, ge=10, le=3_600)
    web_push_vapid_private_key_path: Path = Path("data/web-push-vapid-private.pem")
    web_push_contact_email: str = "mailto:admin@localhost"
    delete_originals_after_success: bool = True
    delete_output_after_success: bool = True
    trim_start_seconds: float = Field(default=5, ge=0, le=60)
    trim_end_seconds: float = Field(default=5, ge=0, le=60)
    seed_sample_data: bool = True
    cookie_secure: bool = False
    # Days without using the app before a sign-in ends; any use pushes the deadline back.
    session_days: int = Field(default=90, ge=1, le=365)
    # Browsers share cookies across ports, so a second instance on the same host needs its own name.
    session_cookie: str = Field(default=DEFAULT_SESSION_COOKIE, pattern=r"^[A-Za-z0-9_-]+$")
    allow_registration: bool = False
    registration_invite_code: str | None = None
    # Starting value for the admin console's video switch; the console overrides it.
    video_uploads: Literal["off", "admin", "everyone"] = "admin"
    api_docs: bool = False

    @field_validator("youtube_privacy_status")
    @classmethod
    def validate_privacy(cls, value: str) -> str:
        if value not in {"private", "unlisted", "public"}:
            raise ValueError("must be private, unlisted, or public")
        return value

    @field_validator("registration_invite_code", mode="before")
    @classmethod
    def blank_invite_code_is_none(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            value = value.strip()
        return value or None

    @field_validator("youtube_title_template", "youtube_description_template", mode="before")
    @classmethod
    def decode_template_newlines(cls, value: str) -> str:
        # .env files commonly represent newlines as the two literal characters \ and n.
        return value.replace("\\n", "\n") if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_sizes(self) -> Settings:
        if self.max_session_size_bytes < self.max_file_size_bytes:
            raise ValueError("max_session_size_bytes must be at least max_file_size_bytes")
        return self

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def normalized_dir(self) -> Path:
        return self.data_dir / "normalized"

    @property
    def output_dir(self) -> Path:
        return self.data_dir / "outputs"

    @property
    def machine_photos_dir(self) -> Path:
        return self.data_dir / "machine-photos"

    @property
    def profile_photos_dir(self) -> Path:
        return self.data_dir / "profile-photos"

    @property
    def account_backups_dir(self) -> Path:
        return self.data_dir / "account-backups"

    def ensure_directories(self) -> None:
        for directory in (
            self.data_dir,
            self.uploads_dir,
            self.normalized_dir,
            self.output_dir,
            self.machine_photos_dir,
            self.profile_photos_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
