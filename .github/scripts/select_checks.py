"""Select CI suites from the exact PR merge tree; never trust labels to skip tests."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"[0-9a-f]{40,64}")
DOC_FILES = {"README.md", "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md", "LICENSE", "LICENSE.md"}
# Changes to route, serialization, persistence or frontend-serving boundaries can
# affect both clients. A repository test below guards new APIRouter modules.
CONTRACT_MODULES = {
    "account_archive.py",
    "app_links.py",
    "app_notices.py",
    "accounts.py",
    "admin.py",
    "client_versions.py",
    "feedback.py",
    "frontend.py",
    "home_layout.py",
    "machine_settings.py",
    "main.py",
    "models.py",
    "password_reset_requests.py",
    "presence.py",
    "routines.py",
    "session_events.py",
    "sharing.py",
    "tracker.py",
    "training_blocks.py",
    "username_reminder_requests.py",
    "weight_mapping.py",
    "workout_type_exercises.py",
    "youtube_connections.py",
}
# Comments can quote module paths ("Alex" from "Alex Morgan", or from './old'), so they are
# removed before a file's imports are read.
COMMENTS = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)
# import ... from 'x', export ... from 'x', import 'x', import('x') and require('x').
MODULE_SPECIFIER = re.compile(
    r"""(?:\b(?:import|export)\b[^'";]*?\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"]+)\1"""
)
MOBILE_SOURCES = {".ts", ".tsx", ".js", ".jsx"}
MOBILE_SKIPPED_DIRS = {"node_modules", ".expo", "dist", "coverage", "ios", "android"}


def module_specifiers(text: str) -> list[str]:
    """The modules a TypeScript or JavaScript file imports, ignoring comments."""
    return [match.group(2) for match in MODULE_SPECIFIER.finditer(COMMENTS.sub("", text))]


def mobile_shared_files(root: Path = ROOT) -> frozenset[str]:
    """Files outside mobile/ that the app imports, directly or through each other.

    The app shares the web's plain TypeScript rules (frontend/src), so a change to one of them
    can break it. Computed from the tested checkout, so a new shared import never needs a list
    updated and can't skip the mobile checks. An import that can't be resolved fails detection.
    """
    root = root.resolve()
    mobile = root / "mobile"
    pending: list[Path] = []
    for folder, dirs, files in os.walk(mobile):
        dirs[:] = [name for name in dirs if name not in MOBILE_SKIPPED_DIRS]
        pending += [Path(folder) / name for name in files if Path(name).suffix in MOBILE_SOURCES]
    seen: set[Path] = set()
    shared: set[str] = set()
    while pending:
        source = pending.pop()
        if source in seen:
            continue
        seen.add(source)
        for specifier in module_specifiers(source.read_text(encoding="utf-8")):
            if not specifier.startswith("."):
                continue
            base = (source.parent / specifier).resolve()
            if base.is_relative_to(mobile):
                continue
            candidates = [base, *(base.with_name(base.name + ext) for ext in (".ts", ".tsx"))]
            target = next((path for path in candidates if path.is_file()), None)
            if target is None or not target.is_relative_to(root):
                raise ValueError(f"Cannot resolve {specifier} imported by {source}")
            shared.add(target.relative_to(root).as_posix())
            # Images and JSON a shared module imports are shared too, but import nothing.
            if target.suffix in MOBILE_SOURCES:
                pending.append(target)
    return frozenset(shared)


FrontendScope = Literal["none", "styles", "related", "full"]


@dataclass(frozen=True)
class Selection:
    frontend: FrontendScope
    backend: bool
    mobile: bool
    reason: str


def select_paths(paths: list[str], root: Path = ROOT) -> Selection:
    frontend_paths = set()
    backend = mobile = False
    full_frontend = False
    shared: frozenset[str] | None = None
    for path in paths:
        if not path or path.startswith("/") or ".." in path.split("/"):
            raise ValueError("Invalid changed-file path")
        if path in DOC_FILES or path.startswith("docs/"):
            continue
        if path.startswith("frontend/"):
            if shared is None:
                shared = mobile_shared_files(root)
            if path in shared:
                mobile = True
        if path.startswith("mobile/"):
            mobile = True
        elif path in {"frontend/src/api.ts", "frontend/src/types.ts"} or (
            path.startswith("backend/app/")
            and (path.rsplit("/", 1)[-1] in CONTRACT_MODULES or path.endswith("schemas.py"))
        ):
            full_frontend = backend = True
        elif path.startswith("frontend/"):
            frontend_paths.add(path)
        elif path.startswith("backend/") or path in {"pyproject.toml", "alembic.ini"}:
            backend = True
        else:
            # CI, deployment, shared configuration and unknown paths are conservative.
            full_frontend = backend = mobile = True
    mode = "full" if full_frontend else frontend_scope(frontend_paths, root)
    return Selection(mode, backend, mobile, "Selected from changed files in the tested PR merge.")


def frontend_scope(paths: set[str], root: Path) -> FrontendScope:
    if not paths:
        return "none"
    # Deleted/renamed sources can no longer be traced in the current import graph.
    if any(not (root / path).is_file() or (root / path).is_symlink() for path in paths):
        return "full"
    code = {path for path in paths if not re.fullmatch(r"frontend/src/[\w-]+\.css", path)}
    if not code:
        return "styles"
    # Only narrow code changes with an explicit changed test for every module.
    # Vitest also selects other suites that import the changed sources.
    for path in code:
        if re.fullmatch(r"frontend/src/[\w.-]+\.test\.tsx?", path, re.ASCII):
            continue
        if not re.fullmatch(r"frontend/src/[\w-]+\.tsx?", path, re.ASCII):
            return "full"
        stem = path.rsplit(".", 1)[0]
        if not {f"{stem}.test.ts", f"{stem}.test.tsx"} & code:
            return "full"
    return "related"


def git(root: Path, *args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True).stdout


def select_event(event_name: str, event: dict, merge_sha: str, root: Path = ROOT) -> Selection:
    if event_name != "pull_request":
        return Selection("full", True, True, "Push, manual or other verification runs both suites.")
    pr = event["pull_request"]
    base_ref = pr["base"]["ref"]
    if not isinstance(base_ref, str) or not base_ref:
        raise ValueError("PR base branch is missing")
    if base_ref == "main":
        return Selection(
            "full", True, True, "PRs into main verify the complete release with every suite."
        )
    base, head = pr["base"]["sha"], pr["head"]["sha"]
    if not all(isinstance(sha, str) and SHA.fullmatch(sha) for sha in (base, head, merge_sha)):
        raise ValueError("PR commit identifiers are invalid")
    actual = git(root, "rev-parse", "HEAD").decode().strip()
    parents = git(root, "show", "-s", "--format=%P", "HEAD").decode().split()
    if actual != merge_sha or len(parents) != 2 or parents[1] != head or parents[0] == head:
        raise ValueError(
            "Checkout does not match the event's PR merge and parents: "
            f"expected merge {merge_sha} with head parent {head} "
            f"(event base {base}); checked out {actual} "
            f"with parents {' '.join(parents) or 'none'}"
        )
    # The event's base SHA can lag behind the base branch tip that GitHub merged
    # into the tested commit, so compare against the merge's actual base parent.
    tested_base = parents[0]
    # The depth-two checkout contains the merge and both parents. Comparing its
    # base parent with the tested tree avoids API pagination/file-count limits,
    # unrelated base-branch changes and the need to download all repository history.
    # Disable rename detection so both sides of a cross-area move are considered.
    names = git(root, "diff", "--name-only", "--no-renames", "-z", tested_base, actual, "--")
    if names and not names.endswith(b"\0"):
        raise ValueError("Incomplete changed-file output")
    return select_paths([os.fsdecode(name) for name in names.split(b"\0") if name], root)


def main() -> int:
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        selected = select_event(os.environ["GITHUB_EVENT_NAME"], event, os.getenv("GITHUB_SHA", ""))
        output = (
            f"frontend={selected.frontend}\n"
            f"backend={str(selected.backend).lower()}\n"
            f"mobile={str(selected.mobile).lower()}\n"
        )
        # Publish outputs only after all detection/validation has succeeded.
        with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as handle:
            handle.write(output)
        summary = (
            f"{selected.reason}\n\n"
            f"Frontend scope: {selected.frontend}.\n"
            f"Backend suite: {'run' if selected.backend else 'not needed'}.\n"
            f"Mobile checks: {'run' if selected.mobile else 'not needed'}.\n"
        )
        if summary_path := os.getenv("GITHUB_STEP_SUMMARY"):
            with Path(summary_path).open("a", encoding="utf-8") as handle:
                handle.write(summary)
        print(summary)
    except (KeyError, OSError, ValueError, TypeError, subprocess.CalledProcessError) as error:
        print(f"Change detection failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
