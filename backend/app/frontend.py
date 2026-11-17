from pathlib import Path

from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope


class FrontendFiles(StaticFiles):
    """Revalidate the app shell and worker; only hashed assets are immutable."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if Path(path).parts[:1] == ("assets",) and response.status_code in {200, 304}:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache, max-age=0, must-revalidate"
        return response
