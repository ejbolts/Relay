import { useMemo } from 'react';
import {
  BODY_FIGURES,
  bodyFigurePath,
  type BodyFigureBand,
  type BodyFigureKind,
} from './bodyFigureShapes';
import { spreadLabels } from './bodyFigureLayout';
import type { BodySizeField } from './bodySizes';

/**
 * Where each measurement is labelled. The figure faces the viewer, so its right side is on the
 * left of the picture (`column: -1`); `mirror` flips a limb band onto that side.
 */
const CALLOUTS: readonly {
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
  { field: 'ankle_cm', name: 'Ankle', band: 'ankle', column: -1, mirror: true },
  { field: 'shoulders_cm', name: 'Shoulders', band: 'shoulders', column: 1 },
  { field: 'chest_cm', name: 'Chest', band: 'chest', column: 1 },
  { field: 'left_arm_cm', name: 'Left arm', band: 'arm', column: 1 },
  { field: 'wrist_cm', name: 'Wrist', band: 'wrist', column: 1 },
  { field: 'left_thigh_cm', name: 'Left thigh', band: 'thigh', column: 1 },
  { field: 'left_calf_cm', name: 'Left calf', band: 'calf', column: 1 },
];

const HALF_WIDTH = 350;
const TOP = -16;
const HEIGHT = 842;
const LEADER_START = 214;

/** A body outline with each measurement drawn across the part it measures and labelled beside it. */
export function BodyFigure({
  kind,
  values,
  unit,
}: {
  kind: BodyFigureKind;
  /** Display values by field; a field left out is not drawn. */
  values: Partial<Record<BodySizeField, string>>;
  unit: string;
}) {
  const shape = BODY_FIGURES[kind];
  const outline = useMemo(() => bodyFigurePath(shape.half), [shape]);
  const callouts = ([-1, 1] as const).flatMap((column) => {
    const shown = CALLOUTS.filter((item) => item.column === column && values[item.field])
      .map((item) => {
        const [x1, x2, y] = shape.bands[item.band];
        const [from, to] = item.mirror ? [-x2, -x1] : [x1, x2];
        return { ...item, from, to, y };
      })
      .sort((a, b) => a.y - b.y);
    const labelY = spreadLabels(shown.map((item) => item.y));
    return shown.map((item, index) => ({ ...item, labelY: labelY[index] }));
  });
  return (
    <svg
      className="body-figure"
      data-figure={kind}
      viewBox={`${-HALF_WIDTH} ${TOP} ${HALF_WIDTH * 2} ${HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Leaders sit under the outline, so one reaching the torso passes behind the arm. */}
      {callouts.map((item) => (
        <line
          key={item.field}
          className="body-figure-leader"
          x1={item.column * LEADER_START}
          y1={item.labelY}
          x2={item.column < 0 ? item.from : item.to}
          y2={item.y}
        />
      ))}
      <path className="body-figure-outline" d={outline} />
      {callouts.map((item) => (
        <g key={item.field} data-field={item.field}>
          <line className="body-figure-band" x1={item.from} x2={item.to} y1={item.y} y2={item.y} />
          <text
            className="body-figure-name"
            x={item.column * (HALF_WIDTH - 4)}
            y={item.labelY - 8}
            textAnchor={item.column < 0 ? 'start' : 'end'}
          >
            {item.name}
          </text>
          <text
            className="body-figure-value"
            x={item.column * (HALF_WIDTH - 4)}
            y={item.labelY + 25}
            textAnchor={item.column < 0 ? 'start' : 'end'}
          >
            {values[item.field]}
            <tspan className="body-figure-unit"> {unit}</tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}
