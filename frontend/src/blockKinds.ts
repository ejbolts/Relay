import type { BlockKind, TrainingBlock } from './types';

export const BLOCK_KINDS: readonly BlockKind[] = ['strength', 'hypertrophy', 'recovery', 'deload'];

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  recovery: 'Recovery',
  deload: 'Deload',
};

/** The block's type; blocks saved before types count as deloads when marked, else untyped. */
export function blockKind(block: Pick<TrainingBlock, 'kind' | 'deload'>): BlockKind | null {
  const kind = BLOCK_KINDS.find((item) => item === block.kind);
  return kind ?? (block.deload ? 'deload' : null);
}

const yearOf = (day: string) => day.slice(0, 4);

/** 1 for the year's first block of a type, 2 for the second, and so on. */
export function kindNumber(blocks: TrainingBlock[], block: TrainingBlock) {
  const kind = blockKind(block);
  return (
    blocks
      .filter(
        (item) => blockKind(item) === kind && yearOf(item.start_date) === yearOf(block.start_date),
      )
      .findIndex((item) => item.id === block.id) + 1
  );
}

/** Short label for the year bar: S2, H1, R, D, or the name's initial for untyped blocks. */
export function blockCode(blocks: TrainingBlock[], block: TrainingBlock) {
  const kind = blockKind(block);
  if (kind === 'recovery') return 'R';
  if (kind === 'deload') return 'D';
  if (kind === 'strength') return `S${kindNumber(blocks, block)}`;
  if (kind === 'hypertrophy') return `H${kindNumber(blocks, block)}`;
  return block.name.trim().charAt(0).toUpperCase();
}

/** “Strength 3” after the year's two earlier strength blocks, or “Recovery · Left knee”. */
export function suggestedBlockName(
  blocks: TrainingBlock[],
  kind: BlockKind,
  start: string,
  focus = '',
  excludeId?: string,
) {
  if (kind === 'recovery') return focus.trim() ? `Recovery · ${focus.trim()}` : 'Recovery';
  if (kind === 'deload') return 'Deload';
  const earlier = blocks.filter(
    (item) =>
      item.id !== excludeId &&
      blockKind(item) === kind &&
      yearOf(item.start_date) === yearOf(start) &&
      item.start_date < start,
  ).length;
  return `${BLOCK_KIND_LABELS[kind]} ${earlier + 1}`;
}
