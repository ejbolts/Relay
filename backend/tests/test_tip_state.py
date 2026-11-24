from __future__ import annotations

import io
import json
import sqlite3
import threading
import time
import zipfile
from contextlib import closing
from pathlib import Path

import pytest
from sqlalchemy import delete, event, select
from sqlalchemy.exc import OperationalError
from test_account_archive import download, send

from app import account_archive, tip_state
from app.account_backups import BACKUP_DATABASE, TIP_STATE_GENERATION_KEY
from app.config import get_settings
from app.database import SessionLocal, engine
from app.models import User, UserSetting
from app.tip_state import MAX_TIP_STATE_BYTES, TIP_STATE_KEY, merge_tip_states

CASES = json.loads(
    (Path(__file__).parents[2] / "frontend" / "src" / "tipSyncCases.json").read_text("utf-8")
)["cases"]


def tips_path(test_client, query: str = "") -> str:
    """The tip store's address as current clients use it: naming their account."""
    path = f"/api/tips?account={test_client.user['id']}"
    return f"{path}&{query}" if query else path


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_merge_matches_the_shared_cases(case):
    # The same cases check mergeTipStates in frontend/src/tipSync.test.ts.
    assert merge_tip_states(case["stored"], case["incoming"]) == case["expected"]


def test_tips_start_empty(client):
    assert client.get("/api/tips").json() == {"generation": "0"}


def test_tips_need_sign_in(anonymous_client):
    assert anonymous_client.get("/api/tips").status_code == 401
    assert anonymous_client.put("/api/tips?account=someone", json={}).status_code == 401


def test_saves_merge_so_devices_cannot_erase_each_other(client):
    phone = {"seen": {"swap": "dismissed"}, "shows": {"reorder": 2}, "lastShown": 5000}
    response = client.put(tips_path(client), json=phone)
    assert response.status_code == 200
    assert response.json()["seen"] == {"swap": "dismissed"}
    # A browser that never heard of the phone's progress saves its own.
    browser = {"seen": {"swap": "seen", "plates": "learned"}, "shows": {"reorder": 1}}
    merged = client.put(tips_path(client), json=browser).json()
    assert merged["seen"] == {"swap": "dismissed", "plates": "learned"}
    assert merged["shows"] == {"reorder": 2}
    assert merged["lastShown"] == 5000
    assert merged["generation"] == "0"
    assert client.get("/api/tips").json() == merged


def test_show_tips_follows_the_latest_choice(client):
    client.put(tips_path(client), json={"enabled": False, "enabledAt": 200})
    assert (
        client.put(tips_path(client), json={"enabled": True, "enabledAt": 100}).json()["enabled"]
        is False
    )
    assert (
        client.put(tips_path(client), json={"enabled": True, "enabledAt": 300}).json()["enabled"]
        is True
    )


def test_unknown_tips_and_fields_are_kept(client):
    client.put(tips_path(client), json={"seen": {"futureTip": "learned"}, "futureField": [1]})
    merged = client.put(tips_path(client), json={"seen": {"swap": "seen"}}).json()
    assert merged["seen"] == {"futureTip": "learned", "swap": "seen"}
    assert merged["futureField"] == [1]


def test_tips_are_scoped_to_the_account(client, other_client):
    client.put(tips_path(client), json={"seen": {"swap": "dismissed"}})
    assert other_client.get("/api/tips").json() == {"generation": "0"}
    other_client.put(
        tips_path(other_client), json={"seen": {"plates": "learned"}, "enabled": False}
    )
    assert client.get("/api/tips").json()["seen"] == {"swap": "dismissed"}
    assert client.get("/api/tips").json()["enabled"] is True
    assert other_client.get("/api/tips").json()["seen"] == {"plates": "learned"}


def test_oversized_or_invalid_tips_are_refused(client):
    client.put(tips_path(client), json={"seen": {"swap": "dismissed"}})
    large = {"counts": {f"event-{index}": index for index in range(MAX_TIP_STATE_BYTES // 10)}}
    response = client.put(tips_path(client), json=large)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "tip_state_too_large"
    assert client.put(tips_path(client), json=["not", "an", "object"]).status_code == 422
    assert client.get("/api/tips").json()["seen"] == {"swap": "dismissed"}


def test_unreadable_stored_tips_start_again(client):
    with SessionLocal() as db:
        db.add(UserSetting(user_id=client.user["id"], key=TIP_STATE_KEY, value="{broken"))
        db.commit()
    assert client.get("/api/tips").json() == {"generation": "0"}
    assert client.put(tips_path(client), json={"seen": {"swap": "seen"}}).json()["seen"] == {
        "swap": "seen"
    }


def test_tips_go_with_the_account_archive_and_deletion(client, other_client):
    client.put(tips_path(client), json={"seen": {"swap": "dismissed"}})
    archive = download(client)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        names = bundle.namelist()
    assert names
    client.put(tips_path(client), json={"seen": {"plates": "learned"}})
    response = send(client, archive)
    assert response.status_code == 200, response.text
    # The restore brings back the archived tips.
    assert client.get("/api/tips").json()["seen"] == {"swap": "dismissed"}

    other_client.put(tips_path(other_client), json={"seen": {"swap": "learned"}})
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


def test_a_client_holding_another_accounts_tips_is_refused(client, other_client):
    """A stale browser tab whose cookie now belongs to another account."""
    client.put(tips_path(client), json={"seen": {"swap": "dismissed"}})
    other = other_client.user["id"]
    response = client.put(f"/api/tips?account={other}", json={"seen": {"plates": "learned"}})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "tip_account_mismatch"
    assert client.get(f"/api/tips?account={other}").status_code == 409
    # Nothing was merged into either account.
    assert client.get("/api/tips").json()["seen"] == {"swap": "dismissed"}
    assert "seen" not in other_client.get("/api/tips").json()
    mine = client.user["id"]
    assert client.put(f"/api/tips?account={mine}", json={}).status_code == 200


@pytest.mark.parametrize("existing", [False, True], ids=["first save", "later save"])
def test_saves_at_the_same_moment_keep_both(client, monkeypatch, existing):
    if existing:
        client.put(tips_path(client), json={"seen": {"back": "seen"}})
    merge = tip_state.merge_tip_states

    def slow_merge(stored, incoming):
        # Both requests would read the same row here without the write lock.
        time.sleep(0.3)
        return merge(stored, incoming)

    monkeypatch.setattr(tip_state, "merge_tip_states", slow_merge)
    responses = []

    def save(tip):
        responses.append(client.put(tips_path(client), json={"seen": {tip: "dismissed"}}))

    threads = [threading.Thread(target=save, args=(tip,)) for tip in ("swap", "plates")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert [response.status_code for response in responses] == [200, 200]
    seen = client.get("/api/tips").json()["seen"]
    assert seen["swap"] == seen["plates"] == "dismissed"


def test_devices_adopt_restored_tips_instead_of_merging_older_copies(client):
    client.put(
        tips_path(client), json={"seen": {"swap": "dismissed"}, "enabled": True, "enabledAt": 10}
    )
    archive = download(client)
    phone = client.put(
        tips_path(client, "generation=0"), json={"enabled": False, "enabledAt": 20}
    ).json()
    assert phone["enabled"] is False
    assert send(client, archive).status_code == 200
    restored = client.get("/api/tips").json()
    assert restored["enabled"] is True
    generation = restored["generation"]
    assert generation != "0"
    # The device that synced before the restore sends its older copy: it gets the restored tips
    # back to adopt, and nothing is merged.
    stale = {"enabled": False, "enabledAt": 20, "seen": {"plates": "learned"}}
    reply = client.put(tips_path(client, "generation=0"), json=stale).json()
    assert reply == restored
    # A second device that reconnects later is refused the same way.
    assert client.put(tips_path(client, "generation=0"), json=stale).json() == restored
    # Once adopted, the device syncs as usual.
    merged = client.put(
        tips_path(client, f"generation={generation}"), json={"seen": {"back": "seen"}}
    ).json()
    assert merged["seen"] == {"swap": "dismissed", "back": "seen"}
    assert merged["enabled"] is True


def test_a_save_at_the_end_of_a_restore_cannot_undo_it(client, monkeypatch):
    """The restored tips and their new generation commit together: a device saving its
    pre-restore copy right after the restore's rows commit gets the restored tips back."""
    client.put(tips_path(client), json={"enabled": True, "enabledAt": 10})
    archive = download(client)
    client.put(tips_path(client, "generation=0"), json={"enabled": False, "enabledAt": 20})
    replies = []
    remove_photo_files = account_archive.remove_photo_files

    def save_from_another_device(*args):
        if not replies:
            with SessionLocal() as db:
                user = db.get(User, client.user["id"])
                stale = {"enabled": False, "enabledAt": 30}
                replies.append(
                    tip_state.save_tip_state(db, user, stale, account=user.id, generation="0")
                )
        return remove_photo_files(*args)

    monkeypatch.setattr(account_archive, "remove_photo_files", save_from_another_device)
    assert send(client, archive).status_code == 200
    assert replies[0]["enabled"] is True
    assert replies[0]["generation"] != "0"
    assert client.get("/api/tips").json()["enabled"] is True


def test_a_save_without_a_generation_cannot_override_a_restore(client):
    client.put(
        tips_path(client), json={"seen": {"swap": "dismissed"}, "enabled": True, "enabledAt": 10}
    )
    archive = download(client)
    assert send(client, archive).status_code == 200
    restored = client.get("/api/tips").json()
    # A client that never recorded a generation is taken to hold the initial one.
    reply = client.put(tips_path(client), json={"enabled": False, "enabledAt": 99}).json()
    assert reply == restored
    assert client.get("/api/tips").json()["enabled"] is True


def test_a_busy_database_asks_the_client_to_retry(client, monkeypatch):
    client.put(tips_path(client), json={"seen": {"swap": "seen"}})

    def busy(_db):
        raise OperationalError(
            "BEGIN IMMEDIATE", {}, sqlite3.OperationalError("database is locked")
        )

    monkeypatch.setattr(tip_state, "_begin_write", busy)
    response = client.put(tips_path(client), json={"seen": {"plates": "learned"}})
    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert response.json()["error"]["code"] == "tip_state_busy"
    monkeypatch.undo()
    assert client.get("/api/tips").json()["seen"] == {"swap": "seen"}


def test_copies_of_the_account_leave_out_the_tip_generation(client, tmp_path):
    client.put(tips_path(client), json={"seen": {"swap": "dismissed"}})
    assert send(client, download(client)).status_code == 200
    with SessionLocal() as db:
        assert db.get(UserSetting, (client.user["id"], TIP_STATE_GENERATION_KEY)) is not None
    with zipfile.ZipFile(io.BytesIO(download(client))) as bundle:
        (tmp_path / "copy.db").write_bytes(bundle.read(BACKUP_DATABASE))
    with closing(sqlite3.connect(tmp_path / "copy.db")) as copy:
        keys = {row[0] for row in copy.execute("SELECT key FROM user_settings")}
    assert TIP_STATE_KEY in keys
    assert TIP_STATE_GENERATION_KEY not in keys


def test_saves_must_name_their_account(client):
    response = client.put("/api/tips", json={"seen": {"swap": "dismissed"}})
    assert response.status_code == 422
    assert "seen" not in client.get("/api/tips").json()


def test_reading_tips_never_pairs_old_tips_with_a_restored_generation(client):
    """A restore committing while the tips are read: the reply is entirely from before it."""
    client.put(tips_path(client), json={"enabled": False, "enabledAt": 10})
    statements = []

    def restore_between_reads(_conn, _cursor, statement, *_args):
        if "user_settings" not in statement:
            return
        statements.append(statement)
        if len(statements) == 2:
            # What a restore commits together: its tips and a new generation.
            with SessionLocal() as db:
                db.merge(
                    UserSetting(
                        user_id=client.user["id"], key=TIP_STATE_KEY, value='{"enabled": true}'
                    )
                )
                db.merge(
                    UserSetting(
                        user_id=client.user["id"], key=TIP_STATE_GENERATION_KEY, value="restored"
                    )
                )
                db.commit()

    event.listen(engine, "before_cursor_execute", restore_between_reads)
    try:
        reply = client.get("/api/tips").json()
    finally:
        event.remove(engine, "before_cursor_execute", restore_between_reads)
    assert (reply["enabled"], reply["generation"]) in {(False, "0"), (True, "restored")}


def test_a_reader_holding_the_database_at_commit_asks_the_client_to_retry(client):
    client.put(tips_path(client), json={"seen": {"swap": "seen"}})
    reader = sqlite3.connect(get_settings().database_path, isolation_level=None)
    try:
        # A read transaction keeps a shared lock, which the save's commit must wait out.
        reader.execute("BEGIN")
        reader.execute("SELECT count(*) FROM user_settings").fetchone()
        response = client.put(tips_path(client), json={"seen": {"plates": "learned"}})
    finally:
        reader.execute("ROLLBACK")
        reader.close()
    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert client.get("/api/tips").json()["seen"] == {"swap": "seen"}


def test_other_database_errors_are_not_reported_as_busy(client, monkeypatch):
    def broken(_db):
        raise OperationalError("BEGIN IMMEDIATE", {}, sqlite3.OperationalError("disk I/O error"))

    monkeypatch.setattr(tip_state, "_begin_write", broken)
    with pytest.raises(OperationalError):
        client.put(tips_path(client), json={"seen": {"plates": "learned"}})
