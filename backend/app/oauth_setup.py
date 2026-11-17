from __future__ import annotations

from .config import get_settings
from .youtube import YOUTUBE_SCOPE


def main() -> None:
    """Run once on the home PC to create the local YouTube OAuth token."""
    from google_auth_oauthlib.flow import InstalledAppFlow

    settings = get_settings()
    if not settings.youtube_client_secret_path.exists():
        raise SystemExit(f"Client secret file not found: {settings.youtube_client_secret_path}")
    flow = InstalledAppFlow.from_client_secrets_file(
        str(settings.youtube_client_secret_path), [YOUTUBE_SCOPE]
    )
    credentials = flow.run_local_server(port=0)
    settings.youtube_token_path.parent.mkdir(parents=True, exist_ok=True)
    settings.youtube_token_path.write_text(credentials.to_json(), encoding="utf-8")
    print(f"OAuth token saved to {settings.youtube_token_path}")


if __name__ == "__main__":
    main()
