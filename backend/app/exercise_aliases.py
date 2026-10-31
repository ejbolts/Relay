EXERCISE_ALIAS_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Barbell Bench Press", ("Bench Press",)),
    ("Incline Dumbbell Press", ("Incline Dumbbell Bench Press",)),
    ("Pec Deck", ("Machine Chest Fly",)),
    ("Machine Chest Press", ("Chest Press", "Machine bench press")),
    ("Pull-up", ("Pull Ups",)),
    (
        "Single-Arm Cable Lat Pulldown",
        ("One Arm Lat Pulldown", "One Arm Pulldown"),
    ),
    (
        "Single-Arm Cable Biceps Curl",
        ("Single arm cable bicep curl", "One Arm Cable Bicep Curl"),
    ),
    ("Single-Arm Preacher Curl", ("One Arm Dumbbell Preacher Curl",)),
    ("Standing Calf Raise", ("Machine Calf Raise",)),
    ("Back Extension Machine", ("Back Extension",)),
    ("Seated Ab Crunch Machine", ("Machine Seated Crunch",)),
    ("Barbell Row", ("Bent Over Row",)),
    ("Seated Machine Row", ("Machine Row",)),
    ("Back Squat", ("Squat",)),
    ("Bulgarian Split Squat", ("Dumbbell Bulgarian Split Squat",)),
    ("Lateral Raise", ("Dumbbell Lateral Raise", "Seated lateral raise")),
    ("Dumbbell Shoulder Press", ("Seated Dumbbell Shoulder Press",)),
    ("Overhead Press", ("Military Press",)),
    (
        "Single-Arm Cable Triceps Pushdown",
        ("Single Arm Tricep Pushdown (Cable)", "One Arm Tricep Rope Pushdown"),
    ),
    ("Triceps Machine Extension", ("Machine Tricep Extension",)),
    ("Triceps Pushdown", ("Tricep Pushdown",)),
    (
        "Straight-Arm Cable Pulldown",
        ("Straight Arm Pulldown", "Straight Bar Pull Down", "Rope Straight Arm Pulldown"),
    ),
    (
        "Single-Arm Cable Pullover",
        ("Single Arm Cable Pull Over", "One Arm Side Straight Arm Pulldown"),
    ),
    ("Dumbbell Curl", ("Seated Dumbbell Curl", "Dumbbell Bicep Curl", "Dumbbell Biceps Curl")),
    ("Cable Biceps Curl", ("Cable Curl", "Cable Bicep Curl")),
    ("Barbell Curl", ("Barbell Bicep Curl", "Barbell Biceps Curl")),
    ("Push-up", ("Push Up", "Push Ups", "Pushups")),
    ("EZ Bar Curl", ("EZ-Bar Curl", "EZ Bar Biceps Curl")),
    ("Face Pull", ("Cable Crossover Face Pull",)),
)


EXERCISE_NAME_ALIASES = {
    name.casefold(): canonical_name
    for canonical_name, aliases in EXERCISE_ALIAS_GROUPS
    for name in (canonical_name, *aliases)
}


def canonical_exercise_name(name: str) -> str:
    clean = " ".join(name.split())
    return EXERCISE_NAME_ALIASES.get(clean.casefold(), clean)
