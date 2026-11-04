"""Validate feature-owned notes and render explicitly selected release contributions.

This command never writes application metadata, release history or release notes.
The release coordinator reviews its output and assembles those files once.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
MEDIA_URL = re.compile(
    r"https://raw\.githubusercontent\.com/ejbolts/Relay/[0-9a-f]{40}/"
    r"docs/screenshots/releases/[A-Za-z0-9_.-]+\.(png|jpe?g|webp|gif)"
)
PRIVATE_URL = re.compile(
    r"https?://[^\s\"<>]*(?:\.ts\.net|\.tailscale\.com)"
    r"|https?://(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)",
    re.IGNORECASE,
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip()) and not re.search(r"[\r\n]", value)


def validate(fragment: object) -> dict:
    require(isinstance(fragment, dict), "fragment must be an object")
    require(
        not set(fragment) - {"title", "changes", "media", "mediaOmission"},
        "unknown fragment field",
    )
    require(text(fragment.get("title")), "title must be a nonempty single line")
    changes = fragment.get("changes")
    require(
        isinstance(changes, list) and bool(changes) and all(text(change) for change in changes),
        "changes must contain nonempty single lines",
    )
    require(len(changes) == len(set(changes)), "duplicate change")
    media = fragment.get("media", [])
    require(isinstance(media, list), "media must be an array")
    omission = fragment.get("mediaOmission")
    require(
        (bool(media) and omission is None) or (not media and text(omission)),
        "provide reviewed media or a mediaOmission reason, never both",
    )
    formats = set()
    urls = set()
    for item in media:
        require(isinstance(item, dict), "each media item must be an object")
        require(set(item) == {"title", "description", "image"}, "invalid media fields")
        require(
            text(item["title"]) and text(item["description"]), "media needs title and description"
        )
        image = item["image"]
        require(isinstance(image, dict) and set(image) == {"url", "alt"}, "invalid image fields")
        require(text(image["alt"]) and text(image["url"]), "image needs URL and alt text")
        match = MEDIA_URL.fullmatch(image["url"])
        require(bool(match), "media URL must pin a Relay release image/GIF to a full commit SHA")
        require(image["url"] not in urls, "duplicate media URL")
        urls.add(image["url"])
        formats.add("gif" if match.group(1) == "gif" else "screenshot")
    require(len(formats) <= 1, "one feature cannot mix screenshots and GIFs")
    require(not PRIVATE_URL.search(json.dumps(fragment)), "private installation URL in fragment")
    return fragment


def load_fragments(root: Path, slugs: list[str] | None = None) -> list[dict]:
    directory = root / "release-fragments"
    if slugs is None:
        slugs = sorted(path.stem for path in directory.glob("*.json"))
    require(len(slugs) == len(set(slugs)), "select each fragment only once")
    fragments = []
    for slug in slugs:
        require(bool(SLUG.fullmatch(slug)), f"invalid fragment slug: {slug}")
        path = directory / f"{slug}.json"
        require(not path.is_symlink(), f"fragment must not be a symlink: {slug}")
        try:
            fragment = validate(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError) as error:
            raise ValueError(f"{slug}: {error}") from error
        fragments.append(fragment)
    titles = [fragment["title"] for fragment in fragments]
    require(len(titles) == len(set(titles)), "selected features must have unique titles")
    return fragments


def render_json(fragments: list[dict]) -> str:
    contribution = {"changes": [change for fragment in fragments for change in fragment["changes"]]}
    highlights = [item for fragment in fragments for item in fragment.get("media", [])]
    if highlights:
        contribution["highlights"] = highlights
    return json.dumps(contribution, indent=2, ensure_ascii=False) + "\n"


def render_markdown(fragments: list[dict]) -> str:
    blocks = []
    for fragment in fragments:
        for item in fragment.get("media", []):
            image = item["image"]
            # Escape syntax characters without changing the supplied accessible text.
            alt = image["alt"].replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")
            blocks.extend(
                [f"![{alt}]({image['url']})", f"**{item['title']}** — {item['description']}"]
            )
    for fragment in fragments:
        if reason := fragment.get("mediaOmission"):
            blocks.append(f"Media omitted for {fragment['title']}: {reason}")
    changes = [f"- {change}" for fragment in fragments for change in fragment["changes"]]
    return "\n\n".join([*blocks, "\n".join(changes)]) + "\n"


def main(argv: list[str] | None = None, *, root: Path = ROOT) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check", help="validate all pending fragments (also checked by pytest)")
    render = commands.add_parser(
        "render", help="render selected contributions to stdout, in given order"
    )
    render.add_argument("slugs", nargs="+", help="explicit fragment filenames without .json")
    render.add_argument("--format", choices=["markdown", "json"], default="markdown")
    args = parser.parse_args(argv)
    try:
        fragments = load_fragments(root, args.slugs if args.command == "render" else None)
        if args.command == "check":
            print(f"Validated {len(fragments)} pending release fragment(s).")
        else:
            print(
                render_json(fragments) if args.format == "json" else render_markdown(fragments),
                end="",
            )
    except ValueError as error:
        print(f"Release fragments: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    # Windows pipes can otherwise default to a legacy encoding that loses release text.
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
