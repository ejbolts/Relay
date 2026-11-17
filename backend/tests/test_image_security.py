import asyncio
import threading
import time

import pytest
from PIL import Image, XbmImagePlugin

from app.cardio_ocr import CardioScreenshotError, _prepare_image
from app.image_workers import run_image_task
from app.photo_storage import PhotoValidationError, _decode_photo


def test_unsupported_decoder_is_never_entered(tmp_path, monkeypatch):
    path = tmp_path / "benign.xbm"
    Image.new("1", (1, 1)).save(path, format="XBM")

    def forbidden(self):
        pytest.fail("Unsupported decoder ran before validation")

    monkeypatch.setattr(XbmImagePlugin.XbmImageFile, "_open", forbidden)
    with pytest.raises(PhotoValidationError):
        _decode_photo(path)
    with pytest.raises(CardioScreenshotError):
        _prepare_image(path.read_bytes())


def test_image_tasks_run_off_loop_with_at_most_two_workers():
    active = maximum = 0
    lock = threading.Lock()
    main_thread = threading.get_ident()

    def task():
        nonlocal active, maximum
        assert threading.get_ident() != main_thread
        with lock:
            active += 1
            maximum = max(maximum, active)
        time.sleep(0.02)
        with lock:
            active -= 1
        return "done"

    async def run():
        return await asyncio.gather(*(run_image_task(task) for _ in range(6)))

    assert asyncio.run(run()) == ["done"] * 6
    assert maximum == 2
