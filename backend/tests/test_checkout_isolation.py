from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

import app

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PROBE = "backend/tests/test_checkout_isolation.py::test_app_is_imported_from_this_checkout"


def test_app_is_imported_from_this_checkout():
    assert Path(app.__file__).resolve().parent == REPOSITORY_ROOT / "backend" / "app"


def run_probe(tmp_path: Path, *options: str) -> subprocess.CompletedProcess[str]:
    # Stands in for a shared environment whose editable install points at another checkout.
    other_checkout = tmp_path / "other-checkout" / "backend"
    (other_checkout / "app").mkdir(parents=True)
    (other_checkout / "app" / "__init__.py").write_text("", encoding="utf-8")
    environment = {**os.environ, "PYTHONPATH": str(other_checkout), "RELAY_CHECKOUT_PROBE": "1"}
    return subprocess.run(
        [sys.executable, "-m", "pytest", PROBE, "-p", "no:cacheprovider", *options],
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )


nested = pytest.mark.skipif(
    os.environ.get("RELAY_CHECKOUT_PROBE") == "1", reason="already inside the probe run"
)


@nested
def test_pytest_prefers_this_checkout_over_another_on_the_import_path(tmp_path):
    result = run_probe(tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr


@nested
def test_pytest_stops_when_another_checkout_would_be_imported(tmp_path):
    result = run_probe(tmp_path, "-o", "pythonpath=")

    output = result.stdout + result.stderr
    assert result.returncode == 4, output
    assert "not from this checkout" in output
    assert str(tmp_path / "other-checkout" / "backend" / "app") in output
