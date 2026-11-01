"""Keep image/OCR work off the event loop and bound concurrent decoded images."""

from collections.abc import Callable
from functools import partial

import anyio

_image_workers = anyio.CapacityLimiter(2)


async def run_image_task[T](task: Callable[..., T], *args) -> T:
    # Do not abandon a running write on cancellation: callers clean temporary files afterward.
    return await anyio.to_thread.run_sync(partial(task, *args), limiter=_image_workers)
