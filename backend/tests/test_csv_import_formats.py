from __future__ import annotations

import pytest


def upload(client, content: str | bytes, *, preview=False):
    data = content.encode() if isinstance(content, str) else content
    return client.post(
        "/api/workouts/import/preview" if preview else "/api/workouts/import",
        files={"file": ("history.csv", data, "text/csv")},
    )


def error(response) -> str:
    assert response.status_code == 422, response.text
    return response.json()["error"]["message"]


def imported_sets(client) -> list[dict]:
    return [
        item
        for workout in client.get("/api/workouts").json()
        for movement in workout["movements"]
        for item in movement["sets"]
    ]


def test_hand_made_file_needs_only_date_exercise_and_reps(client):
    content = (
        "Date Lifted,Exercise,Weight (kg),Reps\n"
        "2026-07-17,Bench Press,80,8\n"
        "2026-07-17,Bench Press,82.5,6\n"
    )
    preview = upload(client, content, preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["sets_to_import"] == 2
    assert not any("not imported" in item for item in preview.json()["warnings"])
    assert upload(client, content).status_code == 201
    assert [
        (item["weight_kg"], item["reps"], item["warmup"]) for item in imported_sets(client)
    ] == [
        (80, 8, False),
        (82.5, 6, False),
    ]


def test_spreadsheet_variations_import_the_same_values(client):
    # Semicolons and decimal commas come from spreadsheets in many locales.
    content = (
        "date lifted;EXERCISE;Weight(kg);reps;warmup;Notes;;\n"
        "2026-07-17 07:30:00;Bench Press;82,5;6;Y;felt good;;\n"
        "2026-07-17T07:40;Bench Press;40;10;n;;;\n"
    )
    preview = upload(client, content, preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["sessions"][0]["workout_date"] == "2026-07-17"
    assert "These columns are not imported: Notes." in preview.json()["warnings"]
    assert upload(client, content).status_code == 201
    assert [
        (item["weight_kg"], item["reps"], item["warmup"]) for item in imported_sets(client)
    ] == [
        (82.5, 6, True),
        (40, 10, False),
    ]


def test_missing_weight_columns_and_pound_conversions_are_summarised(client):
    no_weight = upload(client, "Date Lifted,Exercise,Reps\n2026-07-17,Pull Up,10\n", preview=True)
    assert no_weight.status_code == 200, no_weight.text
    assert any("no Weight (kg) or Weight (lb) column" in w for w in no_weight.json()["warnings"])

    pounds = "Date Lifted,Exercise,Weight (lb),Reps\n" + "2026-07-18,Bench Press,185,5\n" * 3
    warnings = upload(client, pounds, preview=True).json()["warnings"]
    assert "Converted Weight (lb) to kilograms on 3 rows." in warnings
    assert not any(item.startswith("Row ") for item in warnings)


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (
            "Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n"
            "2026-07-17 07:00:00,Push,Bench Press (Barbell),1,80,5\n",
            "Missing required columns: Date Lifted, Exercise.",
        ),
        (
            "Date Lifted,Exercise,Weight (kg),Reps\n17/07/2026,Bench Press,80,8\n",
            'YYYY-MM-DD format, such as 2026-10-17 (found "17/07/2026").',
        ),
        (
            'Date Lifted,Exercise,Weight (kg),Reps\n2026-07-17,Bench Press,"1,000",8\n',
            "Row 2: Weight (kg) must be a number.",
        ),
        (
            "Date Lifted,Exercise,Reps,reps\n2026-07-17,Bench Press,8,8\n",
            "The CSV contains the Reps column more than once.",
        ),
        (
            "Date Lifted,Exercise,Weight (kg),Reps\n2026-07-17,Développé couché,80,8\n".encode(
                "cp1252"
            ),
            "Save it as CSV UTF-8",
        ),
    ],
)
def test_unusable_files_explain_the_problem_and_save_nothing(client, content, message):
    assert message in error(upload(client, content, preview=True))
    assert message in error(upload(client, content))
    assert client.get("/api/workouts").json() == []
