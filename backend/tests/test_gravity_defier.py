import pytest
from test_profile_borders import borders, set_sex, stats, wear, weigh_in, workout

from app import profile_borders


@pytest.fixture(autouse=True)
def backdates_allowed(monkeypatch):
    monkeypatch.setattr(profile_borders, "BACKDATES_PER_WEEK", 10_000)


@pytest.mark.parametrize(
    ("sex", "earned", "progress"),
    [
        ("male", 2, {"current": 18, "target": 25, "unit": "dips"}),
        ("female", 3, {"current": 9, "target": 10, "unit": "pull-ups"}),
    ],
)
def test_rep_tiers(client, sex, earned, progress):
    workout(client, "2026-01-05", "Pull-up", [{"reps": 7}, {"reps": 9}])
    workout(
        client,
        "2026-01-07",
        "Dips",
        [
            {"weight_kg": 16, "reps": 18},
            {"reps": 40, "set_type": "warmup"},
            {"reps": 40, "failed": True},
            {"reps": 40, "completed": False},
        ],
    )

    unknown = borders(client)["gravity-defier-1"]
    assert unknown["needs_sex"] and not unknown["unlocked"]
    assert unknown["requirement"] == (
        "Do 1 pull-up or chin-up, or 5 dips, in one set (men) or "
        "Do 1 pull-up or chin-up, or 3 dips, in one set (women)"
    )
    set_sex(client, sex)
    listed = borders(client)
    assert [listed[f"gravity-defier-{n}"]["unlocked"] for n in range(1, 6)] == [
        n <= earned for n in range(1, 6)
    ]
    assert listed[f"gravity-defier-{earned + 1}"]["progress"] == progress
    assert listed["gravity-defier-5"]["rarity"] == "mythic"


def test_weighted_tier_reads_body_weight_like_relative_strength(client):
    set_sex(client, "male")
    # No weigh-in yet: the first later one stands in.
    workout(client, "2025-12-30", "Chin-up", [{"reps": 5, "weight_kg": 16}])
    weigh_in(client, "2026-01-01", 80)
    assert stats(client)["bodyweight_added"] == 20
    weigh_in(client, "2026-01-06", 100)
    # The latest weigh-in by the day counts, not a nearer later one.
    workout(
        client,
        "2026-01-05",
        "Chin-up",
        [{"reps": 4, "weight_kg": 90}, {"reps": 5, "weight_kg": 24}],
    )
    workout(client, "2026-01-06", "Dips", [{"reps": 5, "weight_kg": 36}])
    assert stats(client)["bodyweight_added"] == 30
    tier = borders(client)["gravity-defier-5"]
    assert tier["progress"] == {"current": 30, "target": 40, "unit": "% BW"}
    assert tier["requirement"] == (
        "Do 5 pull-ups or chin-ups with 40% of your body weight added, or 5 dips with 60%"
    )
    assert not tier["unlocked"]

    workout(client, "2026-01-07", "Dips", [{"reps": 5, "weight_kg": 60}])
    tier = borders(client)["gravity-defier-5"]
    assert tier["progress"] == {"current": 60, "target": 60, "unit": "% BW"}
    assert tier["unlocked"]
    assert wear(client, "gravity-defier-5").status_code == 200
