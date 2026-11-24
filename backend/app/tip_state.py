"""Each account's tips (dismissed, learned, showings, the daily slot and Show tips), so they follow
the account across devices and between the app and the web.

Clients keep their own copy and save it here; every save is merged with what is stored, by the
rules in ``frontend/src/tipSync.ts`` (the shared cases in ``frontend/src/tipSyncCases.json`` check
both), so no device can erase another's progress. Tip ids and fields the server doesn't know are
kept as they are, for older and newer clients. Stored as the ``tip_state`` user setting, so account
export, backups, restore and deletion include it like the account's other settings.

Each request may name the account its client holds tips for (``account``); a mismatch with the
signed-in account is refused before anything is read, so a stale browser tab can't save one
account's tips into another. Restoring an account archive starts a new ``generation`` (a
server-managed setting the archive leaves out): a client that last synced an earlier generation is
sent the restored tips to adopt instead of merging its older copy back in.
"""

from __future__ import annotations

import json
import math
import sqlite3
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .account_backups import TIP_STATE_GENERATION_KEY
from .account_limits import limit_save_rate
from .auth import CurrentUser
from .database import get_db
from .errors import api_error
from .training_metrics import get_setting, set_setting

TIP_STATE_KEY = "tip_state"
# The server-managed TIP_STATE_GENERATION_KEY (account_backups.py): an archive restore replaces
# it with a new value (account_archive.py), and copies of the account leave it out.
INITIAL_GENERATION = "0"
# Matches TIP_SYNC_MAX_BYTES in frontend/src/tipSync.ts.
MAX_TIP_STATE_BYTES = 32 * 1024
KNOWN_FIELDS = frozenset(
    {
        "enabled",
        "enabledAt",
        "lastShown",
        "seen",
        "counts",
        "shows",
        "homeRead",
        "homeDone",
        "reminders",
    }
)
# Sync bookkeeping, never stored with the tips: the server's generation and a client's record of it.
IGNORED_FIELDS = frozenset({"generation", "syncGeneration"})
RANK = {"seen": 1, "dismissed": 2, "learned": 3}


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _number(value: Any) -> bool:
    # JSON true/false are not numbers, although Python's bool is an int.
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _amount(value: Any) -> int | float | None:
    return value if _number(value) and value >= 0 else None


def _amounts(value: Any) -> dict[str, int | float]:
    return {key: count for key, count in _record(value).items() if _amount(count) is not None}


def _ids(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return list(dict.fromkeys(item for item in value if isinstance(item, str)))


def _clean(value: Any) -> dict[str, Any]:
    raw = _record(value)
    reminders: dict[str, dict[str, Any]] = {}
    for tip_id, reminder in _record(raw.get("reminders")).items():
        reminder = _record(reminder)
        count = reminder.get("count")
        if not _number(count) or count < 0 or count != int(count):
            continue
        at = reminder.get("at")
        reminders[tip_id] = {"count": int(count), **({"at": at} if _number(at) else {})}
    return {
        "enabled": raw.get("enabled") is not False,
        "enabledAt": _amount(raw.get("enabledAt")) or 0,
        "lastShown": _amount(raw.get("lastShown")) or 0,
        "seen": {
            tip_id: status
            for tip_id, status in _record(raw.get("seen")).items()
            if isinstance(status, str) and status in RANK
        },
        "counts": _amounts(raw.get("counts")),
        "shows": _amounts(raw.get("shows")),
        "homeRead": _ids(raw.get("homeRead")),
        "homeDone": _ids(raw.get("homeDone")),
        "reminders": reminders,
        "extra": {
            key: item
            for key, item in raw.items()
            if key not in KNOWN_FIELDS and key not in IGNORED_FIELDS
        },
    }


def _larger(a: Any, b: Any) -> Any:
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


def merge_tip_states(stored: Any, incoming: Any) -> dict[str, Any]:
    """Merges two copies of an account's tips, as ``mergeTipStates`` in frontend/src/tipSync.ts."""
    a, b = _clean(stored), _clean(incoming)
    seen: dict[str, str] = {}
    shows: dict[str, Any] = {}
    reminders: dict[str, dict[str, Any]] = {}
    read: set[str] = set()
    done: set[str] = set()
    tip_ids: dict[str, None] = {}
    for side in (a, b):
        for tip_id in [
            *side["seen"],
            *side["shows"],
            *side["reminders"],
            *side["homeRead"],
            *side["homeDone"],
        ]:
            tip_ids.setdefault(tip_id, None)
    for tip_id in tip_ids:
        generation_a = a["reminders"].get(tip_id, {}).get("count", 0)
        generation_b = b["reminders"].get(tip_id, {}).get("count", 0)
        if generation_a != generation_b:
            # The tip came back on one side: its newer generation replaces the older progress.
            newer, older = (a, b) if generation_a > generation_b else (b, a)
            status = (
                "learned" if older["seen"].get(tip_id) == "learned" else newer["seen"].get(tip_id)
            )
            showings = newer["shows"].get(tip_id)
            reminder = newer["reminders"].get(tip_id)
            if tip_id in newer["homeRead"]:
                read.add(tip_id)
            if tip_id in newer["homeDone"]:
                done.add(tip_id)
        else:
            status_a, status_b = a["seen"].get(tip_id), b["seen"].get(tip_id)
            status = (
                (status_a or status_b)
                if RANK.get(status_a or "", 0) >= RANK.get(status_b or "", 0)
                else status_b
            )
            showings = _larger(a["shows"].get(tip_id), b["shows"].get(tip_id))
            reminder_a, reminder_b = a["reminders"].get(tip_id), b["reminders"].get(tip_id)
            reminder = None
            if reminder_a or reminder_b:
                at_a = (reminder_a or {}).get("at")
                at_b = (reminder_b or {}).get("at")
                at = at_b if at_a is None else at_a if at_b is None else min(at_a, at_b)
                reminder = {"count": generation_a, **({"at": at} if at is not None else {})}
            if tip_id in a["homeRead"] or tip_id in b["homeRead"]:
                read.add(tip_id)
            if tip_id in a["homeDone"] or tip_id in b["homeDone"]:
                done.add(tip_id)
        if status:
            seen[tip_id] = status
        if showings is not None:
            shows[tip_id] = showings
        if reminder:
            reminders[tip_id] = reminder
    counts = dict(a["counts"])
    for event, count in b["counts"].items():
        counts[event] = _larger(counts.get(event), count)
    if a["enabledAt"] == b["enabledAt"]:
        enabled = a["enabled"] and b["enabled"]
    else:
        enabled = a["enabled"] if a["enabledAt"] > b["enabledAt"] else b["enabled"]
    enabled_at = max(a["enabledAt"], b["enabledAt"])

    def ordered(members: set[str], first: list[str], second: list[str]) -> list[str]:
        return [tip_id for tip_id in dict.fromkeys([*first, *second]) if tip_id in members]

    home_read = ordered(read, a["homeRead"], b["homeRead"])
    home_done = ordered(done, a["homeDone"], b["homeDone"])
    return {
        **a["extra"],
        **b["extra"],
        "enabled": enabled,
        **({"enabledAt": enabled_at} if enabled_at else {}),
        "lastShown": max(a["lastShown"], b["lastShown"]),
        "seen": seen,
        "counts": counts,
        "shows": shows,
        **({"homeRead": home_read} if home_read else {}),
        **({"homeDone": home_done} if home_done else {}),
        **({"reminders": reminders} if reminders else {}),
    }


def _encoded(state: dict[str, Any]) -> str:
    return json.dumps(state, separators=(",", ":"), ensure_ascii=False)


def _too_large(text: str) -> bool:
    return len(text.encode("utf-8")) > MAX_TIP_STATE_BYTES


def stored_tip_state(db: Session, user_id: str) -> dict[str, Any]:
    try:
        value = json.loads(get_setting(db, user_id, TIP_STATE_KEY, "{}"))
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def tip_state_generation(db: Session, user_id: str) -> str:
    return get_setting(db, user_id, TIP_STATE_GENERATION_KEY, INITIAL_GENERATION)


def start_tip_state_generation(live: sqlite3.Connection, user_id: str) -> None:
    """Called inside an archive restore's own transaction, so the restored tips and their new
    generation commit together and no save can land between them: devices adopt the restore."""
    live.execute(
        "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) "
        "ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value",
        (user_id, TIP_STATE_GENERATION_KEY, uuid.uuid4().hex),
    )


def _begin_write(db: Session) -> None:
    """Takes the write lock before reading, so two devices saving at once are merged one after
    the other instead of the second overwriting the first (or both creating the row)."""
    db.connection().exec_driver_sql("BEGIN IMMEDIATE")


# Another writer (such as a long archive restore) held the database past SQLite's wait.
BUSY = HTTPException(
    status_code=503,
    detail={"error": {"code": "tip_state_busy", "message": "Tips are busy. Try again shortly."}},
    headers={"Retry-After": "2"},
)


router = APIRouter(prefix="/api/tips", tags=["tips"])
DbSession = Annotated[Session, Depends(get_db)]
# The account the client holds tips for, when it says.
ExpectedAccount = Annotated[str | None, Query(alias="account", max_length=64)]


def _check_account(user: CurrentUser, account: str | None) -> None:
    if account is not None and account != user.id:
        raise api_error(
            409, "tip_account_mismatch", "These tips belong to an account that is not signed in."
        )


@router.get("")
def get_tip_state(
    db: DbSession, user: CurrentUser, account: ExpectedAccount = None
) -> dict[str, Any]:
    """The account's tips as last merged (an empty object before any client has saved them),
    with the server's ``generation``."""
    _check_account(user, account)
    return {**stored_tip_state(db, user.id), "generation": tip_state_generation(db, user.id)}


@router.put("", dependencies=[Depends(limit_save_rate)])
def save_tip_state(
    db: DbSession,
    user: CurrentUser,
    payload: Annotated[dict[str, Any], Body()],
    account: ExpectedAccount = None,
    generation: Annotated[str | None, Query(max_length=64)] = None,
) -> dict[str, Any]:
    """Merges a client's tips into the account's and returns the result, with the server's
    ``generation``, for it to adopt. A client that names an earlier generation (it synced before an
    archive restore) gets the stored tips unmerged, to replace its own. A client that names none is
    taken to hold the initial generation, so it can't merge older tips into a restored account."""
    _check_account(user, account)
    if _too_large(_encoded(payload)):
        raise api_error(413, "tip_state_too_large", "These tips are too large to save.")
    try:
        _begin_write(db)
    except OperationalError as error:
        db.rollback()
        raise BUSY from error
    current = tip_state_generation(db, user.id)
    stored = stored_tip_state(db, user.id)
    if (generation if generation is not None else INITIAL_GENERATION) != current:
        db.rollback()
        return {**stored, "generation": current}
    merged = merge_tip_states(stored, payload)
    text = _encoded(merged)
    if _too_large(text):
        db.rollback()
        raise api_error(413, "tip_state_too_large", "These tips are too large to save.")
    set_setting(db, user.id, TIP_STATE_KEY, text)
    db.commit()
    return {**merged, "generation": current}
