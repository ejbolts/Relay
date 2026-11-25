"""The files that let Relay links open the installed native app instead of the browser.

iOS reads `apple-app-site-association` and Android reads `assetlinks.json` from this server's
domain. Each is served only when the operator has set the app's identity (see `Settings`);
otherwise it is a 404, so phones keep opening links in the browser.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .auth import AppSettings
from .errors import api_error

router = APIRouter(tags=["App links"])

# Phones cache these files; a day keeps a changed signing key from waiting long.
HEADERS = {"Cache-Control": "public, max-age=86400"}


def apple_app_site_association(team_id: str, bundle_id: str) -> dict:
    return {
        "applinks": {
            "details": [
                {
                    "appIDs": [f"{team_id}.{bundle_id}"],
                    # The web's links keep their screen in the fragment: a friend's QR code is
                    # `/#friend=<id>`, and screen links are `/#<screen>`. The bare address and
                    # the API stay in the browser.
                    "components": [
                        {"/": "/api/*", "exclude": True},
                        {"/": "/", "#": "friend=*", "comment": "Friend links and QR codes"},
                        {"/": "/", "#": "?*", "comment": "Screen links such as /#social"},
                    ],
                }
            ]
        }
    }


def asset_links(package: str, fingerprints: list[str]) -> list[dict]:
    return [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": package,
                "sha256_cert_fingerprints": fingerprints,
            },
        }
    ]


def not_configured():
    return api_error(404, "not_found", "Not found.")


@router.get("/.well-known/apple-app-site-association", include_in_schema=False)
def apple_association(settings: AppSettings) -> JSONResponse:
    if not settings.ios_team_id or not settings.ios_bundle_id:
        raise not_configured()
    return JSONResponse(
        apple_app_site_association(settings.ios_team_id, settings.ios_bundle_id),
        headers=HEADERS,
    )


@router.get("/.well-known/assetlinks.json", include_in_schema=False)
def android_asset_links(settings: AppSettings) -> JSONResponse:
    if not settings.android_package or not settings.android_sha256_fingerprints:
        raise not_configured()
    return JSONResponse(
        asset_links(settings.android_package, settings.android_sha256_fingerprints.split(",")),
        headers=HEADERS,
    )
