import { BODY_FIGURES, type BodyFigureBand, type BodyFigureKind } from './bodyFigureShapes';
import type { BodySizeField } from './bodySizes';

/**
 * How far apart neighbouring labels in a column stay. Each label is a button, so this is also its
 * height: about 46px on a 390px-wide phone.
 */
export const LABEL_GAP = 100;
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

/**
 * Where each measurement is labelled. The figure faces the viewer, so its right side is on the
 * left of the picture (`column: -1`); `mirror` flips a limb band onto that side.
 */
export const BODY_FIGURE_CALLOUTS: readonly {
  field: BodySizeField;
  name: string;
  band: BodyFigureBand;
  column: -1 | 1;
  mirror?: boolean;
}[] = [
  { field: 'neck_cm', name: 'Neck', band: 'neck', column: -1 },
  { field: 'right_arm_cm', name: 'Right arm', band: 'arm', column: -1, mirror: true },
  { field: 'waist_cm', name: 'Waist', band: 'waist', column: -1 },
  { field: 'hips_cm', name: 'Hips', band: 'hips', column: -1 },
  { field: 'right_thigh_cm', name: 'Right thigh', band: 'thigh', column: -1, mirror: true },
  { field: 'right_calf_cm', name: 'Right calf', band: 'calf', column: -1, mirror: true },
  { field: 'shoulders_cm', name: 'Shoulders', band: 'shoulders', column: 1 },
  { field: 'chest_cm', name: 'Chest', band: 'chest', column: 1 },
  { field: 'left_arm_cm', name: 'Left arm', band: 'arm', column: 1 },
  { field: 'wrist_cm', name: 'Wrist', band: 'wrist', column: 1 },
  { field: 'left_thigh_cm', name: 'Left thigh', band: 'thigh', column: 1 },
  { field: 'left_calf_cm', name: 'Left calf', band: 'calf', column: 1 },
];

/** The drawing's frame in figure units: x runs from -HALF_WIDTH to HALF_WIDTH, y from TOP. */
export const FIGURE_HALF_WIDTH = 350;
// Room above the head for the bun.
export const FIGURE_TOP = -26;
export const FIGURE_HEIGHT = 852;
export const LEADER_START = 214;
/** A label's tap area: from the edge of the picture to where its leader starts. */
export const LABEL_WIDTH = FIGURE_HALF_WIDTH - LEADER_START + 4;
/** The number box typed into in place of a value; it may cover the start of the leader. */
export const EDITOR_WIDTH = 180;

export type BodyFigureCallout = (typeof BODY_FIGURE_CALLOUTS)[number] & {
  /** Where the band starts and ends across the part, and its height. */
  from: number;
  to: number;
  y: number;
  /** The label's height, spread so neighbouring labels don't overlap. */
  labelY: number;
};

/** The labels to draw on a figure, each placed beside its band. */
export function bodyFigureCallouts(
  kind: BodyFigureKind,
  include: (field: BodySizeField) => boolean,
): BodyFigureCallout[] {
  const shape = BODY_FIGURES[kind];
  return ([-1, 1] as const).flatMap((column) => {
    const shown = BODY_FIGURE_CALLOUTS.filter(
      (item) => item.column === column && include(item.field),
    )
      .map((item) => {
        const [x1, x2, y] = shape.bands[item.band];
        const [from, to] = item.mirror ? [-x2, -x1] : [x1, x2];
        return { ...item, from, to, y };
      })
      .sort((a, b) => a.y - b.y);
    const labelY = spreadLabels(shown.map((item) => item.y));
    return shown.map((item, index) => ({ ...item, labelY: labelY[index] }));
  });
}

/** A label's spoken name: what tapping it does, and the value it shows. */
export function bodyFigureLabelName(
  name: string,
  value: string | undefined,
  carried: boolean,
  unit: string,
): string {
  return value
    ? `${carried ? 'Add' : 'Update'} ${name.toLowerCase()}, ${carried ? 'last ' : ''}${value} ${unit}`
    : `Add ${name.toLowerCase()}`;
}
