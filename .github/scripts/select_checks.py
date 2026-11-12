"""Select CI suites from the exact PR merge tree; never trust labels to skip tests."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"[0-9a-f]{40,64}")
DOC_FILES = {"README.md", "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md", "LICENSE", "LICENSE.md"}
# Changes to route, serialization, persistence or frontend-serving boundaries can
# affect both clients. A repository test below guards new APIRouter modules.
CONTRACT_MODULES = {
    "accounts.py",
    "admin.py",
    "client_versions.py",
    "feedback.py",
    "frontend.py",
    "home_layout.py",
    "machine_settings.py",
    "main.py",
    "models.py",
    "presence.py",
    "routines.py",
    "session_events.py",
    "sharing.py",
    "tracker.py",
    "training_blocks.py",
    "weight_mapping.py",
    "workout_type_exercises.py",
    "youtube_connections.py",
}


@dataclass(frozen=True)
class Selection:
    frontend: bool
    backend: bool
    reason: str


def select_paths(paths: list[str]) -> Selection:
    frontend = backend = False
    for path in paths:
        if not path or path.startswith("/") or ".." in path.split("/"):
            raise ValueError("Invalid changed-file path")
        if path in DOC_FILES or path.startswith("docs/"):
            continue
        if path in {"frontend/src/api.ts", "frontend/src/types.ts"} or (
            path.startswith("backend/app/")
            and (path.rsplit("/", 1)[-1] in CONTRACT_MODULES or path.endswith("schemas.py"))
        ):
            frontend = backend = True
        elif path.startswith("frontend/"):
            frontend = True
        elif path.startswith("backend/") or path in {"pyproject.toml", "alembic.ini"}:
            backend = True
        else:
            # CI, deployment, shared configuration and unknown paths are conservative.
            frontend = backend = True
    return Selection(frontend, backend, "Selected from changed files in the tested PR merge.")


def git(root: Path, *args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True).stdout


def select_event(event_name: str, event: dict, merge_sha: str, root: Path = ROOT) -> Selection:
    if event_name != "pull_request":
        return Selection(True, True, "Push, manual or other verification runs both suites.")
    pr = event["pull_request"]
    base_ref = pr["base"]["ref"]
    if not isinstance(base_ref, str) or not base_ref:
        raise ValueError("PR base branch is missing")
    if base_ref == "main":
        return Selection(True, True, "PRs into main verify the complete release with both suites.")
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
    return select_paths([os.fsdecode(name) for name in names.split(b"\0") if name])


def main() -> int:
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        selected = select_event(os.environ["GITHUB_EVENT_NAME"], event, os.getenv("GITHUB_SHA", ""))
        output = (
            f"frontend={str(selected.frontend).lower()}\nbackend={str(selected.backend).lower()}\n"
        )
        # Publish outputs only after all detection/validation has succeeded.
        with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as handle:
            handle.write(output)
        summary = (
            f"{selected.reason}\n\n"
            f"Frontend suite: {'run' if selected.frontend else 'not needed'}.\n"
            f"Backend suite: {'run' if selected.backend else 'not needed'}.\n"
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
