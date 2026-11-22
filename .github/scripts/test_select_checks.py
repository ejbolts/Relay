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

from select_checks import (
    ROOT,
    git,
    main,
    mobile_shared_files,
    select_event,
    select_paths,
)


class PathSelectionTests(unittest.TestCase):
    def test_frontend_paths(self):
        for path in (
            "frontend/src/App.tsx",
            "frontend/package-lock.json",
            "frontend/vite.config.ts",
            "frontend/release.json",
            "frontend/public/icon.png",
        ):
            with self.subTest(path=path):
                selected = select_paths([path])
                self.assertEqual(selected.frontend, "full")
                self.assertFalse(selected.backend)
                self.assertFalse(selected.mobile)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "frontend/src").mkdir(parents=True)
            style = "frontend/src/sample.css"
            source = "frontend/src/Sample.tsx"
            test = "frontend/src/Sample.test.tsx"
            unrelated = "frontend/src/Other.test.tsx"
            for path in (style, source, test, unrelated):
                (root / path).touch()
            for paths, expected in (
                ([style, "README.md"], "styles"),
                ([test], "related"),
                ([source, test, style], "related"),
                ([source], "full"),
                ([source, unrelated], "full"),
                ([source, test, "frontend/src/api.ts"], "full"),
                ([style, "frontend/src/deleted.css"], "full"),
                ([test, "frontend/src/deleted.test.tsx"], "full"),
                ([style, "frontend/package-lock.json"], "full"),
            ):
                with self.subTest(paths=paths):
                    self.assertEqual(select_paths(paths, root).frontend, expected)

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
                self.assertEqual(selected.frontend, "none")
                self.assertTrue(selected.backend)
                self.assertFalse(selected.mobile)

    def test_mobile_paths_run_only_the_mobile_checks(self):
        for path in (
            "mobile/src/app/index.tsx",
            "mobile/package-lock.json",
            "mobile/app.json",
            "mobile/assets/icon.png",
            "mobile/README.md",
        ):
            with self.subTest(path=path):
                selected = select_paths([path])
                self.assertEqual(
                    (selected.frontend, selected.backend, selected.mobile), ("none", False, True)
                )

    def test_frontend_files_the_mobile_app_imports_run_the_mobile_checks(self):
        shared = mobile_shared_files()
        self.assertTrue({"frontend/src/types.ts", "frontend/src/upNextSession.ts"} <= shared)
        for path in shared:
            with self.subTest(path=path):
                self.assertTrue(select_paths([path]).mobile)

    def test_shared_files_import_no_packages(self):
        # Metro would resolve a package here from the web's node_modules, not the app's.
        for path in mobile_shared_files():
            with self.subTest(path=path):
                text = (ROOT / path).read_text(encoding="utf-8")
                packages = re.findall(r"""\bfrom\s*['"]([^./'"][^'"]*)['"]""", text)
                self.assertEqual(packages, [])

    def test_mobile_shared_files_follow_imports_through_the_web(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = {
                "mobile/src/home.tsx": "import { a } from '../../frontend/src/rules';",
                "mobile/src/local.ts": "export * from './home';",
                "mobile/node_modules/pkg/index.js": "require('../../../frontend/src/never');",
                "frontend/src/rules.ts": "import type { T } from './types'; export const a = 1;",
                "frontend/src/types.ts": "export type T = number;",
                "frontend/src/unrelated.ts": "export const b = 2;",
            }
            for path, text in files.items():
                (root / path).parent.mkdir(parents=True, exist_ok=True)
                (root / path).write_text(text, encoding="utf-8")
            self.assertEqual(
                mobile_shared_files(root), {"frontend/src/rules.ts", "frontend/src/types.ts"}
            )
            self.assertTrue(select_paths(["frontend/src/types.ts"], root).mobile)
            self.assertFalse(select_paths(["frontend/src/unrelated.ts"], root).mobile)

            (root / "mobile/src/broken.ts").write_text(
                "import { x } from '../../frontend/src/gone';", encoding="utf-8"
            )
            with self.assertRaises(ValueError):
                mobile_shared_files(root)

    def test_shared_contract_and_unknown_paths_run_both(self):
        for path in (
            "backend/app/tracker.py",
            "backend/app/models.py",
            "backend/app/tracker_schemas.py",
            "backend/app/new_schemas.py",
            "frontend/src/api.ts",
            "frontend/src/types.ts",
        ):
            with self.subTest(path=path):
                selected = select_paths([path])
                self.assertEqual((selected.frontend, selected.backend), ("full", True))
        for path in (
            ".github/workflows/checks.yml",
            ".github/scripts/select_checks.py",
            ".env.example",
            "deploy/update.sh",
            "new-shared-config.json",
        ):
            with self.subTest(path=path):
                selected = select_paths([path])
                self.assertEqual(
                    (selected.frontend, selected.backend, selected.mobile), ("full", True, True)
                )

    def test_docs_and_empty_diff_need_neither_suite(self):
        for paths in (
            [],
            ["README.md", "AGENTS.md", "docs/guide.md", "docs/screenshots/final.gif"],
        ):
            with self.subTest(paths=paths):
                selected = select_paths(paths)
                self.assertEqual(
                    (selected.frontend, selected.backend, selected.mobile), ("none", False, False)
                )

    def test_mixed_changes_run_both(self):
        selected = select_paths(["frontend/vite.config.ts", "backend/app/cardio_energy.py"])
        self.assertEqual((selected.frontend, selected.backend), ("full", True))

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
                    self.assertEqual((selected.frontend, selected.backend), ("full", True))

    def test_main_release_push_and_manual_runs_are_full(self):
        selected = select_event("pull_request", {"pull_request": {"base": {"ref": "main"}}}, "")
        self.assertEqual(
            (selected.frontend, selected.backend, selected.mobile), ("full", True, True)
        )
        for name in ("push", "workflow_dispatch", "unexpected-event"):
            with self.subTest(event=name):
                selected = select_event(name, {}, "")
                self.assertEqual(
                    (selected.frontend, selected.backend, selected.mobile), ("full", True, True)
                )


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
        self.assertEqual(selected.frontend, "full")
        self.assertFalse(selected.backend)

    def test_cross_area_rename_includes_old_and_new_paths(self):
        git(self.root, "mv", "frontend/original.txt", "backend/moved.txt")
        event, merge = self.merge()
        selected = select_event("pull_request", event, merge, self.root)
        self.assertEqual((selected.frontend, selected.backend), ("full", True))

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
        self.assertEqual(selected.frontend, "full")
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
        self.assertEqual(selected.frontend, "full")
        self.assertFalse(selected.backend)

    def test_deleted_backend_file_is_not_skipped(self):
        git(self.root, "rm", "backend/helper.txt")
        event, merge = self.merge()
        selected = select_event("pull_request", event, merge, self.root)
        self.assertEqual(selected.frontend, "none")
        self.assertTrue(selected.backend)

    def test_no_three_hundred_file_truncation(self):
        for index in range(350):
            self.write(f"docs/{index}.md", "sample documentation")
        self.write("frontend/last.txt", "must not be overlooked")
        event, merge = self.merge()
        selected = select_event("pull_request", event, merge, self.root)
        self.assertEqual(selected.frontend, "full")
        self.assertFalse(selected.backend)

    def test_wrong_commit_or_event_parents_fail_closed(self):
        self.write("frontend/original.txt", "changed")
        event, merge = self.merge()
        with self.assertRaises(ValueError) as caught:
            select_event("pull_request", event, "a" * 40, self.root)
        # The failure names the commits involved so a mismatch can be diagnosed
        # from the CI log alone.
        message = str(caught.exception)
        for sha in ("a" * 40, merge, event["pull_request"]["head"]["sha"]):
            self.assertIn(sha, message)
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
        self.assertEqual(len(gates), 3)
        bash = "C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else shutil.which("bash")
        self.assertTrue(bash, "Bash is needed to verify the workflow's actual gate scripts")
        for gate, valid_flags in zip(
            gates,
            [("true", "false"), ("none", "styles", "related", "full"), ("true", "false")],
            strict=True,
        ):
            script = "\n".join(line[10:] for line in gate.splitlines())
            for result, flag, expected in (
                *(("success", flag, 0) for flag in valid_flags),
                ("failure", valid_flags[0], 1),
                ("cancelled", valid_flags[-1], 1),
                ("skipped", valid_flags[0], 1),
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

    def test_cli_writes_valid_outputs_for_full_runs(self):
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
            self.assertEqual(
                output.read_text(encoding="utf-8"), "frontend=full\nbackend=true\nmobile=true\n"
            )
            self.assertIn("Backend suite: run", summary.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
