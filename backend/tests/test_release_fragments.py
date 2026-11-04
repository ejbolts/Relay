from __future__ import annotations

import copy
import json
import os
import shutil
import subprocess
import sys

import pytest
from backend.tools.release_fragments import (
    ROOT,
    load_fragments,
    main,
    render_json,
    render_markdown,
    validate,
)


def feature(title="Machine trends", extension="gif"):
    return {
        "title": title,
        "changes": [f"**{title}:** Compare sessions by machine."],
        "media": [
            {
                "title": title,
                "description": "Select a machine and inspect its sessions. Isolated sample data.",
                "image": {
                    "url": "https://raw.githubusercontent.com/ejbolts/Relay/"
                    + "a" * 40
                    + f"/docs/screenshots/releases/1.2.0-machine-trends.{extension}",
                    "alt": "Machine [A] selected with sample sessions.",
                },
            }
        ],
    }


def save(root, slug, fragment):
    directory = root / "release-fragments"
    directory.mkdir(exist_ok=True)
    (directory / f"{slug}.json").write_text(json.dumps(fragment), encoding="utf-8")


def test_pending_repository_fragments_are_valid():
    load_fragments(ROOT)


def test_explicit_selection_preserves_order_and_excludes_unselected_work(tmp_path):
    save(tmp_path, "machine-trends", feature())
    save(tmp_path, "profile-photo", feature("Profile photo", "png"))
    save(tmp_path, "unfinished", {"title": "Not ready"})
    selected = load_fragments(tmp_path, ["profile-photo", "machine-trends"])
    result = json.loads(render_json(selected))
    assert result["changes"] == [
        "**Profile photo:** Compare sessions by machine.",
        "**Machine trends:** Compare sessions by machine.",
    ]
    assert result["highlights"][0] == feature("Profile photo", "png")["media"][0]
    markdown = render_markdown(selected)
    assert markdown.index(".png)") < markdown.index(".gif)") < markdown.index("- **")
    assert "Machine \\[A\\]" in markdown
    assert "Not ready" not in markdown
    assert render_markdown(selected) == markdown


def test_non_ui_fragment_records_omission_without_invalid_empty_highlights():
    fragment = validate(
        {
            "title": "Recovery",
            "changes": ["Safer retry handling."],
            "mediaOmission": "No visible UI.",
        }
    )
    assert json.loads(render_json([fragment])) == {"changes": ["Safer retry handling."]}
    assert "No visible UI." in render_markdown([fragment])


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda f: f.update(title=""), "title"),
        (lambda f: f.update(changes=[]), "changes"),
        (lambda f: f.update(changes=["One\nTwo"]), "single lines"),
        (lambda f: f.update(changes=["One\rTwo"]), "single lines"),
        (lambda f: f.update(changes=["Same", "Same"]), "duplicate change"),
        (lambda f: f.update(version="1.2.0"), "unknown"),
        (lambda f: f.update(media=[]), "mediaOmission"),
        (lambda f: f.update(mediaOmission="No UI"), "never both"),
        (lambda f: f["media"][0]["image"].update(alt=""), "alt text"),
        (
            lambda f: f["media"][0]["image"].update(
                url=f["media"][0]["image"]["url"].replace("a" * 40, "main")
            ),
            "full commit SHA",
        ),
        (lambda f: f["media"].append(copy.deepcopy(f["media"][0])), "duplicate media"),
        (lambda f: f["media"].append(feature(extension="png")["media"][0]), "cannot mix"),
        (lambda f: f.update(changes=["See https://" + "synthetic." + "ts.net/"]), "private"),
        (
            lambda f: f.update(changes=["See http://" + ".".join(["192", "168", "1", "10"])]),
            "private",
        ),
    ],
)
def test_invalid_fragments_fail_before_rendering(mutate, message):
    fragment = feature()
    mutate(fragment)
    with pytest.raises(ValueError, match=message):
        validate(fragment)


@pytest.mark.parametrize("slugs", [["../secret"], ["a", "a"], ["missing"]])
def test_invalid_selection_is_rejected(tmp_path, slugs):
    with pytest.raises(ValueError):
        load_fragments(tmp_path, slugs)


def test_check_ignores_archived_and_example_fragments(tmp_path):
    save(tmp_path, "current", feature())
    for directory in ["archive/1.1.0", "examples"]:
        target = tmp_path / "release-fragments" / directory
        target.mkdir(parents=True)
        (target / "old.json").write_text("{}", encoding="utf-8")
    assert len(load_fragments(tmp_path)) == 1


def test_cli_failure_has_context_and_no_partial_output(tmp_path, capsys):
    save(tmp_path, "good", feature())
    save(tmp_path, "broken", {"title": "Missing changes"})
    assert main(["render", "good", "broken"], root=tmp_path) == 1
    captured = capsys.readouterr()
    assert not captured.out
    assert "broken:" in captured.err


def test_cli_is_read_only_and_does_not_change_release_files(tmp_path, capsys):
    save(tmp_path, "machine-trends", feature())
    release = tmp_path / "frontend" / "release.json"
    release.parent.mkdir()
    release.write_text('{"version":"1.2.0"}', encoding="utf-8")
    before = {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    assert main(["render", "machine-trends", "--format", "json"], root=tmp_path) == 0
    assert json.loads(capsys.readouterr().out)["changes"]
    assert main(["check"], root=tmp_path) == 0
    after = {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    assert before == after


def test_duplicate_feature_titles_require_reconciliation(tmp_path):
    save(tmp_path, "first", feature())
    save(tmp_path, "second", feature())
    with pytest.raises(ValueError, match="unique titles"):
        load_fragments(tmp_path)


@pytest.mark.parametrize("output_format", ["json", "markdown"])
def test_standalone_cli_preserves_unicode_on_legacy_pipes(tmp_path, output_format):
    script = tmp_path / "backend" / "tools" / "release_fragments.py"
    script.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / "backend" / "tools" / "release_fragments.py", script)
    save(tmp_path, "machine-trends", feature("Machine trends → 💪"))
    result = subprocess.run(
        [sys.executable, str(script), "render", "machine-trends", "--format", output_format],
        env={**os.environ, "PYTHONIOENCODING": "ascii"},
        capture_output=True,
        check=True,
    )
    output = result.stdout.decode("utf-8")
    assert "Machine trends → 💪" in output
    assert not result.stderr
    if output_format == "json":
        assert json.loads(output)["highlights"]
