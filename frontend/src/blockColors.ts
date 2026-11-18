import { blockOn } from './trainingBlocks';
import type { TrainingBlock } from './types';

/**
 * Colours offered for blocks: eight hues in light, bright and deep rows, then neutrals.
 * The first row keeps the original palette, so earlier choices stay selectable.
 */
export const BLOCK_COLOR_CHOICES: { name: string; hex: string }[] = [
  { name: 'Coral', hex: '#f0a07f' },
  { name: 'Yellow', hex: '#f0d36a' },
  { name: 'Green', hex: '#9fd67a' },
  { name: 'Teal', hex: '#6fd0b8' },
  { name: 'Sky', hex: '#7fd8f0' },
  { name: 'Blue', hex: '#7fb0f0' },
  { name: 'Lavender', hex: '#b59cf0' },
  { name: 'Pink', hex: '#f09cc4' },
  { name: 'Red', hex: '#ec6a52' },
  { name: 'Amber', hex: '#f2b33d' },
  { name: 'Lime', hex: '#6cc24a' },
  { name: 'Jade', hex: '#2fb595' },
  { name: 'Cyan', hex: '#2fb3d9' },
  { name: 'Cobalt', hex: '#4a86e8' },
  { name: 'Violet', hex: '#8c66e0' },
  { name: 'Magenta', hex: '#e0559a' },
  { name: 'Brick', hex: '#a8402c' },
  { name: 'Bronze', hex: '#8f6210' },
  { name: 'Forest', hex: '#2f7a32' },
  { name: 'Pine', hex: '#16705e' },
  { name: 'Ocean', hex: '#17708f' },
  { name: 'Navy', hex: '#2d4f9e' },
  { name: 'Plum', hex: '#5a3a9e' },
  { name: 'Berry', hex: '#9c2f63' },
  { name: 'Ivory', hex: '#ebe6da' },
  { name: 'Stone', hex: '#c2b9aa' },
  { name: 'Sand', hex: '#d2b06f' },
  { name: 'Olive', hex: '#8f9a55' },
  { name: 'Brown', hex: '#8a6446' },
  { name: 'Mauve', hex: '#a98fa3' },
  { name: 'Grey', hex: '#9aa4ad' },
  { name: 'Slate', hex: '#5f6b78' },
];

/** The timeline's tones for blocks without a chosen colour, matching Home's `tone-N` classes. */
const TONES = ['#8aa4bd', '#c9a35a', '#a493cc', '#6fb59a'];
const HEX = /^#[0-9a-f]{6}$/i;

export const validBlockColor = (value: string | null | undefined) =>
  value && HEX.test(value) ? value : null;

/** Whether a valid colour is one of the palette's, rather than a custom choice. */
export const isPaletteColor = (value: string) =>
  BLOCK_COLOR_CHOICES.some((choice) => choice.hex === value.toLowerCase());

const DARK_INK = '#0b0d0f';
const LIGHT_INK = '#ffffff';

/**
 * Label colour for text drawn on a block colour: dark ink on light colours, white on deep ones.
 * Picks whichever contrasts more; theme colours (CSS variables) are light, so they keep dark ink.
 */
export function blockInk(color: string) {
  if (!HEX.test(color)) return DARK_INK;
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = parseInt(color.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Equal contrast against #0b0d0f and white falls at a luminance of about 0.18.
  return luminance > 0.18 ? DARK_INK : LIGHT_INK;
}

/** The block's own colour, else the accent while it is in progress, else a tone by position. */
export function blockColor(blocks: TrainingBlock[], block: TrainingBlock, today: string) {
  const own = validBlockColor(block.color);
  if (own) return own;
  if (!block.end_date && blockOn(blocks, today)?.id === block.id) return 'var(--p-accent-text)';
  return TONES[
    Math.max(
      0,
      blocks.findIndex((item) => item.id === block.id),
    ) % TONES.length
  ];
}
