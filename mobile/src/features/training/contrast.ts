import type { Palette } from '../../ui/theme';

// Colour maths for Training's own fills (chart bars, tinted badges, block week cells), so their
// shapes and small labels stay readable on every colour theme and style: 3:1 for chart shapes,
// 4.5:1 for small text (WCAG).

type Rgba = { r: number; g: number; b: number; a: number };

function parse(colour: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(colour);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
    };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(colour);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(',').map((part) => Number(part.trim()));
    return { r, g, b, a };
  }
  return null;
}

const toHex = ({ r, g, b }: Rgba) =>
  `#${[r, g, b]
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** `colour` (with any alpha) painted over the opaque `under`, as one opaque #rrggbb. */
export function composite(colour: string, under: string): string {
  const top = parse(colour);
  const base = parse(under);
  if (!top || !base) return under;
  const mixed = (c: 'r' | 'g' | 'b') => top[c] * top.a + base[c] * (1 - top.a);
  return toHex({ r: mixed('r'), g: mixed('g'), b: mixed('b'), a: 1 });
}

/** `from` moved `amount` (0–1) of the way to `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return from;
  const at = (c: 'r' | 'g' | 'b') => a[c] + (b[c] - a[c]) * amount;
  return toHex({ r: at('r'), g: at('g'), b: at('b'), a: 1 });
}

/** WCAG contrast between two colours, each composited over white if it has alpha. */
export function contrast(first: string, second: string): number {
  const luminance = (colour: string) => {
    const c = parse(composite(colour, '#ffffff'));
    if (!c) return 0;
    const [r, g, b] = [c.r, c.g, c.b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `colour`, moved toward `toward` only as far as it needs to reach `target` against `background`.
 * Keeps the design's colour wherever it already reads.
 */
export function readable(colour: string, background: string, target: number, toward: string) {
  for (let step = 0; step <= 10; step += 1) {
    const candidate = step === 0 ? colour : mix(colour, toward, step / 10);
    if (contrast(candidate, background) >= target) return candidate;
  }
  return toward;
}

/** Whichever of the candidates reads best on `fill`. */
export function bestInk(fill: string, candidates: string[]): string {
  return candidates.reduce((best, ink) =>
    contrast(ink, fill) > contrast(best, fill) ? ink : best,
  );
}

/** The inactive bars of a chart: the web's grey, darkened just enough for 3:1 on the card. */
export const chartNeutral = (colors: Palette) =>
  readable(colors.deemph, colors.surface, 3, colors.muted);

/** A badge's tinted fill on a card, and an ink that reads on it at 4.5:1. */
export function toneBadge(colors: Palette, tone: 'good' | 'gold') {
  const fill = tone === 'good' ? colors.goodSoft : colors.goldSoft;
  const solid = composite(fill, colors.surface);
  return { fill, ink: readable(colors[tone], solid, 4.5, colors.text) };
}

/** Text on a block's week cell: the block colour at `alpha` over the strip's own fill. */
export function cellInk(colors: Palette, cellFill: string) {
  const solid = composite(cellFill, colors.surface2);
  return bestInk(solid, [colors.text, colors.page, '#000000', '#ffffff']);
}
