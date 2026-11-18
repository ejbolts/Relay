import type { ReactNode } from 'react';
import { C, around, at, flame, leaf, round, star } from './profileBorderGeometry';

/**
 * How each profile border looks. Every border is a frame in the style of a game rank border:
 * a bevelled ring in the border's colours, a crest medallion on top carrying its emblem, wings or
 * flames at the sides, and gems, a tier banner and a glow as it gets rarer. The frame's grade
 * follows the border's rarity, so a family's later tiers are visibly grander.
 *
 * The server owns a border's name and challenge; this file only knows how to draw its key, so a
 * key it has never seen leaves the photo plain. Drawings use a 120-unit box around the photo,
 * whose edge is the circle of radius 50 at the centre; ornaments reach out to about 70.
 */

/** 1 common, 2 rare, 3 epic, 4 legendary. */
type Grade = 1 | 2 | 3 | 4;
type Sides = 'feather' | 'flame' | 'crystal' | 'laurel';

interface Palette {
  deep: string;
  base: string;
  light: string;
  accent: string;
  glow: string;
}

interface Spec {
  grade: Grade;
  palette: Palette;
  glyph: keyof typeof GLYPHS;
  sides?: Sides;
  detail?: Detail;
  /** A tier in a family, shown on the banner. */
  tier?: number;
}

type Detail = (id: string, spec: Spec) => ReactNode;

const RING = 54;
const OUTLINE = '#070a12';
const WIDTH = [7, 7.8, 8.6, 9.4];

/** Trim metal by grade: forged iron, silver, gold, and radiant gold. */
const TRIM = [
  ['#e7e5e4', '#857a70', '#3a332d'],
  ['#ffffff', '#b6c2d1', '#4e5b6c'],
  ['#fff6d5', '#f2b10e', '#7c4f05'],
  ['#ffffff', '#ffd86b', '#b26b06'],
] as const;

/** Emblems for the crest, drawn as strokes in a 24-unit box like the app's icons. */
const GLYPHS = {
  lock: { d: 'M7.5 11V8a4.5 4.5 0 0 1 9 0v3M6.5 11h11v9h-11zM12 14.5v2' },
  flame: {
    d: 'M12 2.8c.8 3.6 5.4 5.6 5.4 10.4a5.4 5.4 0 0 1-10.8 0c0-2.6 1.6-4.2 2.6-5.2 0 2.2 1 3.2 2.1 3.2-1-3.2.1-6.2.7-8.4z',
  },
  infinity: {
    d: 'M12 12c-1.6-2.1-3.1-3.6-5-3.6a3.6 3.6 0 0 0 0 7.2c1.9 0 3.4-1.5 5-3.6zm0 0c1.6 2.1 3.1 3.6 5 3.6a3.6 3.6 0 0 0 0-7.2c-1.9 0-3.4 1.5-5 3.6z',
  },
  shield: { d: 'M12 3l7 3v5.5c0 4.6-3 8.1-7 9.5-4-1.4-7-4.9-7-9.5V6zM12 8v8M8.5 11.5h7' },
  helmet: { d: 'M5 15a7 7 0 0 1 14 0v4h-3.5v-4h-7v4H5zM12 8V3.5M8 4.5h8' },
  swords: { d: 'M4.5 4.5l10 10M19.5 4.5l-10 10M7 15l2 2M17 15l-2 2M4 20l3.5-3.5M20 20l-3.5-3.5' },
  whale: {
    d: 'M12 21v-7.5M12 13.5C10 9.3 6.2 8.2 3 9c2 2.3 5 4.5 9 4.5zm0 0c2-4.2 5.8-5.3 9-4.5-2 2.3-5 4.5-9 4.5z',
  },
  diamond: { d: 'M7 4.5h10l4 4.8-9 10.7L3 9.3zM3 9.3h18M9.2 4.5L12 9.3l2.8-4.8M12 9.3V20' },
  bench: { d: 'M2.5 7h19M5 4v6M19 4v6M7.2 5v4M16.8 5v4M6 15h12M8.5 15v5M15.5 15v5' },
  rack: { d: 'M6 3v18M18 3v18M2.5 9h19M8.5 7v4M15.5 7v4M3.5 21h5M15.5 21h5' },
  bentbar: { d: 'M2.5 9.5q9.5 5 19 0M5 6.5v8M19 6.5v8M7.3 7.5v6.5M16.7 7.5v6.5' },
  lights: {
    d: 'M6.5 12m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M12 12m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M17.5 12m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M5 18.5h14',
  },
  trophy: {
    d: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5.5a3 3 0 0 0 3 4M16 6h2.5a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z',
  },
  heart: {
    d: 'M20 6a4.8 4.8 0 0 0-6.8 0L12 7.3 10.8 6A4.8 4.8 0 0 0 4 12.8L12 20.5l8-7.7A4.8 4.8 0 0 0 20 6zM6.5 12.5h3l1.3-2.6 2.4 5 1.3-2.4h3',
  },
  steps: {
    d: 'M8.5 3.5c1.9 0 2.9 1.9 2.9 4.8s-1 4.6-2.9 4.6-2.9-1.7-2.9-4.6 1-4.8 2.9-4.8zM15.5 10.5c1.6 0 2.5 1.6 2.5 4s-.9 4-2.5 4-2.5-1.6-2.5-4 .9-4 2.5-4zM7 15.2h3M14 20.5h3',
  },
  seven: { text: '7' },
  calendar: { d: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4M8 14l2.2 3L12 14l1.8 3 2.2-3' },
  sunrise: {
    d: 'M3 17.5h18M7 17.5a5 5 0 0 1 10 0M12 6v3.2M5.6 9.6l2.1 2.1M18.4 9.6l-2.1 2.1M3 14h2.4M18.6 14H21M8 21h8',
  },
  moon: {
    d: 'M19.5 14.5A7.8 7.8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10zM17 4l.6 1.4L19 6l-1.4.6L17 8l-.6-1.4L15 6l1.4-.6z',
  },
  anvil: {
    d: 'M3.5 7h13c0 2.8 2 4 4 4-2 0-4 1-5 3H9c-1-2-3-3-5.5-3zM10 14v3M14 14v3M7 20.5h10l-2-3.5H9z',
  },
  seasons: {
    d: 'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2',
  },
  hourglass: {
    d: 'M6 3h12M6 21h12M7.5 3c0 5.2 9 6 9 9s-9 3.8-9 9M16.5 3c0 5.2-9 6-9 9s9 3.8 9 9M9.5 18.5h5',
  },
  scales: {
    d: 'M12 4v16M8 20.5h8M4.5 7.5h15M6.5 7.5L3.5 14h6zM17.5 7.5L14.5 14h6zM12 4l-1.5-1M12 4l1.5-1',
  },
  stars: {
    d: 'M12 3l1.6 3.4 3.7.5-2.7 2.6.6 3.7L12 11.4l-3.3 1.8.7-3.7-2.7-2.6 3.7-.5zM5.5 13.5l.9 1.9 2 .3-1.5 1.4.4 2.1-1.8-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3zM18.5 13.5l.9 1.9 2.1.3-1.5 1.4.3 2.1-1.8-1-1.8 1 .3-2.1-1.5-1.4 2.1-.3z',
  },
  medal: {
    d: 'M8 3l4 6.2L16 3M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 12.3v5.4M10.4 13.6L12 12.3',
  },
  bolt: { d: 'M13.5 2.5L5 14h6.2l-1.2 7.5L19 10h-6.2z' },
  mountain: {
    d: 'M2.5 20l6.5-11 4 6.5 2.5-3.5 6 8zM9 9l1.6 3 1.9-1.4M18 4l.6 1.4L20 6l-1.4.6L18 8l-.6-1.4L16 6l1.4-.6z',
  },
} as const satisfies Record<string, { d: string } | { text: string }>;

function defs(id: string, spec: Spec) {
  const { palette, grade } = spec;
  const trim = TRIM[grade - 1];
  return (
    <defs>
      <linearGradient
        id={`${id}body`}
        gradientUnits="userSpaceOnUse"
        x1={8}
        y1={0}
        x2={112}
        y2={120}
      >
        <stop offset={0} stopColor={palette.light} />
        <stop offset={0.24} stopColor={palette.base} />
        <stop offset={0.52} stopColor={palette.deep} />
        <stop offset={0.78} stopColor={palette.base} />
        <stop offset={1} stopColor={palette.light} />
      </linearGradient>
      <linearGradient
        id={`${id}trim`}
        gradientUnits="userSpaceOnUse"
        x1={0}
        y1={6}
        x2={120}
        y2={114}
      >
        <stop offset={0} stopColor={trim[0]} />
        <stop offset={0.3} stopColor={trim[1]} />
        <stop offset={0.55} stopColor={trim[2]} />
        <stop offset={0.8} stopColor={trim[1]} />
        <stop offset={1} stopColor={trim[0]} />
      </linearGradient>
      <radialGradient id={`${id}gem`} cx={0.35} cy={0.3} r={0.9}>
        <stop offset={0} stopColor="#ffffff" />
        <stop offset={0.35} stopColor={palette.accent} />
        <stop offset={1} stopColor={palette.deep} />
      </radialGradient>
      <radialGradient id={`${id}glow`} gradientUnits="userSpaceOnUse" cx={C} cy={C} r={76}>
        <stop offset={0.6} stopColor={palette.glow} stopOpacity={0} />
        <stop offset={0.73} stopColor={palette.glow} stopOpacity={grade === 4 ? 0.75 : 0.5} />
        <stop offset={1} stopColor={palette.glow} stopOpacity={0} />
      </radialGradient>
      <radialGradient id={`${id}fire`} gradientUnits="userSpaceOnUse" cx={C} cy={C} r={74}>
        <stop offset={0.68} stopColor={palette.base} />
        <stop offset={0.84} stopColor={palette.accent} />
        <stop offset={1} stopColor="#fffbea" />
      </radialGradient>
    </defs>
  );
}

const ringWidth = (spec: Spec) => WIDTH[spec.grade - 1];

/** The bevelled ring: an outline, the body metal and a highlight on each edge. */
function ring(id: string, spec: Spec) {
  const w = ringWidth(spec);
  return (
    <>
      <circle cx={C} cy={C} r={RING} fill="none" stroke={OUTLINE} strokeWidth={w + 2.8} />
      <circle cx={C} cy={C} r={RING} fill="none" stroke={`url(#${id}body)`} strokeWidth={w} />
      <circle
        cx={C}
        cy={C}
        r={RING - w / 2 + 0.7}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.4}
        strokeWidth={0.8}
      />
      <circle
        cx={C}
        cy={C}
        r={RING + w / 2 - 0.7}
        fill="none"
        stroke="#000000"
        strokeOpacity={0.35}
        strokeWidth={0.9}
      />
    </>
  );
}

/** From rare: a trim rim outside the ring; from epic, an energy line round the photo too. */
function rims(id: string, spec: Spec) {
  const w = ringWidth(spec);
  if (spec.grade < 2) return null;
  const outer = RING + w / 2 + 1.7;
  return (
    <>
      <circle cx={C} cy={C} r={outer} fill="none" stroke={OUTLINE} strokeWidth={2.9} />
      <circle
        cx={C}
        cy={C}
        r={outer}
        fill="none"
        stroke={`url(#${id}trim)`}
        strokeWidth={spec.grade >= 3 ? 1.8 : 1.3}
      />
      {spec.grade >= 3 && (
        <circle
          cx={C}
          cy={C}
          r={RING - w / 2 - 1.3}
          fill="none"
          stroke={spec.palette.accent}
          strokeOpacity={0.9}
          strokeWidth={1}
        />
      )}
    </>
  );
}

/** A faceted gem: a diamond with a lit upper facet. */
function gem(id: string, x: number, y: number, size: number, key: string | number) {
  const p = (dx: number, dy: number) => `${round(x + dx)} ${round(y + dy)}`;
  return (
    <g key={key}>
      <path
        d={`M${p(0, -size * 1.3)}L${p(size, 0)}L${p(0, size * 1.3)}L${p(-size, 0)}Z`}
        fill={`url(#${id}gem)`}
        stroke={OUTLINE}
        strokeWidth={0.7}
        strokeLinejoin="round"
      />
      <path
        d={`M${p(0, -size * 1.3)}L${p(size * 0.45, -size * 0.15)}L${p(-size * 0.45, -size * 0.15)}Z`}
        fill="#ffffff"
        opacity={0.55}
      />
    </g>
  );
}

function gems(id: string, spec: Spec) {
  if (spec.grade < 3) return null;
  const size = spec.grade === 4 ? 3.6 : 3;
  return (
    <>
      {[45, 135, 225, 315].map((deg) => {
        const [x, y] = at(RING, deg).split(' ').map(Number);
        return gem(id, x, y, size, deg);
      })}
    </>
  );
}

/** A curved blade from the ring outwards, leaning by `sweep` degrees. */
function blade(deg: number, r0: number, r1: number, half: number, sweep: number) {
  const tip = at(r1, deg + sweep);
  const c1 = at(r0 + (r1 - r0) * 0.55, deg - half * 0.9 + sweep * 0.3);
  const c2 = at(r0 + (r1 - r0) * 0.45, deg + half * 1.1 + sweep * 0.6);
  return `M${at(r0, deg - half)}Q${c1} ${tip}Q${c2} ${at(r0, deg + half)}Z`;
}

function shard(deg: number, r0: number, r1: number, half: number, sweep: number) {
  return `M${at(r0, deg - half)}L${at(r1, deg + sweep)}L${at(r0, deg + half)}L${at(r0 + (r1 - r0) * 0.35, deg + sweep * 0.3)}Z`;
}

/** Wing feathers on the right, by grade: [angle, reach, sweep, half width]. */
const FAN: Record<Grade, [number, number, number, number][]> = {
  1: [
    [78, 66, -8, 5],
    [96, 65, -3, 5],
  ],
  2: [
    [66, 70, -13, 5.6],
    [82, 73, -8, 6],
    [99, 69, -3, 5.4],
  ],
  3: [
    [57, 72, -15, 5.2],
    [71, 77, -11, 5.8],
    [86, 78, -7, 6],
    [101, 74, -3, 5.6],
    [116, 68, 1, 5],
  ],
  4: [
    [49, 74, -18, 5.2],
    [62, 79.5, -14, 5.8],
    [76, 82, -10, 6.2],
    [91, 81, -6, 6.2],
    [106, 76, -2, 5.8],
    [121, 70, 2, 5.2],
  ],
};

/** The right-hand side ornaments; the left is the same drawing mirrored. */
function sideArt(id: string, spec: Spec): ReactNode {
  const style = spec.sides ?? 'feather';
  const fan = FAN[spec.grade];
  const r0 = RING + 1;
  if (style === 'laurel') {
    // Gilded leaves climbing each side towards the crest, denser as the border gets rarer.
    const count = [5, 6, 7, 9][spec.grade - 1];
    const step = 116 / count;
    const leaves = Array.from({ length: count }, (_, index) => 34 + index * step);
    return (
      <>
        <path
          d={leaves.map((deg) => leaf(RING + 6.8, deg, 14 + spec.grade, 5.8, 40)).join('')}
          fill={`url(#${id}gem)`}
          stroke={OUTLINE}
          strokeWidth={0.7}
        />
        <path
          d={`M${at(RING + 4, 30)}A${RING + 4} ${RING + 4} 0 0 1 ${at(RING + 4, 154)}`}
          fill="none"
          stroke={spec.palette.accent}
          strokeWidth={1}
          opacity={0.8}
        />
      </>
    );
  }
  if (style === 'flame') {
    return (
      <>
        <path
          className="profile-border-flames"
          d={fan.map(([deg, r1, , half]) => flame(deg, r0 - 2, r1 - r0 + 3, half * 1.6)).join('')}
          fill={`url(#${id}fire)`}
          stroke={OUTLINE}
          strokeWidth={0.6}
        />
        <path
          className="profile-border-embers"
          d={fan.map(([deg, r1, , half]) => flame(deg + 3, r0 - 1, (r1 - r0) * 0.6, half)).join('')}
          fill="#fffbea"
          opacity={0.85}
        />
      </>
    );
  }
  const path = style === 'crystal' ? shard : blade;
  return (
    <>
      {spec.grade === 4 && (
        <path
          d={fan
            .map(([deg, r1, sweep, half]) => path(deg + 6.5, r0, r1 + 2.5, half, sweep))
            .join('')}
          fill={style === 'crystal' ? `url(#${id}gem)` : `url(#${id}body)`}
          stroke={OUTLINE}
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
      )}
      <path
        d={fan.map(([deg, r1, sweep, half]) => path(deg, r0, r1, half, sweep)).join('')}
        fill={
          style === 'crystal'
            ? `url(#${id}gem)`
            : spec.grade >= 3
              ? `url(#${id}trim)`
              : `url(#${id}body)`
        }
        stroke={OUTLINE}
        strokeWidth={0.7}
        strokeLinejoin="round"
      />
      <path
        d={fan
          .map(([deg, r1, sweep]) => `M${at(r0 + 1, deg)}L${at(r1 - 2.5, deg + sweep * 0.8)}`)
          .join('')}
        stroke="#ffffff"
        strokeOpacity={0.55}
        strokeWidth={0.6}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function sides(id: string, spec: Spec) {
  const art = sideArt(id, spec);
  return (
    <>
      <g>{art}</g>
      <g transform="matrix(-1 0 0 1 120 0)">{art}</g>
    </>
  );
}

/** The crest on top: a medallion with the border's emblem, spikes from epic and a crown at legendary. */
function crest(id: string, spec: Spec) {
  const { grade, palette } = spec;
  const cy = C - RING;
  const r = [9.4, 10.8, 12.2, 13.4][grade - 1];
  const inner = r - 2.2;
  const glyph: { d: string } | { text: string } = GLYPHS[spec.glyph];
  const base = cy - r + 2.2;
  const crown =
    `M${round(C - r * 0.9)} ${round(base)}L${round(C - r * 1.05)} ${round(base - 7)}` +
    `L${round(C - r * 0.48)} ${round(base - 3.2)}L${C} ${round(base - 9)}` +
    `L${round(C + r * 0.48)} ${round(base - 3.2)}L${round(C + r * 1.05)} ${round(base - 7)}` +
    `L${round(C + r * 0.9)} ${round(base)}Z`;
  const scale = (inner * 1.62) / 24;
  return (
    <>
      {grade >= 3 && (
        <path
          d={star(RING, 0, r + (grade === 4 ? 11 : 7.5), r + 1.2, grade === 4 ? 12 : 8)}
          fill={`url(#${id}trim)`}
          stroke={OUTLINE}
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      )}
      {grade === 4 && (
        <>
          <path
            d={crown}
            fill={`url(#${id}trim)`}
            stroke={OUTLINE}
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
          {[
            [C - r * 1.05, base - 7],
            [C, base - 9],
            [C + r * 1.05, base - 7],
          ].map(([x, y]) => gem(id, x, y, 1.5, `${x}`))}
        </>
      )}
      <circle cx={C} cy={cy} r={r} fill={`url(#${id}trim)`} stroke={OUTLINE} strokeWidth={1.1} />
      <circle
        cx={C}
        cy={cy}
        r={inner}
        fill={palette.deep}
        stroke={palette.accent}
        strokeOpacity={0.8}
        strokeWidth={0.5}
      />
      {'text' in glyph ? (
        <text
          x={C}
          y={round(cy + inner * 0.52)}
          textAnchor="middle"
          fontSize={round(inner * 1.55)}
          fontWeight={900}
          fontFamily="system-ui, 'Segoe UI', sans-serif"
          fill={palette.light}
        >
          {glyph.text}
        </text>
      ) : (
        <path
          d={glyph.d}
          transform={`translate(${round(C - 12 * scale)} ${round(cy - 12 * scale)}) scale(${round(scale * 1000) / 1000})`}
          fill="none"
          stroke={palette.light}
          strokeWidth={2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </>
  );
}

const NUMERALS = ['I', 'II', 'III'];

/** The bottom: a banner with the tier for a family, a gem for a single border from rare. */
function base(id: string, spec: Spec) {
  const y = C + RING;
  if (!spec.tier) {
    return spec.grade >= 2 ? gem(id, C, y, 2.9 + spec.grade * 0.5, 'base') : null;
  }
  const w = 16 + spec.grade * 4;
  const left = C - w / 2;
  const right = C + w / 2;
  const tail = (edge: number, out: number) =>
    `M${edge} ${y - 3.6}L${edge + out * 9} ${y - 2.6}L${edge + out * 5.6} ${y + 1.2}L${edge + out * 9} ${y + 5.2}L${edge} ${y + 5}Z`;
  return (
    <>
      <path
        d={tail(left + 1, -1) + tail(right - 1, 1)}
        fill={spec.palette.deep}
        stroke={OUTLINE}
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
      <rect
        x={left}
        y={y - 5.2}
        width={w}
        height={10.4}
        rx={1.6}
        fill={`url(#${id}body)`}
        stroke={OUTLINE}
        strokeWidth={1}
      />
      <path
        d={`M${left + 1.2} ${y - 3.7}H${right - 1.2}M${left + 1.2} ${y + 3.7}H${right - 1.2}`}
        stroke={`url(#${id}trim)`}
        strokeWidth={0.8}
      />
      <text
        x={C}
        y={y + 2.9}
        textAnchor="middle"
        fontSize={8.2}
        fontWeight={800}
        letterSpacing={0.4}
        fontFamily="Georgia, 'Times New Roman', serif"
        fill="#fff8e1"
        stroke={OUTLINE}
        strokeWidth={1.3}
        paintOrder="stroke"
      >
        {NUMERALS[spec.tier - 1]}
      </text>
    </>
  );
}

const SPARKS: [number, number, number][] = [
  [34, 66, 2.8],
  [148, 66, 2.2],
  [214, 68, 2.6],
  [326, 67, 2.2],
  [250, 71, 1.8],
  [112, 72, 1.8],
];

function effects(id: string, spec: Spec, layer: 'back' | 'front') {
  if (spec.grade < 3) return null;
  if (layer === 'back') {
    return (
      <>
        <circle className="profile-border-aura" cx={C} cy={C} r={76} fill={`url(#${id}glow)`} />
        {spec.grade === 4 && (
          <g className="profile-border-runes">
            <circle
              cx={C}
              cy={C}
              r={64}
              fill="none"
              stroke={spec.palette.accent}
              strokeOpacity={0.85}
              strokeWidth={0.7}
              strokeDasharray="0.8 2.6"
            />
            {around(8, 22.5).map((deg) => {
              const [x, y] = at(64, deg).split(' ').map(Number);
              const p = (dx: number, dy: number) => `${round(x + dx)} ${round(y + dy)}`;
              return (
                <path
                  key={deg}
                  d={`M${p(0, -1.6)}L${p(1.2, 0)}L${p(0, 1.6)}L${p(-1.2, 0)}Z`}
                  fill={spec.palette.accent}
                />
              );
            })}
          </g>
        )}
      </>
    );
  }
  return (
    <>
      <circle
        className="profile-border-sheen"
        cx={C}
        cy={C}
        r={RING}
        fill="none"
        stroke="#ffffff"
        strokeWidth={ringWidth(spec)}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="6 94"
        opacity={0.5}
        transform={`rotate(-60 ${C} ${C})`}
      />
      <path
        className="profile-border-sparks"
        d={SPARKS.slice(0, spec.grade === 4 ? 6 : 3)
          .map(([deg, r, size]) => star(r, deg, size, size * 0.28, 4))
          .join('')}
        fill="#ffffff"
      />
    </>
  );
}

/** A whole border from its spec. */
function frame(id: string, spec: Spec): ReactNode {
  return (
    <>
      {defs(id, spec)}
      {effects(id, spec, 'back')}
      {sides(id, spec)}
      {ring(id, spec)}
      {spec.detail?.(id, spec)}
      {rims(id, spec)}
      {gems(id, spec)}
      {crest(id, spec)}
      {base(id, spec)}
      {effects(id, spec, 'front')}
    </>
  );
}

/* Ring details: what each border carves into or lays over its ring. */

const radialLines = (angles: number[], inner: number, outer: number) =>
  angles.map((deg) => `M${at(inner, deg)}L${at(outer, deg)}`).join('');

/** Gaps cut through the ring, splitting it into segments. */
const segments =
  (count: number): Detail =>
  (_, spec) => {
    const w = ringWidth(spec);
    return (
      <path
        d={radialLines(around(count, 180 / count), RING - w / 2 - 0.6, RING + w / 2 + 0.6)}
        stroke={OUTLINE}
        strokeWidth={2}
      />
    );
  };

/** Chain links along the ring. */
const chain: Detail = (_, spec) => {
  const r1 = RING + 2;
  const r2 = RING - 2;
  const links = around(15, 12)
    .map(
      (d) =>
        `M${at(r1, d - 6)}A${r1} ${r1} 0 0 1 ${at(r1, d + 6)}A2 2 0 0 1 ${at(r2, d + 6)}` +
        `A${r2} ${r2} 0 0 0 ${at(r2, d - 6)}A2 2 0 0 1 ${at(r1, d - 6)}Z`,
    )
    .join('');
  return (
    <>
      <path d={links} fill="none" stroke={OUTLINE} strokeWidth={2.2} />
      <path d={links} fill="none" stroke={spec.palette.light} strokeWidth={1.1} />
      <path
        d={radialLines(around(15), RING - 2.6, RING + 2.6)}
        stroke={spec.palette.light}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </>
  );
};

/** Bumper-plate lettering, as on a weight plate. */
const plates: Detail = () => (
  <path
    d={[
      [16, 46],
      [134, 164],
      [196, 226],
      [314, 344],
    ]
      .map(([from, to]) => `M${at(RING, from)}A${RING} ${RING} 0 0 1 ${at(RING, to)}`)
      .join('')}
    fill="none"
    stroke="#ffffff"
    strokeOpacity={0.8}
    strokeWidth={2.4}
    strokeDasharray="1.4 1.1"
  />
);

const arcPath = (r: number, from: number, to: number) =>
  `M${at(r, from)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${at(r, to)}`;

/** Coloured arcs laid over the ring. */
const colourArcs =
  (colours: string[]): Detail =>
  (_, spec) => {
    const span = 360 / colours.length;
    return (
      <>
        {colours.map((colour, index) => (
          <path
            key={colour}
            d={arcPath(RING, index * span + 4, (index + 1) * span - 4)}
            fill="none"
            stroke={colour}
            strokeWidth={ringWidth(spec) - 2}
          />
        ))}
      </>
    );
  };

/** A heartbeat trace round the ring. */
const heartbeat: Detail = (_, spec) => {
  const beats = [32, 148, 212, 328];
  const d = `M${at(RING, 0)}${beats
    .map(
      (deg) =>
        `A${RING} ${RING} 0 0 1 ${at(RING, deg - 6)}L${at(RING - 3.4, deg - 4.4)}L${at(RING + 5.4, deg - 1.6)}` +
        `L${at(RING - 6.4, deg + 2.2)}L${at(RING, deg + 4.6)}`,
    )
    .join('')}A${RING} ${RING} 0 0 1 ${at(RING, 359.9)}`;
  return (
    <>
      {spec.grade >= 3 && (
        <path d={d} fill="none" stroke={spec.palette.accent} strokeWidth={3.4} opacity={0.45} />
      )}
      <path d={d} fill="none" stroke="#fff1f2" strokeWidth={1.2} strokeLinejoin="round" />
    </>
  );
};

/** Clock ticks for the hour count. */
const clock: Detail = () => (
  <>
    <path
      d={radialLines(
        around(60).filter((_, index) => index % 5 !== 0),
        RING - 1,
        RING + 1,
      )}
      stroke="#cbd5e1"
      strokeWidth={0.5}
    />
    <path d={radialLines(around(12), RING - 2.6, RING + 2.6)} stroke="#ffffff" strokeWidth={1.3} />
  </>
);

/** Rivets round the ring, for iron. */
const rivets: Detail = (id) => (
  <>
    {around(16, 11.25).map((deg) => {
      const [x, y] = at(RING, deg).split(' ').map(Number);
      return (
        <g key={deg}>
          <circle cx={x} cy={y} r={1.3} fill={OUTLINE} />
          <circle cx={x} cy={y} r={0.95} fill={`url(#${id}trim)`} />
        </g>
      );
    })}
  </>
);

/** Waves along the outside, for the ocean. */
const waves: Detail = (_, spec) => {
  const r = RING + 1.4;
  const d = around(18, 10)
    .map((deg) => `M${at(r, deg - 10)}Q${at(r + 3.6, deg - 5)} ${at(r, deg)}T${at(r, deg + 10)}`)
    .join('');
  return <path d={d} fill="none" stroke={spec.palette.light} strokeWidth={1} opacity={0.9} />;
};

/** Diamond facets cut across the ring. */
const facets: Detail = () => (
  <path
    d={around(24)
      .map((deg) => `M${at(RING - 3.4, deg)}L${at(RING + 3.4, deg + 7.5)}`)
      .join('')}
    stroke="#ffffff"
    strokeOpacity={0.45}
    strokeWidth={0.6}
  />
);

/** Running-track lanes. */
const lanes: Detail = () => (
  <>
    <circle
      cx={C}
      cy={C}
      r={RING - 1.6}
      fill="none"
      stroke="#ffffff"
      strokeOpacity={0.75}
      strokeWidth={0.5}
    />
    <circle
      cx={C}
      cy={C}
      r={RING + 1.6}
      fill="none"
      stroke="#ffffff"
      strokeOpacity={0.75}
      strokeWidth={0.5}
    />
    <path d={radialLines([200], RING - 3.4, RING + 3.4)} stroke="#ffffff" strokeWidth={2} />
  </>
);

/** Half the ring burns: lifting meets cardio. */
const hybrid: Detail = (_, spec) => (
  <>
    <path
      d={arcPath(RING, 4, 176)}
      fill="none"
      stroke={spec.palette.accent}
      strokeWidth={ringWidth(spec) - 2}
    />
    <path
      d={`M${at(RING + 3, 84)}L${at(RING - 3, 90)}L${at(RING + 2, 92)}L${at(RING - 3.4, 99)}`}
      fill="none"
      stroke="#fef9c3"
      strokeWidth={1.3}
      strokeLinejoin="round"
    />
  </>
);

/** Stars scattered on the ring, for the night. */
const starlight: Detail = () => (
  <path
    d={[24, 70, 118, 162, 205, 248, 296, 336]
      .map((deg, index) => star(RING, deg, index % 2 ? 1.2 : 1.8, 0.5, 4))
      .join('')}
    fill="#fef9c3"
  />
);

/** Sun rays fanning from the bottom half. */
const sunrays: Detail = () => (
  <path
    d={radialLines(around(24, 7.5), RING - 2.4, RING + 2.4)}
    stroke="#fff7ed"
    strokeOpacity={0.55}
    strokeWidth={0.7}
  />
);

/** The cuts of a gem, for the grandest crystal borders. */
const runesOnRing: Detail = (_, spec) => (
  <path
    d={around(36)
      .map((deg) => `M${at(RING, deg - 1.5)}A${RING} ${RING} 0 0 1 ${at(RING, deg + 1.5)}`)
      .join('')}
    fill="none"
    stroke={spec.palette.light}
    strokeOpacity={0.55}
    strokeWidth={1}
  />
);

/* Palettes: deep, base, light, accent, glow. */
const palette = (deep: string, base: string, light: string, accent: string, glow = accent) => ({
  deep,
  base,
  light,
  accent,
  glow,
});

const P = {
  violet: palette('#2e1065', '#7c3aed', '#ddd6fe', '#c4b5fd', '#a78bfa'),
  ember: palette('#431407', '#ea580c', '#fed7aa', '#fbbf24', '#fb923c'),
  ice: palette('#082f49', '#0ea5e9', '#e0f2fe', '#bae6fd', '#38bdf8'),
  bronze: palette('#3b1d0a', '#a16207', '#fde68a', '#fcd34d', '#f59e0b'),
  legion: palette('#450a0a', '#b91c1c', '#fecaca', '#fbbf24', '#f87171'),
  imperial: palette('#1e0b3d', '#6d28d9', '#ede9fe', '#fde047', '#c084fc'),
  ocean: palette('#042f2e', '#0f766e', '#99f6e4', '#5eead4', '#2dd4bf'),
  prism: palette('#1e1b4b', '#6366f1', '#f5f3ff', '#f0abfc', '#a5b4fc'),
  crimson: palette('#3f0a0a', '#dc2626', '#fecaca', '#fca5a5', '#ef4444'),
  cobalt: palette('#0b1b4d', '#2563eb', '#dbeafe', '#93c5fd', '#3b82f6'),
  molten: palette('#0c0a09', '#57534e', '#d6d3d1', '#fb923c', '#f97316'),
  podium: palette('#111827', '#374151', '#e5e7eb', '#fde047', '#facc15'),
  copper: palette('#3b1405', '#c2410c', '#fed7aa', '#fdba74', '#fb923c'),
  gold: palette('#422006', '#ca8a04', '#fef9c3', '#fde047', '#facc15'),
  cosmic: palette('#170b3b', '#7c3aed', '#f5f3ff', '#f0abfc', '#c084fc'),
  heart: palette('#4c0519', '#e11d48', '#ffe4e6', '#fb7185', '#f43f5e'),
  sprout: palette('#052e16', '#16a34a', '#dcfce7', '#86efac', '#4ade80'),
  sky: palette('#0c1e4a', '#2563eb', '#e0f2fe', '#7dd3fc', '#38bdf8'),
  lime: palette('#1a2e05', '#65a30d', '#ecfccb', '#bef264', '#a3e635'),
  dawn: palette('#3b0764', '#db2777', '#fde68a', '#fdba74', '#fb7185'),
  night: palette('#0b1033', '#3730a3', '#e0e7ff', '#fde68a', '#818cf8'),
  iron: palette('#111827', '#4b5563', '#e5e7eb', '#cbd5e1', '#94a3b8'),
  seasons: palette('#14532d', '#0f766e', '#ecfeff', '#fde047', '#5eead4'),
  slate: palette('#0f172a', '#334155', '#f1f5f9', '#f87171', '#94a3b8'),
  emerald: palette('#022c22', '#059669', '#d1fae5', '#fbbf24', '#34d399'),
  magenta: palette('#3b0764', '#c026d3', '#fae8ff', '#fde047', '#e879f9'),
  track: palette('#431407', '#ea580c', '#ffedd5', '#fef3c7', '#fb923c'),
  forge: palette('#1c1917', '#78716c', '#f5f5f4', '#f97316', '#fb923c'),
  summit: palette('#082f49', '#0369a1', '#f0f9ff', '#e0f2fe', '#7dd3fc'),
};

const BIG_THREE = ['#dc2626', '#eab308', '#2563eb'];
const SEASONS = ['#4ade80', '#facc15', '#f97316', '#7dd3fc'];

const SPECS: Record<string, Spec> = {
  'first-steps': { grade: 1, palette: P.sprout, glyph: 'steps' },
  'seven-straight': { grade: 1, palette: P.sky, glyph: 'seven', detail: segments(7) },
  'locked-in': { grade: 2, palette: P.violet, glyph: 'lock', detail: chain, tier: 1 },
  'hundred-days': {
    grade: 3,
    palette: P.ember,
    glyph: 'flame',
    sides: 'flame',
    detail: chain,
    tier: 2,
  },
  unbreakable: {
    grade: 4,
    palette: P.ice,
    glyph: 'infinity',
    sides: 'crystal',
    detail: chain,
    tier: 3,
  },
  regular: { grade: 1, palette: P.bronze, glyph: 'shield', sides: 'laurel', tier: 1 },
  centurion: { grade: 2, palette: P.legion, glyph: 'helmet', sides: 'laurel', tier: 2 },
  'iron-legion': {
    grade: 4,
    palette: P.imperial,
    glyph: 'swords',
    sides: 'laurel',
    detail: rivets,
    tier: 3,
  },
  'monday-club': { grade: 2, palette: P.lime, glyph: 'calendar', detail: segments(8) },
  'dawn-patrol': { grade: 2, palette: P.dawn, glyph: 'sunrise', detail: sunrays },
  'night-shift': { grade: 2, palette: P.night, glyph: 'moon', detail: starlight },
  'iron-habit': { grade: 3, palette: P.iron, glyph: 'anvil', detail: rivets },
  'four-seasons': { grade: 3, palette: P.seasons, glyph: 'seasons', detail: colourArcs(SEASONS) },
  'whale-lifter': { grade: 2, palette: P.ocean, glyph: 'whale', detail: waves, tier: 1 },
  'million-kilo': {
    grade: 4,
    palette: P.prism,
    glyph: 'diamond',
    sides: 'crystal',
    detail: facets,
    tier: 2,
  },
  'hundred-hours': { grade: 2, palette: P.slate, glyph: 'hourglass', detail: clock },
  'bench-club-1': { grade: 2, palette: P.crimson, glyph: 'bench', detail: plates, tier: 1 },
  'bench-club-2': { grade: 3, palette: P.crimson, glyph: 'bench', detail: plates, tier: 2 },
  'bench-club-3': { grade: 4, palette: P.crimson, glyph: 'bench', detail: plates, tier: 3 },
  'squat-club-1': { grade: 2, palette: P.cobalt, glyph: 'rack', detail: plates, tier: 1 },
  'squat-club-2': { grade: 3, palette: P.cobalt, glyph: 'rack', detail: plates, tier: 2 },
  'squat-club-3': { grade: 4, palette: P.cobalt, glyph: 'rack', detail: plates, tier: 3 },
  'deadlift-club-1': { grade: 2, palette: P.molten, glyph: 'bentbar', detail: plates, tier: 1 },
  'deadlift-club-2': {
    grade: 3,
    palette: P.molten,
    glyph: 'bentbar',
    sides: 'flame',
    detail: plates,
    tier: 2,
  },
  'deadlift-club-3': {
    grade: 4,
    palette: P.molten,
    glyph: 'bentbar',
    sides: 'flame',
    detail: plates,
    tier: 3,
  },
  'big-three-1': {
    grade: 2,
    palette: P.podium,
    glyph: 'lights',
    detail: colourArcs(BIG_THREE),
    tier: 1,
  },
  'big-three-2': {
    grade: 3,
    palette: P.podium,
    glyph: 'lights',
    detail: colourArcs(BIG_THREE),
    tier: 2,
  },
  'big-three-3': {
    grade: 4,
    palette: P.podium,
    glyph: 'lights',
    detail: colourArcs(BIG_THREE),
    tier: 3,
  },
  'pound-for-pound': { grade: 2, palette: P.emerald, glyph: 'scales' },
  'hat-trick': { grade: 1, palette: P.magenta, glyph: 'stars' },
  'record-breaker-1': { grade: 1, palette: P.copper, glyph: 'trophy', tier: 1 },
  'record-breaker-2': { grade: 2, palette: P.gold, glyph: 'trophy', tier: 2 },
  'record-breaker-3': {
    grade: 3,
    palette: P.cosmic,
    glyph: 'trophy',
    sides: 'crystal',
    detail: runesOnRing,
    tier: 3,
  },
  'marathon-month': { grade: 2, palette: P.track, glyph: 'medal', sides: 'laurel', detail: lanes },
  'cardiomaniac-1': { grade: 1, palette: P.heart, glyph: 'heart', detail: heartbeat, tier: 1 },
  'cardiomaniac-2': { grade: 3, palette: P.heart, glyph: 'heart', detail: heartbeat, tier: 2 },
  'cardiomaniac-3': {
    grade: 4,
    palette: P.heart,
    glyph: 'heart',
    sides: 'flame',
    detail: heartbeat,
    tier: 3,
  },
  hybrid: { grade: 3, palette: P.forge, glyph: 'bolt', detail: hybrid },
  everest: {
    grade: 4,
    palette: P.summit,
    glyph: 'mountain',
    sides: 'crystal',
    detail: runesOnRing,
  },
};

/* One entry per border key, so the server's catalogue can be checked against this file. */
const SHAPES: Record<string, (id: string) => ReactNode> = {
  'first-steps': (id) => frame(id, SPECS['first-steps']),
  'seven-straight': (id) => frame(id, SPECS['seven-straight']),
  'locked-in': (id) => frame(id, SPECS['locked-in']),
  'hundred-days': (id) => frame(id, SPECS['hundred-days']),
  unbreakable: (id) => frame(id, SPECS.unbreakable),
  regular: (id) => frame(id, SPECS.regular),
  centurion: (id) => frame(id, SPECS.centurion),
  'iron-legion': (id) => frame(id, SPECS['iron-legion']),
  'monday-club': (id) => frame(id, SPECS['monday-club']),
  'dawn-patrol': (id) => frame(id, SPECS['dawn-patrol']),
  'night-shift': (id) => frame(id, SPECS['night-shift']),
  'iron-habit': (id) => frame(id, SPECS['iron-habit']),
  'four-seasons': (id) => frame(id, SPECS['four-seasons']),
  'whale-lifter': (id) => frame(id, SPECS['whale-lifter']),
  'million-kilo': (id) => frame(id, SPECS['million-kilo']),
  'hundred-hours': (id) => frame(id, SPECS['hundred-hours']),
  'bench-club-1': (id) => frame(id, SPECS['bench-club-1']),
  'bench-club-2': (id) => frame(id, SPECS['bench-club-2']),
  'bench-club-3': (id) => frame(id, SPECS['bench-club-3']),
  'squat-club-1': (id) => frame(id, SPECS['squat-club-1']),
  'squat-club-2': (id) => frame(id, SPECS['squat-club-2']),
  'squat-club-3': (id) => frame(id, SPECS['squat-club-3']),
  'deadlift-club-1': (id) => frame(id, SPECS['deadlift-club-1']),
  'deadlift-club-2': (id) => frame(id, SPECS['deadlift-club-2']),
  'deadlift-club-3': (id) => frame(id, SPECS['deadlift-club-3']),
  'big-three-1': (id) => frame(id, SPECS['big-three-1']),
  'big-three-2': (id) => frame(id, SPECS['big-three-2']),
  'big-three-3': (id) => frame(id, SPECS['big-three-3']),
  'pound-for-pound': (id) => frame(id, SPECS['pound-for-pound']),
  'hat-trick': (id) => frame(id, SPECS['hat-trick']),
  'record-breaker-1': (id) => frame(id, SPECS['record-breaker-1']),
  'record-breaker-2': (id) => frame(id, SPECS['record-breaker-2']),
  'record-breaker-3': (id) => frame(id, SPECS['record-breaker-3']),
  'marathon-month': (id) => frame(id, SPECS['marathon-month']),
  'cardiomaniac-1': (id) => frame(id, SPECS['cardiomaniac-1']),
  'cardiomaniac-2': (id) => frame(id, SPECS['cardiomaniac-2']),
  'cardiomaniac-3': (id) => frame(id, SPECS['cardiomaniac-3']),
  hybrid: (id) => frame(id, SPECS.hybrid),
  everest: (id) => frame(id, SPECS.everest),
};

/** Whether this build can draw the border, so an unknown key leaves the photo plain. */
export function hasProfileBorderArt(border: string | null | undefined): border is string {
  return typeof border === 'string' && Object.hasOwn(SHAPES, border);
}

/** Draws a border's shapes. `id` prefixes its gradients, which the whole page shares. */
export function profileBorderShapes(border: string, id: string): ReactNode {
  return SHAPES[border]?.(id) ?? null;
}
