/** Labels are two lines of text, so neighbours in a column stay at least this far apart. */
const LABEL_GAP = 76;
const LABEL_TOP = 26;
const LABEL_BOTTOM = 790;

/**
 * Keeps each label beside its measurement where there is room. Labels that would overlap are moved
 * apart as a group, centred on where they wanted to be, so no leader has to slant far.
 */
export function spreadLabels(wanted: readonly number[]): number[] {
  // Each block is a run of touching labels; `anchor` sums where its first label would sit for each member.
  const blocks: { anchor: number; count: number }[] = [];
  const start = (block: { anchor: number; count: number }) => block.anchor / block.count;
  for (const y of wanted) {
    blocks.push({ anchor: y, count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const before = blocks[blocks.length - 2];
      if (start(before) + before.count * LABEL_GAP <= start(last)) break;
      blocks.splice(-2, 2, {
        anchor: before.anchor + last.anchor - last.count * before.count * LABEL_GAP,
        count: before.count + last.count,
      });
    }
  }
  const placed = blocks.flatMap((block) =>
    Array.from({ length: block.count }, (_, index) => start(block) + index * LABEL_GAP),
  );
  // Hold everything inside the picture, top first and then bottom.
  for (let i = 0; i < placed.length; i += 1) {
    placed[i] = Math.max(placed[i], i === 0 ? LABEL_TOP : placed[i - 1] + LABEL_GAP);
  }
  for (let i = placed.length - 1; i >= 0; i -= 1) {
    const limit = i === placed.length - 1 ? LABEL_BOTTOM : placed[i + 1] - LABEL_GAP;
    placed[i] = Math.min(placed[i], limit);
  }
  return placed;
}
