from __future__ import annotations

import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from select_checks import ROOT, git, main, select_event, select_paths


class PathSelectionTests(unittest.TestCase):
    def test_frontend_paths(self):
        for path in (
            "frontend/src/App.tsx",
            "frontend/src/app.css",
            "frontend/package-lock.json",
            "frontend/vite.config.ts",
            "frontend/release.json",
            "frontend/public/icon.png",
        ):
            with self.subTest(path=path):
                selected = select_paths([path])
                self.assertTrue(selected.frontend)
                self.assertFalse(selected.backend)

    def test_backend_paths(self):
        for path in (
            "backend/tests/test_auth.py",
            "backend/app/cardio_energy.py",
            "backend/alembic/versions/sample.py",
            "pyproject.toml",
            "alembic.ini",
        ):
            with self.subTest(path=path):
                selected = select_paths([path])
                self.assertFalse(selected.frontend)
                self.assertTrue(selected.backend)

    def test_shared_contract_and_unknown_paths_run_both(self):
        for path in (
            "backend/app/tracker.py",
            "backend/app/models.py",
            "backend/app/tracker_schemas.py",
            "backend/app/new_schemas.py",
            "frontend/src/api.ts",
            "frontend/src/types.ts",
            ".github/workflows/checks.yml",
            ".github/scripts/select_checks.py",
            ".env.example",
            "deploy/update.sh",
            "new-shared-config.json",
        ):
            with self.subTest(path=path):
                selected = select_paths([path])
                self.assertTrue(selected.frontend and selected.backend)

    def test_docs_and_empty_diff_need_neither_suite(self):
        for paths in (
            [],
            ["README.md", "AGENTS.md", "docs/guide.md", "docs/screenshots/final.gif"],
        ):
            with self.subTest(paths=paths):
                selected = select_paths(paths)
                self.assertFalse(selected.frontend or selected.backend)

    def test_mixed_changes_run_both(self):
        selected = select_paths(["frontend/src/app.css", "backend/app/cardio_energy.py"])
        self.assertTrue(selected.frontend and selected.backend)

    def test_invalid_paths_fail(self):
        for path in ("", "/frontend/absolute", "backend/../unknown"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                select_paths([path])

    def test_all_current_route_modules_run_both(self):
        # A new router must be included in the contract map before it can skip a
        # client suite. This runs in the detector before any suite is selected.
        for path in (ROOT / "backend/app").glob("*.py"):
            if re.search(r"\bAPIRouter\b|@app\.", path.read_text(encoding="utf-8")):
                with self.subTest(path=path.name):
                    selected = select_paths([path.relative_to(ROOT).as_posix()])
                    self.assertTrue(selected.frontend and selected.backend)

    def test_main_release_push_and_manual_runs_are_full(self):
        selected = select_event("pull_request", {"pull_request": {"base": {"ref": "main"}}}, "")
        self.assertTrue(selected.frontend and selected.backend)
        for name in ("push", "workflow_dispatch", "unexpected-event"):
            with self.subTest(event=name):
                selected = select_event(name, {}, "")
                self.assertTrue(selected.frontend and selected.backend)


class MergeSelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="relay-ci-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        git(self.root, "init", "-b", "integration")
        git(self.root, "config", "user.name", "CI Sample")
        git(self.root, "config", "user.email", "ci@example.com")
        git(self.root, "config", "commit.gpgsign", "false")
        self.write("frontend/original.txt", "original")
        self.write("backend/helper.txt", "original")
        self.base = self.commit()
        git(self.root, "checkout", "-b", "feature")

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def commit(self):
        git(self.root, "add", ".")
        git(self.root, "commit", "-m", "Sample change")
        return git(self.root, "rev-parse", "HEAD").decode().strip()

    def merge(self):
        head = self.commit()
        git(self.root, "checkout", "integration")
        git(self.root, "merge", "--no-ff", "-m", "Sample PR merge", "feature")
        merge = git(self.root, "rev-parse", "HEAD").decode().strip()
        event = {
            "pull_request": {
                "base": {"ref": "develop", "sha": self.base},
                "head": {"sha": head},
            }
        }
        return event, merge

    def test_depth_two_checkout_selects_only_integrated_frontend_changes(self):
        self.write("frontend/name with spaces.txt", "new frontend")
        event, merge = self.merge()
        shallow = self.root / "shallow"
        git(
            self.root,
            "clone",
            "--depth=2",
            "--branch",
            "integration",
            self.root.as_uri(),
            str(shallow),
        )
        self.assertEqual(git(shallow, "rev-parse", "--is-shallow-repository").strip(), b"true")
        selected = select_event("pull_request", event, merge, shallow)
        self.assertTrue(selected.frontend)
        self.assertFalse(selected.backend)

    def test_cross_area_rename_includes_old_and_new_paths(self):
        git(self.root, "mv", "frontend/original.txt", "backend/moved.txt")
        event, merge = self.merge()
        selected = select_event("pull_request", event, merge, self.root)
        self.assertTrue(selected.frontend and selected.backend)

    def test_unrelated_base_branch_changes_do_not_expand_feature_scope(self):
        self.write("frontend/original.txt", "frontend feature")
        head = self.commit()
        git(self.root, "checkout", "integration")
        self.write("backend/helper.txt", "separate feature already integrated")
        base = self.commit()
        git(self.root, "merge", "--no-ff", "-m", "Sample PR merge", "feature")
        merge = git(self.root, "rev-parse", "HEAD").decode().strip()
        event = {
            "pull_request": {
                "base": {"ref": "develop", "sha": base},
                "head": {"sha": head},
            }
        }
        selected = select_event("pull_request", event, merge, self.root)
        self.assertTrue(selected.frontend)
        self.assertFalse(selected.backend)

    def test_stale_event_base_uses_merge_base_parent(self):
        # GitHub can report the PR's older base SHA after the base branch advances,
        # while the tested merge commit uses the current base tip as its parent.
        self.write("frontend/original.txt", "frontend feature")
        head = self.commit()
        git(self.root, "checkout", "integration")
        self.write("backend/helper.txt", "separate feature integrated after the PR base")
        self.commit()
        git(self.root, "merge", "--no-ff", "-m", "Sample PR merge", "feature")
        merge = git(self.root, "rev-parse", "HEAD").decode().strip()
        event = {
            "pull_request": {
                "base": {"ref": "develop", "sha": self.base},
                "head": {"sha": head},
            }
        }
        selected = select_event("pull_request", event, merge, self.root)
        self.assertTrue(selected.frontend)
        self.assertFalse(selected.backend)

    def test_deleted_backend_file_is_not_skipped(self):
        git(self.root, "rm", "backend/helper.txt")
        event, merge = self.merge()
        selected = select_event("pull_request", event, merge, self.root)
        self.assertFalse(selected.frontend)
        self.assertTrue(selected.backend)

    def test_no_three_hundred_file_truncation(self):
        for index in range(350):
            self.write(f"docs/{index}.md", "sample documentation")
        self.write("frontend/last.txt", "must not be overlooked")
        event, merge = self.merge()
        selected = select_event("pull_request", event, merge, self.root)
        self.assertTrue(selected.frontend)
        self.assertFalse(selected.backend)

    def test_wrong_commit_or_event_parents_fail_closed(self):
        self.write("frontend/original.txt", "changed")
        event, merge = self.merge()
        with self.assertRaises(ValueError):
            select_event("pull_request", event, "a" * 40, self.root)
        event["pull_request"]["head"]["sha"] = event["pull_request"]["base"]["sha"]
        with self.assertRaises(ValueError):
            select_event("pull_request", event, merge, self.root)
        event["pull_request"]["head"]["sha"] = "b" * 40
        with self.assertRaises(ValueError):
            select_event("pull_request", event, merge, self.root)
        event["pull_request"]["base"]["sha"] = "not-a-sha"
        with self.assertRaises(ValueError):
            select_event("pull_request", event, merge, self.root)

    def test_non_merge_checkout_fails_closed(self):
        self.write("frontend/original.txt", "changed")
        head = self.commit()
        event = {
            "pull_request": {
                "base": {"ref": "develop", "sha": self.base},
                "head": {"sha": head},
            }
        }
        with self.assertRaises(ValueError):
            select_event("pull_request", event, head, self.root)


class RequiredCheckTests(unittest.TestCase):
    def test_actual_workflow_gates_fail_for_failed_cancelled_or_missing_detection(self):
        workflow = (ROOT / ".github/workflows/checks.yml").read_text(encoding="utf-8")
        gates = re.findall(
            r"      - name: Validate check selection\n"
            r"(?:        .*\n)*?        run: \|\n((?:          .*\n)+)",
            workflow,
        )
        self.assertEqual(len(gates), 2)
        bash = "C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else shutil.which("bash")
        self.assertTrue(bash, "Bash is needed to verify the workflow's actual gate scripts")
        for gate in gates:
            script = "\n".join(line[10:] for line in gate.splitlines())
            for result, flag, expected in (
                ("success", "true", 0),
                ("success", "false", 0),
                ("failure", "false", 1),
                ("cancelled", "true", 1),
                ("skipped", "false", 1),
                ("success", "", 1),
                ("success", "unexpected", 1),
            ):
                with self.subTest(result=result, flag=flag):
                    process = subprocess.run(
                        [bash, "-c", script],
                        env={**os.environ, "DETECTION_RESULT": result, "RUN_CHECKS": flag},
                        capture_output=True,
                    )
                    self.assertEqual(process.returncode, expected, process.stderr)

    def test_cli_failure_does_not_publish_skip_outputs(self):
        with tempfile.TemporaryDirectory(prefix="relay-ci-output-") as directory:
            root = Path(directory)
            event = root / "event.json"
            event.write_text("{}", encoding="utf-8")
            output = root / "output"
            with (
                patch.dict(
                    os.environ,
                    {
                        "GITHUB_EVENT_NAME": "pull_request",
                        "GITHUB_EVENT_PATH": str(event),
                        "GITHUB_OUTPUT": str(output),
                    },
                ),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                self.assertEqual(main(), 1)
            self.assertFalse(output.exists())

    def test_cli_writes_valid_boolean_outputs_for_full_runs(self):
        with tempfile.TemporaryDirectory(prefix="relay-ci-output-") as directory:
            root = Path(directory)
            event = root / "event.json"
            event.write_text(json.dumps({}), encoding="utf-8")
            output = root / "output"
            summary = root / "summary"
            with (
                patch.dict(
                    os.environ,
                    {
                        "GITHUB_EVENT_NAME": "workflow_dispatch",
                        "GITHUB_EVENT_PATH": str(event),
                        "GITHUB_OUTPUT": str(output),
                        "GITHUB_STEP_SUMMARY": str(summary),
                    },
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(main(), 0)
            self.assertEqual(output.read_text(encoding="utf-8"), "frontend=true\nbackend=true\n")
            self.assertIn("Backend suite: run", summary.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
