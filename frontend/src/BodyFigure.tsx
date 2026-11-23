import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { BODY_FIGURES, bodyFigurePath, type BodyFigureKind } from './bodyFigureShapes';
import {
  EDITOR_WIDTH,
  FIGURE_HALF_WIDTH,
  FIGURE_HEIGHT,
  FIGURE_TOP,
  LABEL_GAP,
  LABEL_WIDTH,
  LEADER_START,
  bodyFigureCallouts,
  bodyFigureLabelName,
} from './bodyFigureLayout';
import type { BodySizeField } from './bodySizes';

const HALF_WIDTH = FIGURE_HALF_WIDTH;
const TOP = FIGURE_TOP;
const HEIGHT = FIGURE_HEIGHT;

/** Places an HTML element over the drawing, given in the figure's own units. */
const overlay = (x: number, y: number, width: number): CSSProperties => ({
  left: `${((x + HALF_WIDTH) / (HALF_WIDTH * 2)) * 100}%`,
  top: `${((y - TOP) / HEIGHT) * 100}%`,
  width: `${(width / (HALF_WIDTH * 2)) * 100}%`,
});

/**
 * A body outline with every measurement drawn across the part it measures and labelled beside
 * it; one not measured yet has an empty label. Each label is a button. While `editing` names one,
 * a number box takes the place of its value so it can be typed straight onto the figure.
 */
export function BodyFigure({
  kind,
  values,
  carried,
  unit,
  onPick,
  editing = null,
  editValue = '',
  invalid = false,
  onCommit,
  onCancel,
}: {
  kind: BodyFigureKind;
  /** Display values by field; a field left out has an empty label. */
  values: Partial<Record<BodySizeField, string>>;
  /** Values from an earlier entry than the one shown, drawn muted. */
  carried?: ReadonlySet<BodySizeField>;
  unit: string;
  /** Makes each label a button. Without it the figure only shows what was measured. */
  onPick?: (field: BodySizeField) => void;
  /** The measurement being typed on the figure, if any. */
  editing?: BodySizeField | null;
  /** What the number box starts with. */
  editValue?: string;
  invalid?: boolean;
  /** Called with the typed text; returns whether the box can close. */
  onCommit?: (field: BodySizeField, text: string) => boolean;
  onCancel?: () => void;
}) {
  const shape = BODY_FIGURES[kind];
  const outline = useMemo(() => bodyFigurePath(shape.half), [shape]);
  const extras = shape.extras ?? [];
  // Mask ids are unique per drawing, since several figures can be on the page at once.
  const maskId = `body-figure-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const frame = { x: -HALF_WIDTH, y: TOP, width: HALF_WIDTH * 2, height: HEIGHT };
  const labels = useRef(new Map<BodySizeField, SVGGElement>());
  const callouts = bodyFigureCallouts(kind, (field) => Boolean(onPick || values[field]));
  const active = callouts.find((item) => item.field === editing);
  return (
    <div className="body-figure-frame">
      <svg
        className="body-figure"
        data-figure={kind}
        viewBox={`${-HALF_WIDTH} ${TOP} ${HALF_WIDTH * 2} ${HEIGHT}`}
        role="group"
        aria-label="Measurements on the body"
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
        {extras.map((d) => (
          <path key={d} className="body-figure-extra" d={d} />
        ))}
        {/* Extras such as a bun join the outline as one shape: each edge is hidden where it
            runs inside the other, so only the outer edge of the join keeps its line. */}
        {extras.length > 0 && (
          <defs>
            <mask id={`${maskId}-outline`} maskUnits="userSpaceOnUse" {...frame}>
              <rect {...frame} fill="white" />
              {extras.map((d) => (
                <path key={d} d={d} fill="black" />
              ))}
            </mask>
            <mask id={`${maskId}-extras`} maskUnits="userSpaceOnUse" {...frame}>
              <rect {...frame} fill="white" />
              <path d={outline} fill="black" />
            </mask>
          </defs>
        )}
        <path
          className="body-figure-edge"
          d={outline}
          mask={extras.length > 0 ? `url(#${maskId}-outline)` : undefined}
        />
        {extras.map((d) => (
          <path key={d} className="body-figure-edge" d={d} mask={`url(#${maskId}-extras)`} />
        ))}
        {shape.hairline && <path className="body-figure-hairline" d={shape.hairline} />}
        {callouts.map((item) => {
          const value = values[item.field];
          const earlier = Boolean(value && carried?.has(item.field));
          return (
            <g
              key={item.field}
              ref={(node) => {
                if (node) labels.current.set(item.field, node);
                else labels.current.delete(item.field);
              }}
              className={`body-figure-label${value ? '' : ' empty'}${earlier ? ' carried' : ''}`}
              data-field={item.field}
              {...(onPick && {
                role: 'button',
                tabIndex: 0,
                'aria-label': bodyFigureLabelName(item.name, value, earlier, unit),
                onClick: () => onPick(item.field),
                onKeyDown: (event: KeyboardEvent) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onPick(item.field);
                },
              })}
            >
              {onPick && (
                <rect
                  className="body-figure-hit"
                  x={item.column < 0 ? -HALF_WIDTH : HALF_WIDTH - LABEL_WIDTH}
                  y={item.labelY + 2 - (LABEL_GAP - 6) / 2}
                  width={LABEL_WIDTH}
                  height={LABEL_GAP - 6}
                  rx={16}
                />
              )}
              <line
                className="body-figure-band"
                x1={item.from}
                x2={item.to}
                y1={item.y}
                y2={item.y}
              />
              <text
                className="body-figure-name"
                x={item.column * (HALF_WIDTH - 12)}
                y={item.labelY - 8}
                textAnchor={item.column < 0 ? 'start' : 'end'}
              >
                {item.name}
              </text>
              {value && item.field !== editing && (
                <text
                  className="body-figure-value"
                  x={item.column * (HALF_WIDTH - 12)}
                  y={item.labelY + 25}
                  textAnchor={item.column < 0 ? 'start' : 'end'}
                >
                  {value}
                  <tspan className="body-figure-unit"> {unit}</tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {active && onCommit && (
        <InlineEditor
          key={active.field}
          name={active.name}
          unit={unit}
          initial={editValue}
          invalid={invalid}
          side={active.column < 0 ? 'left' : 'right'}
          style={overlay(
            active.column < 0 ? -HALF_WIDTH + 4 : HALF_WIDTH - 4 - EDITOR_WIDTH,
            active.labelY - 4,
            EDITOR_WIDTH,
          )}
          onCommit={(text) => onCommit(active.field, text)}
          onCancel={() => onCancel?.()}
          onDone={() => labels.current.get(active.field)?.focus()}
        />
      )}
    </div>
  );
}

/** The number box for one measurement: Enter or leaving it saves, Escape puts it away. */
function InlineEditor({
  name,
  unit,
  initial,
  invalid,
  side,
  style,
  onCommit,
  onCancel,
  onDone,
}: {
  name: string;
  unit: string;
  initial: string;
  invalid: boolean;
  side: 'left' | 'right';
  style: CSSProperties;
  onCommit: (text: string) => boolean;
  onCancel: () => void;
  /** Hands focus back to the label after finishing from the keyboard. */
  onDone: () => void;
}) {
  const [text, setText] = useState(initial);
  // Set once the box has finished, so the blur from moving focus does not save a second time.
  const finished = useRef(false);
  const focused = useRef(false);
  return (
    <span className={`body-figure-editor ${side}`} style={style}>
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        aria-label={`${name} (${unit})`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'body-figure-error' : undefined}
        value={text}
        ref={(node) => {
          if (!node || focused.current) return;
          focused.current = true;
          node.focus();
          node.select();
        }}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finished.current = true;
            onCancel();
            onDone();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (onCommit(text)) {
              finished.current = true;
              onDone();
            }
          }
        }}
        onBlur={() => {
          if (!finished.current && onCommit(text)) finished.current = true;
        }}
      />
      <span aria-hidden="true">{unit}</span>
    </span>
  );
}
