import { blockOn } from './trainingBlocks';
import type { TrainingBlock } from './types';

/** Colours offered for blocks, all light enough for the timeline's dark labels. */
export const BLOCK_COLOR_CHOICES = [
  '#7fb0f0',
  '#7fd8f0',
  '#6fd0b8',
  '#9fd67a',
  '#f0d36a',
  '#d2b06f',
  '#f0a07f',
  '#f09cc4',
  '#b59cf0',
  '#9aa4ad',
];

/** The timeline's tones for blocks without a chosen colour, matching Home's `tone-N` classes. */
const TONES = ['#8aa4bd', '#c9a35a', '#a493cc', '#6fb59a'];
const HEX = /^#[0-9a-f]{6}$/i;

export const validBlockColor = (value: string | null | undefined) =>
  value && HEX.test(value) ? value : null;

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
