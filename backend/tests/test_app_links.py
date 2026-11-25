from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, get_settings

FINGERPRINT = ":".join(["AB"] * 32)


@pytest.fixture
def anonymous(client):
    browser = TestClient(client.app)
    yield browser
    browser.close()


def test_files_are_not_served_until_configured(anonymous):
    for path in ("/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"):
        response = anonymous.get(path)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"


def test_apple_association_names_the_app_and_its_link_formats(anonymous, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ios_team_id", "ABCDE12345")
    response = anonymous.get("/.well-known/apple-app-site-association")
    # A team without a bundle is incomplete, so nothing is served yet.
    assert response.status_code == 404
    monkeypatch.setattr(settings, "ios_bundle_id", "com.example.relay")
    response = anonymous.get("/.well-known/apple-app-site-association")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    detail = response.json()["applinks"]["details"][0]
    assert detail["appIDs"] == ["ABCDE12345.com.example.relay"]
    # The API never opens the app; the friend fragment does.
    assert detail["components"][0] == {"/": "/api/*", "exclude": True}
    assert {"/": "/", "#": "friend=*", "comment": "Friend links and QR codes"} in detail[
        "components"
    ]


def test_asset_links_list_every_signing_fingerprint(anonymous, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "android_package", "com.example.relay")
    assert anonymous.get("/.well-known/assetlinks.json").status_code == 404
    other = ":".join(["0F"] * 32)
    monkeypatch.setattr(settings, "android_sha256_fingerprints", f"{FINGERPRINT},{other}")
    response = anonymous.get("/.well-known/assetlinks.json")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": "com.example.relay",
                "sha256_cert_fingerprints": [FINGERPRINT, other],
            },
        }
    ]


def test_settings_read_and_validate_the_app_identity(monkeypatch):
    monkeypatch.setenv("GYM_IOS_TEAM_ID", "ABCDE12345")
    monkeypatch.setenv("GYM_IOS_BUNDLE_ID", "com.example.relay")
    monkeypatch.setenv("GYM_ANDROID_PACKAGE", "com.example.relay")
    monkeypatch.setenv("GYM_ANDROID_SHA256_FINGERPRINTS", f" {FINGERPRINT.lower()} , ")
    settings = Settings(_env_file=None)
    assert settings.ios_team_id == "ABCDE12345"
    assert settings.android_sha256_fingerprints == FINGERPRINT
    # Blank values mean "not configured" rather than an error.
    monkeypatch.setenv("GYM_IOS_TEAM_ID", " ")
    monkeypatch.setenv("GYM_ANDROID_SHA256_FINGERPRINTS", "")
    settings = Settings(_env_file=None)
    assert settings.ios_team_id is None and settings.android_sha256_fingerprints is None
    for name, value in {
        "GYM_IOS_TEAM_ID": "short",
        "GYM_IOS_BUNDLE_ID": "no-dots",
        "GYM_ANDROID_PACKAGE": "com.example/relay",
        "GYM_ANDROID_SHA256_FINGERPRINTS": "AB:CD",
    }.items():
        with monkeypatch.context() as scoped:
            scoped.setenv(name, value)
            with pytest.raises(ValidationError):
                Settings(_env_file=None)
