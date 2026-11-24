from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import delete, select
from test_account_archive import download, send

from app.database import SessionLocal
from app.models import User, UserSetting
from app.tip_state import MAX_TIP_STATE_BYTES, TIP_STATE_KEY, merge_tip_states

CASES = json.loads(
    (Path(__file__).parents[2] / "frontend" / "src" / "tipSyncCases.json").read_text("utf-8")
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_merge_matches_the_shared_cases(case):
    # The same cases check mergeTipStates in frontend/src/tipSync.test.ts.
    assert merge_tip_states(case["stored"], case["incoming"]) == case["expected"]


def test_tips_start_empty(client):
    assert client.get("/api/tips").json() == {}


def test_tips_need_sign_in(anonymous_client):
    assert anonymous_client.get("/api/tips").status_code == 401
    assert anonymous_client.put("/api/tips", json={}).status_code == 401


def test_saves_merge_so_devices_cannot_erase_each_other(client):
    phone = {"seen": {"swap": "dismissed"}, "shows": {"reorder": 2}, "lastShown": 5000}
    response = client.put("/api/tips", json=phone)
    assert response.status_code == 200
    assert response.json()["seen"] == {"swap": "dismissed"}
    # A browser that never heard of the phone's progress saves its own.
    browser = {"seen": {"swap": "seen", "plates": "learned"}, "shows": {"reorder": 1}}
    merged = client.put("/api/tips", json=browser).json()
    assert merged["seen"] == {"swap": "dismissed", "plates": "learned"}
    assert merged["shows"] == {"reorder": 2}
    assert merged["lastShown"] == 5000
    assert client.get("/api/tips").json() == merged


def test_show_tips_follows_the_latest_choice(client):
    client.put("/api/tips", json={"enabled": False, "enabledAt": 200})
    assert (
        client.put("/api/tips", json={"enabled": True, "enabledAt": 100}).json()["enabled"] is False
    )
    assert (
        client.put("/api/tips", json={"enabled": True, "enabledAt": 300}).json()["enabled"] is True
    )


def test_unknown_tips_and_fields_are_kept(client):
    client.put("/api/tips", json={"seen": {"futureTip": "learned"}, "futureField": [1]})
    merged = client.put("/api/tips", json={"seen": {"swap": "seen"}}).json()
    assert merged["seen"] == {"futureTip": "learned", "swap": "seen"}
    assert merged["futureField"] == [1]


def test_tips_are_scoped_to_the_account(client, other_client):
    client.put("/api/tips", json={"seen": {"swap": "dismissed"}})
    assert other_client.get("/api/tips").json() == {}
    other_client.put("/api/tips", json={"seen": {"plates": "learned"}, "enabled": False})
    assert client.get("/api/tips").json()["seen"] == {"swap": "dismissed"}
    assert client.get("/api/tips").json()["enabled"] is True
    assert other_client.get("/api/tips").json()["seen"] == {"plates": "learned"}


def test_oversized_or_invalid_tips_are_refused(client):
    client.put("/api/tips", json={"seen": {"swap": "dismissed"}})
    large = {"counts": {f"event-{index}": index for index in range(MAX_TIP_STATE_BYTES // 10)}}
    response = client.put("/api/tips", json=large)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "tip_state_too_large"
    assert client.put("/api/tips", json=["not", "an", "object"]).status_code == 422
    assert client.get("/api/tips").json()["seen"] == {"swap": "dismissed"}


def test_unreadable_stored_tips_start_again(client):
    with SessionLocal() as db:
        db.add(UserSetting(user_id=client.user["id"], key=TIP_STATE_KEY, value="{broken"))
        db.commit()
    assert client.get("/api/tips").json() == {}
    assert client.put("/api/tips", json={"seen": {"swap": "seen"}}).json()["seen"] == {
        "swap": "seen"
    }


def test_tips_go_with_the_account_archive_and_deletion(client, other_client):
    client.put("/api/tips", json={"seen": {"swap": "dismissed"}})
    archive = download(client)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        names = bundle.namelist()
    assert names
    client.put("/api/tips", json={"seen": {"plates": "learned"}})
    response = send(client, archive)
    assert response.status_code == 200, response.text
    # The restore brings back the archived tips.
    assert client.get("/api/tips").json()["seen"] == {"swap": "dismissed"}

    other_client.put("/api/tips", json={"seen": {"swap": "learned"}})
    with SessionLocal() as db:
        db.execute(delete(User).where(User.id == other_client.user["id"]))
        db.commit()
        assert (
            db.scalars(
                select(UserSetting).where(
                    UserSetting.user_id == other_client.user["id"],
                    UserSetting.key == TIP_STATE_KEY,
                )
            ).first()
            is None
        )
