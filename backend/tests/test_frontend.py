import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.frontend import FrontendFiles


@pytest.fixture
def frontend_client(tmp_path):
    (tmp_path / "assets").mkdir()
    for name in [
        "index.html",
        "sw.js",
        "manifest.webmanifest",
        "push-notifications.js",
        "release.json",
    ]:
        (tmp_path / name).write_text("current app", encoding="utf-8")
    (tmp_path / "assets" / "index-abc123.js").write_text("current bundle", encoding="utf-8")
    app = FastAPI()
    app.mount("/", FrontendFiles(directory=tmp_path, html=True))
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/index.html",
        "/sw.js",
        "/manifest.webmanifest",
        "/push-notifications.js",
        "/release.json",
    ],
)
def test_app_shell_and_worker_revalidate(frontend_client, path):
    response = frontend_client.get(path)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache, max-age=0, must-revalidate"
    unchanged = frontend_client.get(path, headers={"If-None-Match": response.headers["etag"]})
    assert unchanged.status_code == 304
    assert "no-cache" in unchanged.headers["cache-control"]


def test_hashed_assets_can_be_cached(frontend_client):
    response = frontend_client.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_missing_old_bundle_is_not_served_as_html(frontend_client):
    assert frontend_client.get("/assets/old-design.js").status_code == 404
