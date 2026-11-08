import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

GOAL = {
    "start_date": "2026-11-08",
    "target_date": "2026-12-31",
    "start_weight_kg": 84,
    "target_weight_kg": 84,
    "maintenance_min_kg": 82,
    "maintenance_max_kg": 86,
}


@pytest.mark.parametrize("version", [None, "1.2.0"])
def test_range_round_trip_and_older_client_preservation(client, other_client, version):
    created = client.post("/api/body-weight-goals", json=GOAL)
    assert created.status_code == 201
    goal = created.json()
    assert goal["maintenance_min_kg"] == 82
    assert goal["maintenance_max_kg"] == 86
    assert client.get("/api/body-weight-goals").json()[0] == goal
    assert other_client.get("/api/body-weight-goals").json() == []
    path = f"/api/body-weight-goals/{goal['id']}"
    legacy = {key: value for key, value in GOAL.items() if not key.startswith("maintenance_")}
    saved = client.put(
        path,
        json={**legacy, "active": False},
        headers={"X-Relay-Version": version} if version else {},
    )
    assert saved.status_code == 200
    assert saved.json()["maintenance_min_kg"] == 82
    assert saved.json()["maintenance_max_kg"] == 86
    assert not saved.json()["active"]
    assert other_client.put(path, json=GOAL).status_code == 404
    # An aware client can explicitly replace the range with an exact loss goal.
    saved = client.put(
        path,
        json={**legacy, "target_weight_kg": 80},
        headers={"X-Relay-Version": "1.2.1"},
    )
    assert saved.status_code == 200
    assert saved.json()["maintenance_min_kg"] is None
    assert saved.json()["target_weight_kg"] == 80


def test_range_midpoint_keeps_legacy_maintain_semantics(client):
    response = client.post(
        "/api/body-weight-goals", json={**GOAL, "start_weight_kg": 90, "target_weight_kg": 70}
    )
    assert response.status_code == 201
    assert response.json()["start_weight_kg"] == response.json()["target_weight_kg"] == 84


def test_shared_range_respects_goals_privacy(client, other_client):
    assert client.post("/api/body-weight-goals", json=GOAL).status_code == 201
    sharing = {"visibility": "public", "share_goals": True}
    assert client.put("/api/sharing", json=sharing).is_success
    owner = client.user["id"]
    # A viewer must also participate in profile sharing.
    assert other_client.put("/api/sharing", json={"visibility": "public"}).is_success
    view = other_client.get(f"/api/sharing/profiles/{owner}")
    assert view.status_code == 200
    shared = view.json()["goals"]["body_weight"]
    assert shared["maintenance_min_kg"] == 82
    assert shared["maintenance_max_kg"] == 86
    assert client.put("/api/sharing", json={**sharing, "share_goals": False}).is_success
    assert other_client.get(f"/api/sharing/profiles/{owner}").json()["goals"] is None


@pytest.mark.parametrize(
    "low,high", [(86, 82), (84, 84), (None, 86), (82, None), (0, 86), (82, 501)]
)
def test_rejects_invalid_ranges(client, low, high):
    response = client.post(
        "/api/body-weight-goals",
        json={**GOAL, "maintenance_min_kg": low, "maintenance_max_kg": high},
    )
    assert response.status_code == 422
    assert client.get("/api/body-weight-goals").json() == []


def test_migration_preserves_exact_goals():
    path = Path(__file__).parents[1] / "migrations/versions/0053_maintenance_ranges.py"
    spec = importlib.util.spec_from_file_location("maintenance_ranges", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE body_weight_goals (id TEXT PRIMARY KEY, target_weight_kg FLOAT)")
        )
        connection.execute(text("INSERT INTO body_weight_goals VALUES ('old', 84)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(text("SELECT * FROM body_weight_goals")).one() == (
            "old",
            84,
            None,
            None,
        )
        connection.execute(
            text("UPDATE body_weight_goals SET maintenance_min_kg=82, maintenance_max_kg=86")
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.execute(text("SELECT * FROM body_weight_goals")).one() == ("old", 84)
    engine.dispose()
