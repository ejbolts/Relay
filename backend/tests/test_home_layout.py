import json

from app.database import SessionLocal
from app.home_layout import OPTIONAL_CHECK_INS, SECTION_IDS
from app.training_metrics import set_setting

DEFAULT_SETTINGS = {
    "check_in": {"mode": "combined"},
    "zone2": {"zone": None, "style": "progress"},
    "training_block": {"style": "both"},
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
            "check_in": {"mode": "combined"},
            "zone2": {"zone": 4, "style": "ring"},
            "training_block": {"style": "timeline"},
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


def test_legacy_check_ins_collapse_to_first_visible_with_its_preferences(client):
    old = {
        "order": ["records", "combined-check-in", "body-fat-check-in", "bodyweight-check-in"],
        "hidden": ["combined-check-in"],
        "widths": {"body-fat-check-in": "compact", "combined-check-in": "full"},
    }
    response = client.put("/api/home-layout", json=old)
    assert response.status_code == 200
    result = response.json()
    assert result["order"][:3] == ["profile", "records", "combined-check-in"]
    assert result["hidden"] == []
    assert result["widths"] == {"combined-check-in": "compact"}
    assert result["settings"]["check_in"] == {"mode": "fat"}
    assert client.put("/api/home-layout", json=result).json() == result


def test_check_in_modes_round_trip_without_other_setting_changes(client):
    layout = client.get("/api/home-layout").json()
    for mode in ("weight", "fat", "combined", "combined-single"):
        layout["settings"]["check_in"] = {"mode": mode}
        assert client.put("/api/home-layout", json=layout).json() == layout
        assert client.get("/api/home-layout").json() == layout
    assert (
        client.put("/api/home-layout", json={"settings": {"check_in": {"mode": "bad"}}}).status_code
        == 422
    )


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


def test_all_hidden_legacy_check_ins_stay_hidden_and_preserve_first_width(client):
    old = {
        "order": ["bodyweight-check-in", "body-fat-check-in", "combined-check-in"],
        "hidden": ["bodyweight-check-in", "body-fat-check-in", "combined-check-in"],
        "widths": {"bodyweight-check-in": "third"},
    }
    response = client.put("/api/home-layout", json=old)
    assert response.status_code == 200
    layout = response.json()
    assert layout["order"].count("combined-check-in") == 1
    assert layout["hidden"] == ["combined-check-in"]
    assert layout["widths"] == {"combined-check-in": "third"}
    assert layout["settings"]["check_in"] == {"mode": "weight"}


def test_malformed_section_values_are_validation_errors(client):
    for body in ({"order": [[]]}, {"hidden": [{}]}):
        assert client.put("/api/home-layout", json=body).status_code == 422
