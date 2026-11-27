"""Reactions to workouts and comments: any single emoji.

Releases before custom reactions offered seven fixed reactions and stored them by name
(``"fire"``). Those names stay the stored key for their emojis, so older apps still show them;
every other emoji is stored as itself.
"""

from collections import Counter

LEGACY_REACTIONS: dict[str, str] = {
    "like": "👍",
    "love": "❤️",
    "strong": "💪",
    "fire": "🔥",
    "clap": "👏",
    "trophy": "🏆",
    "run": "🏃",
}

# The longest emoji in use, a kiss with two skin tones, has 10 code points; flags of a region
# have 7. The database checks the same limit.
MAX_REACTION_LENGTH = 16

VS15, VS16, ZWJ, KEYCAP, CANCEL_TAG = 0xFE0E, 0xFE0F, 0x200D, 0x20E3, 0xE007F

_LEGACY_KEYS = {emoji.replace("\ufe0f", ""): kind for kind, emoji in LEGACY_REACTIONS.items()}

# Code points that can start an emoji: the pictographic blocks plus the older symbols that
# Unicode also gives an emoji form. Letters, digits on their own, punctuation and spaces can't.
_PICTOGRAPHIC = (
    (0x00A9, 0x00A9),
    (0x00AE, 0x00AE),
    (0x203C, 0x203C),
    (0x2049, 0x2049),
    (0x2122, 0x2122),
    (0x2139, 0x2139),
    (0x2194, 0x2199),
    (0x21A9, 0x21AA),
    (0x231A, 0x231B),
    (0x2328, 0x2328),
    (0x23CF, 0x23CF),
    (0x23E9, 0x23F3),
    (0x23F8, 0x23FA),
    (0x24C2, 0x24C2),
    (0x25AA, 0x25AB),
    (0x25B6, 0x25B6),
    (0x25C0, 0x25C0),
    (0x25FB, 0x25FE),
    (0x2600, 0x27BF),
    (0x2934, 0x2935),
    (0x2B05, 0x2B07),
    (0x2B1B, 0x2B1C),
    (0x2B50, 0x2B50),
    (0x2B55, 0x2B55),
    (0x3030, 0x3030),
    (0x303D, 0x303D),
    (0x3297, 0x3297),
    (0x3299, 0x3299),
    (0x1F000, 0x1F1E5),
    (0x1F200, 0x1F3FA),
    (0x1F400, 0x1FAFF),
    (0x1FC00, 0x1FFFD),
)


def _pictographic(point: int) -> bool:
    return any(start <= point <= end for start, end in _PICTOGRAPHIC)


def _regional(point: int) -> bool:
    return 0x1F1E6 <= point <= 0x1F1FF


def _skin_tone(point: int) -> bool:
    return 0x1F3FB <= point <= 0x1F3FF


def _tag(point: int) -> bool:
    return 0xE0020 <= point <= 0xE007E


def _element(points: list[int]) -> bool:
    """One emoji between joiners: a symbol, optionally styled, toned or tagged (a region flag)."""
    if not points or not _pictographic(points[0]):
        return False
    rest = points[1:]
    if rest and rest[0] in (VS15, VS16):
        rest = rest[1:]
    if rest and _skin_tone(rest[0]):
        rest = rest[1:]
    if rest and _tag(rest[0]):
        tags = rest[:-1]
        return rest[-1] == CANCEL_TAG and all(_tag(point) for point in tags)
    return not rest


def is_single_emoji(value: str) -> bool:
    """Whether ``value`` is one emoji, including joined, skin-toned, keycap and flag emojis."""
    points = [ord(char) for char in value]
    if not points or len(points) > MAX_REACTION_LENGTH:
        return False
    if len(points) == 2 and all(_regional(point) for point in points):
        return True
    if points[-1] == KEYCAP:
        base = [point for point in points[:-1] if point != VS16]
        return len(base) == 1 and chr(base[0]) in "0123456789#*"
    return all(_element(part) for part in _split(points))


def _split(points: list[int]) -> list[list[int]]:
    parts: list[list[int]] = [[]]
    for point in points:
        if point == ZWJ:
            parts.append([])
        else:
            parts[-1].append(point)
    return parts


def reaction_key(value: str) -> str:
    """The stored key for a chosen reaction: its legacy name, or the emoji itself."""
    if value in LEGACY_REACTIONS:
        return value
    emoji = value.strip()
    if not is_single_emoji(emoji):
        raise ValueError("Choose a single emoji")
    return _LEGACY_KEYS.get(emoji.replace("\ufe0f", ""), emoji)


def ordered_counts(counter: Counter[str]) -> list[tuple[str, int]]:
    """The legacy reactions in their familiar order, then other emojis, most used first."""
    legacy = list(LEGACY_REACTIONS)
    return sorted(
        ((key, count) for key, count in counter.items() if count),
        key=lambda item: (
            (0, legacy.index(item[0]), 0, "")
            if item[0] in LEGACY_REACTIONS
            else (1, 0, -item[1], item[0])
        ),
    )
