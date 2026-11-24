"""Alerts for the native app, sent through Expo's push service.

Delivery runs on its own worker threads, so a slow or failing Expo request never delays or changes
the outcome of Web Push, the schedulers or other accounts. Each registration is read when its alert
is sent: only tokens whose sign-in is still current are alerted, and a phone that scheduled the
same "Still working out?" itself is skipped. Tokens Expo reports as unregistered, at once or in a
later receipt, are removed only while they still belong to the same account and sign-in.
"""

from __future__ import annotations

import heapq
import logging
import queue
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal

import requests
from requests import RequestException
from sqlalchemy import and_, delete, or_, select, update

from .models import ExpoPushToken, UserSession
from .push_security import EXPO_PUSH_URL, MAX_EXPO_PUSH_TOKENS

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session

    from .config import Settings

logger = logging.getLogger(__name__)

EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
INACTIVE_WORKOUT_ALERT = "inactive-workout"
# The phone and the server work out the same due time from the same shared draft activity, so a
# phone's own reminder counts as the server's only when they are this close, either way.
LOCAL_REMINDER_TOLERANCE_MS = 2 * 60_000
# The notification channel the app creates on Android before it asks for a token.
ANDROID_CHANNEL = "relay-alerts"
# Connect and read timeouts for each Expo request.
EXPO_TIMEOUT = (3.05, 10)
# Errors in a ticket or receipt that mean the server's Expo or provider credentials are wrong.
CREDENTIAL_ERRORS = {"InvalidCredentials", "MismatchSenderId"}


@dataclass(frozen=True)
class LocalReminder:
    """A "Still working out?" alert the app may already have scheduled on the phone itself."""

    workout: str | None
    """The workout it is about: the shared draft's ``started_at``."""
    due_ms: int
    """When the server's own alert is due, in epoch milliseconds."""


@dataclass(frozen=True)
class ExpoAlert:
    user_id: str
    title: str
    body: str
    data: dict = field(default_factory=dict)
    local_reminder: LocalReminder | None = None
    ttl_seconds: int | None = None
    # The same alert sent again (such as a reminder retried for its browsers) goes out once.
    dedupe_key: str | None = None
    # After this (epoch milliseconds) the alert is no longer useful; it also bounds Expo's TTL.
    expires_at_ms: int | None = None


@dataclass(frozen=True)
class Registration:
    """A token as it was read for one send; pruning only removes it if it is still this."""

    id: str
    user_id: str
    session_id: str | None
    token: str
    platform: str | None


def now_ms() -> int:
    return int(time.time() * 1000)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def scheduled_on_phone(token: ExpoPushToken, reminder: LocalReminder | None) -> bool:
    """Whether the phone has this very alert scheduled itself, so a push would alert it twice."""
    return (
        reminder is not None
        and INACTIVE_WORKOUT_ALERT in (token.local_alerts or [])
        and reminder.workout is not None
        and token.local_reminder_workout == reminder.workout
        and token.local_reminder_due_ms is not None
        and abs(token.local_reminder_due_ms - reminder.due_ms) <= LOCAL_REMINDER_TOLERANCE_MS
    )


def read_registrations(
    session_factory: Callable[[], Session],
    user_id: str,
    reminder: LocalReminder | None = None,
    token: str | None = None,
) -> tuple[list[Registration], bool, list[Registration]]:
    """The account's current registrations, whether one covered the alert, and ended ones."""
    now = datetime.now(UTC)
    targets: list[Registration] = []
    ended: list[Registration] = []
    covered = False
    with session_factory() as db:
        query = (
            select(ExpoPushToken, UserSession.expires_at)
            .outerjoin(UserSession, UserSession.id == ExpoPushToken.session_id)
            .where(ExpoPushToken.user_id == user_id)
        )
        if token is not None:
            query = query.where(ExpoPushToken.token == token)
        for row, expires_at in db.execute(query.limit(MAX_EXPO_PUSH_TOKENS * 2)):
            registration = Registration(
                row.id, row.user_id, row.session_id, row.token, row.platform
            )
            if expires_at is None or _aware(expires_at) <= now:
                # Its sign-in ended (signed out, password changed or expired): never alert it.
                ended.append(registration)
            elif scheduled_on_phone(row, reminder) or (
                # Already sent (or refused for good) for this idle spell, even before a restart.
                reminder is not None and row.native_reminder_due_ms == reminder.due_ms
            ):
                covered = True
            else:
                targets.append(registration)
    return targets[:MAX_EXPO_PUSH_TOKENS], covered, ended


def _still(registrations: list[Registration]):
    """Rows that are still these registrations: the same account and sign-in."""
    return or_(
        *(
            and_(
                ExpoPushToken.id == item.id,
                ExpoPushToken.user_id == item.user_id,
                ExpoPushToken.session_id.is_(None)
                if item.session_id is None
                else ExpoPushToken.session_id == item.session_id,
            )
            for item in registrations
        )
    )


def prune(session_factory: Callable[[], Session], registrations: list[Registration]) -> None:
    """Removes these registrations, but not a token that has since moved to another sign-in."""
    if not registrations:
        return
    with session_factory() as db:
        db.execute(delete(ExpoPushToken).where(_still(registrations)))
        db.commit()


def mark_reminded(
    session_factory: Callable[[], Session], registrations: list[Registration], due_ms: int
) -> None:
    """Records that these phones have had the "Still working out?" for the spell due then."""
    if not registrations:
        return
    with session_factory() as db:
        db.execute(
            update(ExpoPushToken).where(_still(registrations)).values(native_reminder_due_ms=due_ms)
        )
        db.commit()


def message_for(registration: Registration, alert: ExpoAlert) -> dict:
    message = {
        "to": registration.token,
        "title": alert.title,
        "body": alert.body,
        "data": alert.data,
        "sound": "default",
        "priority": "high",
    }
    if registration.platform == "android":
        message["channelId"] = ANDROID_CHANNEL
    ttl = alert.ttl_seconds
    if alert.expires_at_ms is not None:
        # Counted from when the alert was due, not from when this attempt went out.
        remaining = max(1, (alert.expires_at_ms - now_ms()) // 1000)
        ttl = remaining if ttl is None else min(ttl, remaining)
    if ttl is not None:
        message["ttl"] = ttl
    return message


def _headers(settings: Settings) -> dict:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"
    return headers


def post_expo(messages: list[dict], settings: Settings) -> list[dict]:
    """Sends messages to Expo's push service and returns its tickets, in the same order."""
    response = requests.post(
        EXPO_PUSH_URL,
        json=messages,
        headers=_headers(settings),
        timeout=EXPO_TIMEOUT,
        allow_redirects=False,
    )
    response.raise_for_status()
    tickets = response.json().get("data")
    return tickets if isinstance(tickets, list) else []


def fetch_receipts(ids: list[str], settings: Settings) -> dict:
    """Expo's receipts for earlier tickets, by ticket id."""
    response = requests.post(
        EXPO_RECEIPTS_URL,
        json={"ids": ids},
        headers=_headers(settings),
        timeout=EXPO_TIMEOUT,
        allow_redirects=False,
    )
    response.raise_for_status()
    receipts = response.json().get("data")
    return receipts if isinstance(receipts, dict) else {}


def _error(item: dict) -> str | None:
    return (item.get("details") or {}).get("error")


def _report(item: dict, where: str) -> None:
    error = _error(item)
    if error in CREDENTIAL_ERRORS:
        logger.error(
            "Expo push credentials were refused in a %s (%s); check the EAS push credentials",
            where,
            error,
        )
    else:
        logger.warning("Expo refused a push notification in a %s (%s)", where, error)


TestOutcome = Literal["ok", "unregistered", "failed"]


class ExpoPushDispatcher:
    """Sends native alerts in the background, for as long as the app is running.

    Work is admitted to a bounded queue served by a few worker threads; retries and receipt checks
    wait in one scheduler thread. ``start`` and ``stop`` follow the app's lifespan: on stopping it
    takes no more work, drops what is queued or waiting, and waits a bounded time for requests
    already out. Each worker opens and closes its own database sessions.
    """

    def __init__(self, *, workers: int = 2, max_queued: int = 500, max_waiting: int = 1000) -> None:
        self.retry_delay = 10.0
        self.receipt_delay = 15 * 60.0
        self.dedupe_seconds = 60 * 60.0
        # Tests run alerts at once, in the calling thread.
        self.inline = False
        self._workers = workers
        self._max_queued = max_queued
        self._max_waiting = max_waiting
        self._lock = threading.Condition()
        self._users = 0
        self._closed = True
        self._queue: queue.Queue = queue.Queue(maxsize=max_queued)
        self._waiting: list[tuple[float, int, int, Callable, tuple]] = []
        self._sequence = 0
        self._threads: list[threading.Thread] = []
        # Each start begins a generation. Work belongs to the generation that admitted it, and a
        # worker still busy from an earlier one can never add work to a later one.
        self._generation = 0
        self._local = threading.local()
        self._recent: OrderedDict[str, float] = OrderedDict()
        # In inline mode, retries and receipt checks wait here until a test runs them.
        self._pending_later: list[tuple] = []

    # --- lifecycle -------------------------------------------------------------------------
    def start(self) -> None:
        """Starts serving work; each app lifespan calls it once and ``stop`` once."""
        with self._lock:
            self._users += 1
            if not self._closed:
                return
            self._closed = False
            self._generation += 1
            generation = self._generation
            self._queue = queue.Queue(maxsize=self._max_queued)
            self._waiting = []
            self._threads = [
                threading.Thread(
                    target=self._work,
                    args=(generation, self._queue),
                    name=f"expo-push-{index}",
                    daemon=True,
                )
                for index in range(self._workers)
            ]
            self._threads.append(
                threading.Thread(
                    target=self._schedule, args=(generation,), name="expo-push-later", daemon=True
                )
            )
            for thread in self._threads:
                thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        """Stops taking work, drops what is queued or waiting, and waits up to ``timeout``."""
        with self._lock:
            self._users = max(0, self._users - 1)
            if self._users or self._closed:
                return
            self._closed = True
            self._waiting.clear()
            threads, self._threads = self._threads, []
            work = self._queue
            self._lock.notify_all()
        while True:
            try:
                work.get_nowait()
                work.task_done()
            except queue.Empty:
                break
        for _ in range(self._workers):
            try:
                work.put_nowait(None)
            except queue.Full:
                break
        deadline = time.monotonic() + timeout
        for thread in threads:
            # A start that failed partway leaves threads that never ran.
            if thread.is_alive():
                thread.join(max(0.0, deadline - time.monotonic()))

    @property
    def running(self) -> bool:
        return not self._closed

    def _open(self, generation: int) -> bool:
        """Whether that generation may still take work. Call it holding the lock."""
        return not self._closed and generation == self._generation

    def _work(self, generation: int, work: queue.Queue) -> None:
        # Anything this worker admits or schedules belongs to its own generation.
        self._local.generation = generation
        while True:
            item = work.get()
            try:
                if item is None:
                    return
                with self._lock:
                    current = self._open(generation)
                if current:
                    self._guard(*item)
            finally:
                work.task_done()

    def _schedule(self, generation: int) -> None:
        self._local.generation = generation
        with self._lock:
            while self._open(generation):
                if not self._waiting:
                    self._lock.wait()
                    continue
                due = self._waiting[0][0] - time.monotonic()
                if due > 0:
                    self._lock.wait(due)
                    continue
                _, _, owner, function, args = heapq.heappop(self._waiting)
                self._admit(function, args, owner)

    # --- admission -------------------------------------------------------------------------
    def _generation_of_caller(self) -> int:
        """A worker's own generation; the current one for the app's own threads."""
        return getattr(self._local, "generation", None) or self._generation

    def _admit(self, function: Callable, args: tuple, generation: int | None = None) -> None:
        if self.inline:
            self._guard(function, *args)
            return
        with self._lock:
            owner = self._generation_of_caller() if generation is None else generation
            if not self._open(owner):
                logger.debug("Expo push work dropped: its app lifespan has ended")
                return
            try:
                self._queue.put_nowait((function, *args))
            except queue.Full:
                logger.warning("Expo push queue is full; an alert was dropped")

    def _later(self, delay: float, function: Callable, *args) -> None:
        if self.inline:
            self._pending_later.append((function, args))
            return
        with self._lock:
            owner = self._generation_of_caller()
            if not self._open(owner):
                return
            if len(self._waiting) >= self._max_waiting:
                logger.warning(
                    "Too much delayed Expo push work; a retry or receipt check was dropped"
                )
                return
            self._sequence += 1
            heapq.heappush(
                self._waiting, (time.monotonic() + delay, self._sequence, owner, function, args)
            )
            self._lock.notify_all()

    @staticmethod
    def _guard(function: Callable, *args) -> None:
        try:
            function(*args)
        except Exception:  # A failed alert must never stop the worker.
            logger.exception("Could not send Expo push notifications")

    # --- sending ---------------------------------------------------------------------------
    def submit(
        self, session_factory: Callable[[], Session], settings: Settings, alert: ExpoAlert
    ) -> None:
        if alert.dedupe_key is not None and not self._first(alert.dedupe_key):
            return
        self._admit(self._deliver, (session_factory, settings, alert, 1))

    def _first(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            while self._recent and next(iter(self._recent.values())) < now - self.dedupe_seconds:
                self._recent.popitem(last=False)
            if key in self._recent:
                return False
            self._recent[key] = now
            while len(self._recent) > 5_000:
                self._recent.popitem(last=False)
            return True

    def _deliver(
        self,
        session_factory: Callable[[], Session],
        settings: Settings,
        alert: ExpoAlert,
        attempt: int,
    ) -> None:
        if alert.expires_at_ms is not None and now_ms() >= alert.expires_at_ms:
            return  # Too late to be useful.
        targets, _covered, ended = read_registrations(
            session_factory, alert.user_id, alert.local_reminder
        )
        prune(session_factory, ended)
        if not targets:
            return
        try:
            tickets = post_expo([message_for(target, alert) for target in targets], settings)
        except (RequestException, ValueError) as error:
            logger.warning("Could not reach Expo's push service (%s)", type(error).__name__)
            if attempt < 2:
                self._later(self.retry_delay, self._deliver, session_factory, settings, alert, 2)
            return
        outcomes = self._handle_tickets(session_factory, settings, targets, tickets)
        if alert.local_reminder is not None:
            # Decided for this idle spell, whether Expo took it or refused it for good: the
            # reminder is never sent to these phones again for it, whatever the browsers do.
            mark_reminded(
                session_factory,
                [target for target in targets if outcomes.get(target.token) in {"ok", "failed"}],
                alert.local_reminder.due_ms,
            )

    def _handle_tickets(
        self,
        session_factory: Callable[[], Session],
        settings: Settings,
        targets: list[Registration],
        tickets: list,
    ) -> dict[str, str]:
        """Prunes unregistered tokens, schedules a receipt check, and returns each outcome."""
        stale: list[Registration] = []
        receipts: dict[str, Registration] = {}
        outcomes: dict[str, str] = {}
        for target, ticket in zip(targets, tickets, strict=False):
            if not isinstance(ticket, dict):
                continue
            if ticket.get("status") == "ok":
                outcomes[target.token] = "ok"
                if isinstance(ticket.get("id"), str):
                    receipts[ticket["id"]] = target
            elif _error(ticket) == "DeviceNotRegistered":
                outcomes[target.token] = "unregistered"
                stale.append(target)
            else:
                outcomes[target.token] = "failed"
                _report(ticket, "ticket")
        prune(session_factory, stale)
        if receipts:
            self._later(
                self.receipt_delay, self.check_receipts, session_factory, settings, receipts
            )
        return outcomes

    def check_receipts(
        self,
        session_factory: Callable[[], Session],
        settings: Settings,
        receipts: dict[str, Registration],
    ) -> None:
        """Expo's later word on accepted tickets: prunes unregistered tokens, logs errors."""
        try:
            found = fetch_receipts(list(receipts)[:1000], settings)
        except (RequestException, ValueError) as error:
            logger.warning("Could not read Expo push receipts (%s)", type(error).__name__)
            return
        stale: list[Registration] = []
        for ticket_id, receipt in found.items():
            if not isinstance(receipt, dict) or receipt.get("status") != "error":
                continue
            if _error(receipt) == "DeviceNotRegistered" and ticket_id in receipts:
                stale.append(receipts[ticket_id])
            else:
                _report(receipt, "receipt")
        prune(session_factory, stale)

    def send_now(
        self,
        session_factory: Callable[[], Session],
        settings: Settings,
        alert: ExpoAlert,
        token: str,
    ) -> TestOutcome:
        """Sends to one registration and waits for Expo's answer, for the app's test alert."""
        targets, _covered, ended = read_registrations(session_factory, alert.user_id, token=token)
        prune(session_factory, ended)
        if not targets:
            return "unregistered"
        try:
            tickets = post_expo([message_for(targets[0], alert)], settings)
        except (RequestException, ValueError) as error:
            logger.warning("Could not reach Expo's push service (%s)", type(error).__name__)
            return "failed"
        outcome = self._handle_tickets(session_factory, settings, targets[:1], tickets)
        return outcome.get(token, "failed")  # type: ignore[return-value]

    # --- tests -----------------------------------------------------------------------------
    def drain(self, timeout: float = 10) -> None:
        """Waits for queued alerts (not for retries or receipt checks still waiting)."""
        deadline = time.monotonic() + timeout
        while self._queue.unfinished_tasks and time.monotonic() < deadline:
            time.sleep(0.01)

    def run_later_now(self) -> None:
        """For tests in inline mode: runs the retries and receipt checks that are waiting."""
        pending, self._pending_later = self._pending_later, []
        for function, args in pending:
            self._guard(function, *args)

    def reset(self) -> None:
        """For tests: forgets sent alerts and anything waiting."""
        self._pending_later = []
        with self._lock:
            self._recent.clear()
            self._waiting.clear()


expo_dispatcher = ExpoPushDispatcher()
