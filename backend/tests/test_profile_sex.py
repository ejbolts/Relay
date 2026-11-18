import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from test_sharing import befriend, profile, share


def set_sex(test_client: TestClient, sex: str):
    return test_client.patch("/api/profile", json={"sex": sex})


def admin_set_sex(admin: TestClient, user_id: str, sex: str | None):
    return admin.put(f"/api/admin/users/{user_id}/sex", json={"sex": sex})


def test_sex_is_chosen_once_and_then_locked(client):
    assert client.get("/api/auth/me").json()["sex"] is None
    assert set_sex(client, "other").status_code == 422

    chosen = set_sex(client, "female")
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["sex"] == "female"

    # Saving the rest of the profile, or the same answer again, still works.
    assert client.patch("/api/profile", json={"display_name": "Renamed"}).json()["sex"] == "female"
    assert set_sex(client, "female").status_code == 200

    changed = set_sex(client, "male")
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "sex_locked"
    assert client.get("/api/auth/me").json()["sex"] == "female"


def test_only_an_admin_changes_or_clears_a_chosen_sex(client, other_client):
    member = other_client.user["id"]
    assert set_sex(other_client, "male").status_code == 200
    listed = {user["id"]: user for user in client.get("/api/admin/users").json()}
    assert listed[member]["sex"] == "male"

    changed = admin_set_sex(client, member, "female")
    assert changed.status_code == 200, changed.text
    assert changed.json()["sex"] == "female"
    assert other_client.get("/api/auth/me").json()["sex"] == "female"
    # The member still cannot change it back.
    assert set_sex(other_client, "male").status_code == 409

    # Clearing it lets the member choose again.
    assert admin_set_sex(client, member, None).json()["sex"] is None
    assert set_sex(other_client, "male").json()["sex"] == "male"

    assert admin_set_sex(client, member, "other").status_code == 422
    assert admin_set_sex(client, "missing", "male").status_code == 404
    assert admin_set_sex(other_client, client.user["id"], "male").status_code == 403


def test_friends_see_the_sex_and_others_only_when_the_profile_is_open_to_them(
    client, other_client
):
    share(client, "followers")
    share(other_client)
    set_sex(client, "female")
    seen = profile(other_client, client).json()
    assert seen["can_view"] is False and seen["sex"] is None

    befriend(other_client, client)
    assert profile(other_client, client).json()["sex"] == "female"


def test_profile_sex_migration_adds_and_removes_the_column():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0062_profile_sex.py"
    spec = importlib.util.spec_from_file_location("profile_sex_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0061_password_reset_requests"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT)"))
        connection.execute(text("INSERT INTO users VALUES ('owner', 'owner')"))
        connection.execute(text("CREATE TABLE child (user_id TEXT REFERENCES users(id))"))
        connection.execute(text("INSERT INTO child VALUES ('owner')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(text("SELECT username, sex FROM users")).one() == ("owner", None)
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        migration.downgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        assert columns == {"id", "username"}
        assert connection.scalar(text("SELECT COUNT(*) FROM child")) == 1
