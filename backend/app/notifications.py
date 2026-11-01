from __future__ import annotations

import asyncio
import base64
import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from typing import TYPE_CHECKING

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from requests import RequestException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import Settings
from .models import ActiveWorkoutReminder, PushSubscription
from .push_security import MAX_PUSH_SUBSCRIPTIONS, PushSession, validate_push_endpoint

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)


def _vapid_private_key(path: Path) -> ec.EllipticCurvePrivateKey:
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    path.parent.mkdir(parents=True, exist_ok=True)
    key = ec.generate_private_key(ec.SECP256R1())
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return key


def vapid_public_key(settings: Settings) -> str:
    key = _vapid_private_key(settings.web_push_vapid_private_key_path)
    raw = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def push_available(settings: Settings) -> bool:
    try:
        import pywebpush  # noqa: F401
    except ImportError:
        return False
    vapid_public_key(settings)
    return True


def send_push_notification(
    session_factory: Callable[[], Session],
    settings: Settings,
    *,
    title: str,
    body: str,
    user_id: str,
    endpoint: str | None = None,
    url: str = "/",
    tag: str | None = None,
) -> bool:
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("Push notification skipped because pywebpush is not installed")
        return False

    key_path = settings.web_push_vapid_private_key_path
    _vapid_private_key(key_path)
    with session_factory() as db:
        # Notifications always belong to exactly one account; never fan out to everyone.
        query = select(PushSubscription).where(PushSubscription.user_id == user_id)
        if endpoint is not None:
            query = query.where(PushSubscription.endpoint == endpoint)
        subscriptions = list(db.scalars(query.limit(MAX_PUSH_SUBSCRIPTIONS)))

    delivered = False
    stale_ids: list[str] = []
    for subscription in subscriptions:
        try:
            validate_push_endpoint(subscription.endpoint)
        except ValueError:
            stale_ids.append(subscription.id)
            continue
        try:
            with PushSession() as transport:
                response = webpush(
                    subscription_info={
                        "endpoint": subscription.endpoint,
                        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                    },
                    data=json.dumps({"title": title, "body": body, "url": url, "tag": tag}),
                    vapid_private_key=str(key_path),
                    vapid_claims={"sub": settings.web_push_contact_email},
                    timeout=10,
                    requests_session=transport,
                )
            delivered = delivered or (response is None or 200 <= response.status_code < 300)
        except (WebPushException, RequestException, ValueError) as error:
            response = getattr(error, "response", None)
            if response is not None and response.status_code in {404, 410}:
                stale_ids.append(subscription.id)
            else:
                logger.warning("Could not deliver push notification (%s)", type(error).__name__)

    if stale_ids:
        with session_factory() as db:
            db.execute(delete(PushSubscription).where(PushSubscription.id.in_(stale_ids)))
            db.commit()

    return delivered


class ActiveWorkoutReminderScheduler:
    def __init__(self, session_factory: Callable[[], Session], settings: Settings) -> None:
        self.session_factory = session_factory
        self.settings = settings
        self._task: asyncio.Task[None] | None = None
        self._lock = RLock()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)

    def schedule(self, *, endpoint: str, timer_id: str, started_at: float, user_id: str) -> None:
        with self._lock, self.session_factory() as db:
            reminder = db.get(ActiveWorkoutReminder, endpoint)
            if reminder and reminder.timer_id == timer_id and reminder.user_id == user_id:
                return  # Reconnecting must not postpone or repeat the same reminder.
            if reminder is None:
                reminder = ActiveWorkoutReminder(endpoint=endpoint)
                db.add(reminder)
            reminder.user_id = user_id
            reminder.timer_id = timer_id
            reminder.due_at = datetime.fromtimestamp(started_at, UTC) + timedelta(hours=2)
            reminder.delivered = False
            reminder.cancelled = False
            db.commit()

    def cancel(
        self, *, endpoint: str, timer_id: str | None = None, user_id: str | None = None
    ) -> None:
        with self._lock, self.session_factory() as db:
            reminder = db.get(ActiveWorkoutReminder, endpoint)
            if (
                reminder
                and (user_id is None or reminder.user_id == user_id)
                and (timer_id is None or reminder.timer_id == timer_id)
            ):
                reminder.cancelled = True
                db.commit()

    def deliver_due(self) -> None:
        with self._lock, self.session_factory() as db:
            reminders = list(
                db.scalars(
                    select(ActiveWorkoutReminder).where(
                        ActiveWorkoutReminder.due_at <= datetime.now(UTC),
                        ActiveWorkoutReminder.delivered.is_(False),
                        ActiveWorkoutReminder.cancelled.is_(False),
                    )
                )
            )
            for reminder in reminders:
                if (
                    reminder.user_id is None
                    or db.scalar(
                        select(PushSubscription.id).where(
                            PushSubscription.endpoint == reminder.endpoint,
                            PushSubscription.user_id == reminder.user_id,
                        )
                    )
                    is None
                ):
                    reminder.cancelled = True
                    db.commit()
                    continue
                delivered = send_push_notification(
                    self.session_factory,
                    self.settings,
                    title="Workout still active",
                    body=(
                        "Your workout has been running for 2 hours. Still training? "
                        "Finish and save it when you're done."
                    ),
                    user_id=reminder.user_id,
                    endpoint=reminder.endpoint,
                    url="/#log",
                    tag="active-workout",
                )
                reminder.delivered = delivered
                db.commit()

    async def _run(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self.deliver_due)
            except Exception:
                logger.exception("Could not deliver active workout reminders")
            await asyncio.sleep(15)


class RestTimerNotificationScheduler:
    def __init__(
        self,
        session_factory: Callable[[], Session],
        settings: Settings,
    ) -> None:
        self.session_factory = session_factory
        self.settings = settings
        self._tasks: dict[str, tuple[str, asyncio.Task[None]]] = {}

    def schedule(self, *, endpoint: str, timer_id: str, delay_seconds: int, user_id: str) -> None:
        self._cancel_endpoint(endpoint)
        task = asyncio.create_task(
            self._deliver(endpoint=endpoint, delay_seconds=delay_seconds, user_id=user_id)
        )
        self._tasks[endpoint] = (timer_id, task)
        task.add_done_callback(lambda completed: self._discard(endpoint, completed))

    def cancel(self, *, endpoint: str, timer_id: str) -> None:
        current = self._tasks.get(endpoint)
        if current is not None and current[0] == timer_id:
            self._cancel_endpoint(endpoint)

    def cancel_endpoint(self, endpoint: str) -> None:
        self._cancel_endpoint(endpoint)

    async def stop(self) -> None:
        tasks = [task for _, task in self._tasks.values()]
        self._tasks.clear()
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def _cancel_endpoint(self, endpoint: str) -> None:
        current = self._tasks.pop(endpoint, None)
        if current is not None:
            current[1].cancel()

    def _discard(self, endpoint: str, completed: asyncio.Task[None]) -> None:
        current = self._tasks.get(endpoint)
        if current is not None and current[1] is completed:
            self._tasks.pop(endpoint, None)

    async def _deliver(self, *, endpoint: str, delay_seconds: int, user_id: str) -> None:
        await asyncio.sleep(delay_seconds)
        await asyncio.to_thread(
            send_push_notification,
            self.session_factory,
            self.settings,
            title="Rest complete",
            body="Time for your next set.",
            user_id=user_id,
            endpoint=endpoint,
            url="/#log",
            tag="rest-timer",
        )
