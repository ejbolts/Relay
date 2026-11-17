import pytest

from app.tracker_schemas import ExerciseRead


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        (
            {
                "muscle_contributions": [
                    {"muscle_name": "Pectorals", "role": "primary", "contribution_factor": 1},
                    {"muscle_name": "Triceps", "role": "secondary", "contribution_factor": 0.5},
                ]
            },
            {"Pectorals": 1, "Triceps": 0.5},
        ),
        (
            {
                "muscle_contributions": [
                    {"muscle_name": "Upper back", "role": "secondary", "contribution_factor": 0.5},
                    {
                        "muscle_name": "Mid / Upper Back",
                        "role": "primary",
                        "contribution_factor": 1,
                    },
                    {"muscle_name": "Brachialis", "role": "secondary", "contribution_factor": 0.5},
                ]
            },
            {"Mid / Upper Back": 1},
        ),
        ({"is_custom": True, "muscle_group": "Anterior deltoids"}, {"Front delts": 1}),
        ({"kind": "cardio"}, {}),
        ({"category": "cardio"}, {}),
        ({"muscle_group": "External rotators"}, {}),
    ],
)
def test_serialized_help_credits_match_weekly_totals(overrides, expected):
    exercise = ExerciseRead.model_validate(
        {
            "id": "exercise",
            "name": "Test exercise",
            "category": "push",
            "kind": "strength",
            "muscle_group": "Pectorals",
            "equipment": None,
            "is_custom": False,
            "is_favorite": False,
            **overrides,
        }
    )
    payload = exercise.model_dump(mode="json")
    assert {
        credit["muscle_name"]: credit["sets"] for credit in payload["muscle_set_credits"]
    } == expected
