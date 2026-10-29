import pytest


def test_ffmi_profile_defaults_persists_and_is_account_owned(client, other_client):
    assert client.get("/api/ffmi-profile").json() == {
        "sex": None,
        "height_cm": None,
        "wrist_cm": None,
        "ankle_cm": None,
        "target_body_fat_pct": 10,
    }
    profile = {
        "sex": "male",
        "height_cm": 180,
        "wrist_cm": 17.5,
        "ankle_cm": 22.5,
        "target_body_fat_pct": 12,
    }
    updated = client.put("/api/ffmi-profile", json=profile)
    assert updated.status_code == 200
    assert updated.json() == profile
    assert client.get("/api/ffmi-profile").json() == profile
    assert other_client.get("/api/ffmi-profile").json()["height_cm"] is None

    # Frame measurements are optional; clearing them keeps the rest of the profile.
    cleared = client.put(
        "/api/ffmi-profile", json={**profile, "wrist_cm": None, "ankle_cm": None}
    ).json()
    assert cleared["wrist_cm"] is None
    assert cleared["height_cm"] == 180


@pytest.mark.parametrize(
    "change",
    [
        {"sex": "other"},
        {"height_cm": 50},
        {"height_cm": 300},
        {"wrist_cm": 5},
        {"ankle_cm": 60},
        {"target_body_fat_pct": 1},
        {"target_body_fat_pct": 50},
    ],
)
def test_ffmi_profile_rejects_invalid_values(client, change):
    response = client.put("/api/ffmi-profile", json={"sex": "female", "height_cm": 165, **change})
    assert response.status_code == 422
    assert client.get("/api/ffmi-profile").json()["height_cm"] is None
