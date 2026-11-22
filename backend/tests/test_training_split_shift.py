"""Skipping a split day from Up next."""

from test_training_split import log_workout, missed_days, save_split, up_next


def shift(client, step, on_date, rest_saved=False, status=200):
    response = client.put(
        "/api/training-split/position",
        json={"step": step, "rest_saved": rest_saved},
        params={"on_date": on_date},
    )
    assert response.status_code == status, response.text
    return response.json()


def read(client, on_date):
    response = client.get("/api/training-split", params={"on_date": on_date})
    assert response.status_code == 200, response.text
    return response.json()


def test_skipping_a_calendar_day_moves_today_and_every_later_day(client):
    save_split(client, "push", "pull", "lower", None)
    assert up_next(client, "2026-10-26") == "push"
    saved = shift(client, 1, "2026-10-26")
    assert saved["shift"] == {"from_date": "2026-10-26", "step": 1, "rest_saved": False}
    assert [up_next(client, day) for day in ("2026-10-26", "2026-10-27", "2026-10-28")] == [
        "pull",
        "lower",
        None,
    ]
    assert up_next(client, "2026-10-29") == "push"
    assert read(client, "2026-10-26")["shift"]["step"] == 1


def test_undo_replaces_the_days_shift_and_restores_the_dated_day(client):
    save_split(client, "push", "pull", "lower", None)
    shift(client, 1, "2026-10-26")
    undone = shift(client, 0, "2026-10-26")
    assert undone["shift"] == {"from_date": "2026-10-26", "step": 0, "rest_saved": False}
    assert up_next(client, "2026-10-26") == "push"
    assert up_next(client, "2026-10-27") == "pull"


def test_a_shift_keeps_earlier_missed_days_where_they_were(client):
    save_split(client, "push", "pull", "lower", None)
    log_workout(client, "2026-10-26", "push")
    # 27th Pull and 28th Lower missed, then Pull moves to the 30th.
    shift(client, 1, "2026-10-30")
    assert missed_days(client, "2026-10-31") == [
        ("2026-10-27", "pull"),
        ("2026-10-28", "lower"),
        ("2026-10-30", "pull"),
    ]


def test_skipping_a_followed_split_moves_its_next_workout(client):
    save_split(client, "push", "pull", "lower", None, progression="workouts")
    shift(client, 1, "2026-10-26")
    assert up_next(client, "2026-10-26") == "pull"
    log_workout(client, "2026-10-26", "pull")
    assert up_next(client, "2026-10-27") == "lower"


def test_a_followed_skip_after_todays_workout_applies_from_tomorrow(client):
    save_split(client, "push", "pull", "lower", None, progression="workouts")
    log_workout(client, "2026-10-26", "push")
    saved = shift(client, 2, "2026-10-26")
    assert saved["shift"]["from_date"] == "2026-10-27"
    assert (saved["next_step"], saved["next_date"]) == (2, "2026-10-27")
    assert up_next(client, "2026-10-27") == "lower"


def test_a_followed_skip_carries_the_saved_rest(client):
    save_split(client, "push", "pull", "lower", None, progression="workouts")
    log_workout(client, "2026-10-26", "push")
    # 27th: unplanned rest, saved. Skip Pull on the 28th and keep that rest.
    assert read(client, "2026-10-28")["rest_saved"] is True
    saved = shift(client, 2, "2026-10-28", rest_saved=True)
    assert (saved["next_step"], saved["rest_saved"]) == (2, True)
    log_workout(client, "2026-10-28", "lower")
    # The saved rest absorbs the planned one, so Push follows straight after.
    assert up_next(client, "2026-10-29") == "push"


def test_a_new_schedule_drops_shifts_but_a_rename_keeps_them(client):
    save_split(client, "push", "pull", "lower", None)
    shift(client, 1, "2026-10-26")
    save_split(client, "push", "pull", "lower", None, name="Renamed")
    assert read(client, "2026-10-26")["shift"]["step"] == 1
    save_split(client, "push", "pull", "lower", None, start_date="2026-10-25")
    assert read(client, "2026-10-26")["shift"] is None
    assert up_next(client, "2026-10-26") == "pull"


def test_moving_the_split_is_checked_and_refreshes_other_devices(client, other_client):
    shift(client, 0, "2026-10-26", status=422)
    save_split(client, "push", "pull", None)
    shift(client, 3, "2026-10-26", status=422)
    shift(client, 28, "2026-10-26", status=422)
    shift(client, 1, "2026-10-25", status=422)
    revision = client.get("/api/workouts/revision").json()["revision"]
    shift(client, 1, "2026-10-26")
    assert client.get("/api/workouts/revision").json()["revision"] != revision
    assert other_client.get("/api/training-split").json() is None
    save_split(client, "push", "pull", None, enabled=False)
    shift(client, 1, "2026-10-26", status=422)


def test_position_requires_authentication(anonymous_client):
    response = anonymous_client.put("/api/training-split/position", json={"step": 0})
    assert response.status_code == 401
