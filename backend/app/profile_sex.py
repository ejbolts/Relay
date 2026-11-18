"""An account's sex: chosen once by its owner, after which only an administrator can change it."""

from typing import Literal

Sex = Literal["male", "female"]


def known_sex(value: str | None) -> Sex | None:
    """The stored value when it is one the app knows, else None."""
    return value if value in ("male", "female") else None  # type: ignore[return-value]
