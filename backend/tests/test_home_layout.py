import json

import pytest

from app.database import SessionLocal
from app.home_layout import OPTIONAL_CHECK_INS, SECTION_IDS
from app.training_metrics import set_setting

DEFAULT_SETTINGS = {
    "zone2": {"zone": None, "style": "progress"},
    "training_block": {"style": "both"},
    "workouts": {"weeks": 8},
    "cardio_sessions": {"weeks": 8},
}


def test_layout_defaults_and_round_trip_are_account_scoped(client, other_client):
    default = {
        "order": SECTION_IDS,
        "hidden": OPTIONAL_CHECK_INS,
        "widths": {},
        "settings": DEFAULT_SETTINGS,
    }
    assert client.get("/api/home-layout").json() == default
    layout = {
        "order": list(reversed(SECTION_IDS)),
        "hidden": ["consistency", "workouts"],
        "widths": {"combined-check-in": "compact", "workouts": "full", "friends": "third"},
        "settings": {
            "zone2": {"zone": 4, "style": "ring"},
            "training_block": {"style": "timeline"},
            "workouts": {"weeks": 4},
            "cardio_sessions": {"weeks": 12},
        },
    }
    response = client.put("/api/home-layout", json=layout)
    assert response.status_code == 200
    assert response.json() == layout
    assert client.get("/api/home-layout").json() == layout
    assert other_client.get("/api/home-layout").json() == default
    assert (
        other_client.put(
            "/api/home-layout", json={"order": SECTION_IDS, "hidden": SECTION_IDS}
        ).status_code
        == 200
    )
    assert client.get("/api/home-layout").json() == layout


def test_layout_requires_sign_in(anonymous_client):
    assert anonymous_client.get("/api/home-layout").status_code == 401
    assert anonymous_client.put("/api/home-layout", json={}).status_code == 401


def test_invalid_layout_does_not_overwrite_saved_layout(client):
    saved = client.put("/api/home-layout", json={"hidden": ["records"]}).json()
    for invalid in (
        {"order": ["consistency", "consistency"]},
        {"hidden": ["records", "records"]},
        {"order": ["unknown-section"]},
        {"hidden": ["unknown-section"]},
        {"order": "records"},
        {"widths": {"unknown-section": "full"}},
        {"widths": {"records": "wide"}},
        {"widths": {"records": 3}},
        {"widths": []},
        {"settings": {"zone2": {"style": "chart"}}},
        {"settings": {"zone2": {"zone": 6}}},
        {"settings": {"zone2": {"zone": 0}}},
        {"settings": {"workouts": {"weeks": 6}}},
        {"settings": {"cardio_sessions": {"weeks": 16}}},
        {"settings": {"workouts": {"weeks": "8"}}},
        {"settings": {"cardio_sessions": {"weeks": None}}},
    ):
        assert client.put("/api/home-layout", json=invalid).status_code == 422
        assert client.get("/api/home-layout").json() == saved


def test_older_layout_appends_new_sections_without_unhiding_old_sections(client):
    old = {"order": ["consistency", "workouts"], "hidden": ["workouts"]}
    with SessionLocal() as db:
        set_setting(
            db,
            client.user["id"],
            "home_layout",
            '{"order":["consistency","workouts"],"hidden":["workouts"]}',
        )
        db.commit()
    result = client.get("/api/home-layout").json()
    assert result["order"][0] == "profile"
    assert result["order"][1:4] == ["this-week", *old["order"]]
    assert set(result["order"]) == set(SECTION_IDS)
    assert result["hidden"] == old["hidden"] + OPTIONAL_CHECK_INS
    assert result["widths"] == {}
    assert result["settings"]["workouts"] == {"weeks": 8}
    assert result["settings"]["cardio_sessions"] == {"weeks": 8}


def test_saved_layout_gains_the_weekly_review_visible_at_the_end(client):
    saved = ["profile", "records", "consistency"]
    with SessionLocal() as db:
        set_setting(
            db,
            client.user["id"],
            "home_layout",
            json.dumps({"order": saved, "hidden": ["records"]}),
        )
        db.commit()
    result = client.get("/api/home-layout").json()
    assert "weekly-review" in SECTION_IDS
    assert result["order"][:4] == ["profile", "records", "this-week", "consistency"]
    assert result["order"].count("weekly-review") == 1
    assert "weekly-review" not in result["hidden"]
    assert client.put("/api/home-layout", json=result).json() == result


def test_saved_layout_gains_the_block_card_after_the_next_workout(client):
    with SessionLocal() as db:
        set_setting(
            db,
            client.user["id"],
            "home_layout",
            '{"order":["profile","consistency","next-workout","workouts"],"hidden":[]}',
        )
        db.commit()
    order = client.get("/api/home-layout").json()["order"]
    assert order[:6] == [
        "profile",
        "this-week",
        "consistency",
        "next-workout",
        "training-block",
        "workouts",
    ]


def test_saved_layout_gains_this_week_where_the_calendar_showed_it(client):
    for hidden in ([], ["consistency"]):
        with SessionLocal() as db:
            set_setting(
                db,
                client.user["id"],
                "home_layout",
                json.dumps(
                    {"order": ["profile", "workouts", "consistency", "records"], "hidden": hidden}
                ),
            )
            db.commit()
        result = client.get("/api/home-layout").json()
        assert result["order"][:5] == ["profile", "workouts", "this-week", "consistency", "records"]
        # The strip was part of the calendar, so it stays hidden with a hidden calendar.
        assert ("this-week" in result["hidden"]) == ("consistency" in hidden)
        assert client.put("/api/home-layout", json=result).json() == result

    moved = client.put(
        "/api/home-layout",
        json={**result, "order": ["this-week", *[s for s in result["order"] if s != "this-week"]]},
    ).json()
    assert moved["order"][0] == "this-week"


def test_corrupt_saved_layout_recovers_to_default(client):
    with SessionLocal() as db:
        set_setting(db, client.user["id"], "home_layout", "invalid json")
        db.commit()
    assert client.get("/api/home-layout").json() == {
        "order": SECTION_IDS,
        "hidden": OPTIONAL_CHECK_INS,
        "widths": {},
        "settings": DEFAULT_SETTINGS,
    }


def test_legacy_check_in_retains_position_width_and_hidden_state(client):
    for hidden in ([], ["daily-check-in"]):
        old = {
            "order": ["records", "daily-check-in", "consistency"],
            "hidden": hidden,
            "widths": {"daily-check-in": "compact", "records": "full"},
        }
        with SessionLocal() as db:
            set_setting(db, client.user["id"], "home_layout", json.dumps(old))
            db.commit()
        result = client.get("/api/home-layout").json()
        assert result["order"][1:5] == [
            "records",
            "combined-check-in",
            "this-week",
            "consistency",
        ]
        assert ("combined-check-in" in result["hidden"]) == bool(hidden)
        assert all(section in result["hidden"] for section in OPTIONAL_CHECK_INS)
        assert result["widths"] == {"combined-check-in": "compact", "records": "full"}
        assert "daily-check-in" not in result["order"]
        assert client.put("/api/home-layout", json=result).json() == result


def test_three_check_ins_can_be_added_hidden_and_resized_independently(client):
    layout = client.get("/api/home-layout").json()
    layout["hidden"] = ["combined-check-in"]
    layout["widths"] = {
        "bodyweight-check-in": "compact",
        "body-fat-check-in": "compact",
        "combined-check-in": "full",
    }
    assert client.put("/api/home-layout", json=layout).json() == layout
    assert client.get("/api/home-layout").json() == layout


def test_older_client_can_save_the_legacy_check_in_identifier(client):
    old = {
        "order": ["daily-check-in", "records"],
        "hidden": [],
        "widths": {"daily-check-in": "third"},
    }
    response = client.put("/api/home-layout", json=old)
    assert response.status_code == 200
    layout = response.json()
    assert layout["order"][:3] == ["profile", "combined-check-in", "records"]
    assert layout["widths"] == {"combined-check-in": "third"}
    assert layout["hidden"] == OPTIONAL_CHECK_INS


def test_section_settings_default_for_older_layouts_and_update_independently(client):
    with SessionLocal() as db:
        set_setting(db, client.user["id"], "home_layout", json.dumps({"hidden": ["records"]}))
        db.commit()
    layout = client.get("/api/home-layout").json()
    assert layout["settings"] == DEFAULT_SETTINGS
    assert layout["hidden"] == ["records"]
    layout["settings"]["zone2"] = {"zone": 2, "style": "list"}
    assert client.put("/api/home-layout", json=layout).json() == layout
    partial = client.put("/api/home-layout", json={"settings": {"zone2": {"style": "ring"}}})
    assert partial.json()["settings"]["zone2"] == {"zone": None, "style": "ring"}


@pytest.mark.parametrize("weeks", [4, 8, 12])
def test_activity_windows_save_independently_for_each_account(client, other_client, weeks):
    layout = client.get("/api/home-layout").json()
    layout["settings"]["workouts"] = {"weeks": weeks}
    assert client.put("/api/home-layout", json=layout).json() == layout
    assert client.get("/api/home-layout").json()["settings"]["cardio_sessions"] == {"weeks": 8}
    layout["settings"]["cardio_sessions"] = {"weeks": 12}
    assert client.put("/api/home-layout", json=layout).json() == layout
    assert client.get("/api/home-layout").json() == layout
    assert other_client.get("/api/home-layout").json()["settings"] == DEFAULT_SETTINGS


@pytest.mark.parametrize("version", [None, "1.2.0", "invalid"])
def test_older_layout_saves_preserve_activity_settings_the_client_omits(client, version):
    layout = client.get("/api/home-layout").json()
    layout["settings"]["workouts"] = {"weeks": 4}
    layout["settings"]["cardio_sessions"] = {"weeks": 12}
    assert client.put("/api/home-layout", json=layout).status_code == 200
    layout["hidden"] = ["records"]
    layout["settings"] = {"zone2": {"zone": 2, "style": "ring"}}
    headers = {} if version is None else {"X-Relay-Version": version}
    response = client.put("/api/home-layout", json=layout, headers=headers)
    assert response.status_code == 200
    saved = response.json()
    assert saved["settings"]["workouts"] == {"weeks": 4}
    assert saved["settings"]["cardio_sessions"] == {"weeks": 12}
    assert saved["settings"]["zone2"] == {"zone": 2, "style": "ring"}
    assert saved["hidden"] == ["records"]
    assert client.get("/api/home-layout").json() == saved

    # A client that explicitly sends a new choice can edit one card without resetting the other.
    layout["settings"]["workouts"] = {"weeks": 8}
    explicit = client.put("/api/home-layout", json=layout, headers=headers).json()
    assert explicit["settings"]["workouts"] == {"weeks": 8}
    assert explicit["settings"]["cardio_sessions"] == {"weeks": 12}


def test_newer_layout_clients_can_reset_activity_settings_to_defaults(client):
    layout = client.get("/api/home-layout").json()
    layout["settings"]["workouts"] = {"weeks": 4}
    layout["settings"]["cardio_sessions"] = {"weeks": 12}
    client.put("/api/home-layout", json=layout)
    reset = client.put("/api/home-layout", json={}, headers={"X-Relay-Version": "1.3.0"})
    assert reset.status_code == 200
    assert reset.json()["settings"] == DEFAULT_SETTINGS
