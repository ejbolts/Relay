"""Generate editable SVG book-themed app icon concepts and a comparison sheet."""

from pathlib import Path
from xml.sax.saxutils import escape


OUT = Path(__file__).parent
BG = "#121516"
CARD = "#191c1e"
WHITE = "#f2f0ed"
BLUE = "#158fd0"
BRIGHT = "#28acef"
MUTED = "#aab9bd"


concepts = [
    (
        "A",
        "Open book + barbell",
        "The most direct gym log symbol",
        "open-barbell",
        f'''<path d="M17 33c17-5 33-2 47 8v67C49 98 33 95 17 99Z" fill="{WHITE}"/>
<path d="M111 33c-17-5-33-2-47 8v67c15-10 31-13 47-9Z" fill="{WHITE}"/>
<path d="M64 41v67" stroke="{BLUE}" stroke-width="5"/>
<path d="M30 53c10-1 18 1 26 5M72 58c8-4 16-6 26-5" fill="none" stroke="{BG}" stroke-width="3" stroke-linecap="round" opacity=".65"/>
<rect x="31" y="69" width="66" height="8" rx="4" fill="{BLUE}"/>
<rect x="24" y="61" width="9" height="24" rx="3" fill="{BG}"/>
<rect x="19" y="65" width="5" height="16" rx="2" fill="{BLUE}"/>
<rect x="95" y="61" width="9" height="24" rx="3" fill="{BG}"/>
<rect x="104" y="65" width="5" height="16" rx="2" fill="{BLUE}"/>''',
    ),
    (
        "B",
        "Hardback logbook",
        "A simple, bold journal cover",
        "hardback-log",
        f'''<rect x="25" y="17" width="78" height="94" rx="10" fill="{WHITE}"/>
<path d="M38 17v94" stroke="{BLUE}" stroke-width="12"/>
<path d="M45 24h48a3 3 0 0 1 3 3v74a3 3 0 0 1-3 3H45Z" fill="{BG}"/>
<path d="M57 42h27M57 50h20" stroke="{MUTED}" stroke-width="4" stroke-linecap="round"/>
<path d="M59 73h24" stroke="{BLUE}" stroke-width="7" stroke-linecap="round"/>
<rect x="50" y="61" width="9" height="24" rx="3" fill="{WHITE}"/>
<rect x="83" y="61" width="9" height="24" rx="3" fill="{WHITE}"/>
<path d="M51 111h47" stroke="{BG}" stroke-width="3" opacity=".65"/>''',
    ),
    (
        "C",
        "Video playbook",
        "A book with a clear video cue",
        "video-playbook",
        f'''<path d="M19 31c15-4 31-2 45 7v68c-14-9-30-11-45-8Z" fill="none" stroke="{WHITE}" stroke-width="8" stroke-linejoin="round"/>
<path d="M109 31c-15-4-31-2-45 7v68c14-9 30-11 45-8Z" fill="none" stroke="{WHITE}" stroke-width="8" stroke-linejoin="round"/>
<path d="M64 38v68" stroke="{BLUE}" stroke-width="5"/>
<path d="M33 48c9-1 16 1 22 4M73 52c6-3 13-5 22-4" fill="none" stroke="{MUTED}" stroke-width="4" stroke-linecap="round"/>
<circle cx="64" cy="72" r="23" fill="{BG}" stroke="{WHITE}" stroke-width="4"/>
<path d="M58 58v28l22-14Z" fill="{BLUE}"/>''',
    ),
    (
        "D",
        "Spiral training diary",
        "A friendly notebook with set rows",
        "spiral-diary",
        f'''<rect x="29" y="17" width="76" height="94" rx="8" fill="{WHITE}"/>
<rect x="40" y="25" width="57" height="78" rx="3" fill="{BG}"/>
<path d="M28 32h15M28 47h15M28 62h15M28 77h15M28 92h15" stroke="{BLUE}" stroke-width="6" stroke-linecap="round"/>
<path d="M55 43h30M55 55h22M55 83h30M55 94h22" stroke="{MUTED}" stroke-width="4" stroke-linecap="round"/>
<path d="m53 68 8 8 17-18" fill="none" stroke="{BRIGHT}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>''',
    ),
    (
        "E",
        "Progress pages",
        "The book becomes a training chart",
        "progress-pages",
        f'''<path d="M17 32c17-5 33-2 47 8v67C49 97 33 95 17 99Z" fill="{WHITE}"/>
<path d="M111 32c-17-5-33-2-47 8v67c15-10 31-12 47-8Z" fill="{WHITE}"/>
<path d="M64 40v67" stroke="{BG}" stroke-width="4"/>
<path d="M29 82 45 69 58 74 73 57 87 62 101 44" fill="none" stroke="{BLUE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
<path d="m89 44 12 0 0 12" fill="none" stroke="{BLUE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>''',
    ),
    (
        "F",
        "Video journal",
        "A compact book and camera mark",
        "video-journal",
        f'''<path d="M29 19h63a9 9 0 0 1 9 9v79H38a9 9 0 0 1-9-9Z" fill="{WHITE}"/>
<path d="M42 19v87" stroke="{BLUE}" stroke-width="11"/>
<rect x="50" y="31" width="42" height="58" rx="6" fill="{BG}"/>
<rect x="53" y="48" width="29" height="26" rx="5" fill="{BLUE}"/>
<path d="m81 54 11-6v26l-11-6Z" fill="{BLUE}"/>
<circle cx="68" cy="61" r="6" fill="{WHITE}"/>
<path d="M51 95h41" stroke="{BG}" stroke-width="4" stroke-linecap="round"/>''',
    ),
]


def svg_icon(mark: str, title: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="{escape(title)}">
  <rect width="128" height="128" rx="24" fill="{BG}"/>
  {mark}
</svg>
'''


for _, title, _, slug, mark in concepts:
    (OUT / f"app-icon-book-{slug}.svg").write_text(svg_icon(mark, title), encoding="utf-8")


sheet = [
    f'''<svg xmlns="http://www.w3.org/2000/svg" width="1470" height="890" viewBox="0 0 1470 890">
<rect width="1470" height="890" fill="#101314"/>
<style>
text {{ font-family: 'Segoe UI', Arial, sans-serif; }}
.title {{ fill:{WHITE}; font-size:38px; font-weight:600; }}
.subtitle {{ fill:{MUTED}; font-size:19px; }}
.name {{ fill:{WHITE}; font-size:23px; font-weight:600; }}
.description {{ fill:{MUTED}; font-size:17px; }}
.letter {{ fill:{BRIGHT}; font-size:24px; font-weight:700; }}
.size {{ fill:{MUTED}; font-size:15px; }}
</style>
<text class="title" x="48" y="61">Gym Logger — book icon directions</text>
<text class="subtitle" x="49" y="91">Same charcoal, white and blue palette · actual 32 px and 64 px samples</text>
'''
]


for index, (letter, title, description, slug, mark) in enumerate(concepts):
    col, row = index % 3, index // 3
    x, y = 46 + col * 476, 126 + row * 370
    sheet.append(
        f'''<g transform="translate({x} {y})">
  <rect width="434" height="337" fill="{CARD}" stroke="#3b4144" stroke-width="2"/>
  <text class="letter" x="22" y="42">{letter}</text>
  <text class="name" x="58" y="42">{escape(title)}</text>
  <text class="description" x="23" y="73">{escape(description)}</text>
  <g transform="translate(32 100) scale(1.55)"><rect width="128" height="128" rx="24" fill="{BG}"/>{mark}</g>
  <text class="size" x="275" y="134">32 px</text>
  <g transform="translate(275 145) scale(.25)"><rect width="128" height="128" rx="24" fill="{BG}"/>{mark}</g>
  <text class="size" x="274" y="232">64 px</text>
  <g transform="translate(274 242) scale(.5)"><rect width="128" height="128" rx="24" fill="{BG}"/>{mark}</g>
</g>'''
    )

sheet.append("</svg>\n")
(OUT / "app-icon-book-concepts.svg").write_text("\n".join(sheet), encoding="utf-8")
