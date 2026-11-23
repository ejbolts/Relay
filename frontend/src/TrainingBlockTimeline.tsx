import type { CSSProperties } from 'react';
import { blockStrip } from './trainingBlockSegments';
import './trainingBlockYear.css';
import type { TrainingBlocks } from './types';
import { localDate } from './utils';

export { TIMELINE_BLOCKS, TONES } from './trainingBlockSegments';

/** Proportional strip showing how blocks divide the logged history. */
export function BlockTimeline({
  config,
  currentId,
  today = localDate(),
}: {
  config: TrainingBlocks;
  currentId?: string;
  today?: string;
}) {
  const strip = blockStrip(config, currentId, today);
  if (!strip) return null;
  return (
    <div className="training-block-timeline">
      <div className="training-block-bar" role="img" aria-label={strip.label}>
        {strip.segments.map((item) => (
          <span
            key={item.id}
            className={`training-block-segment ${item.tone}${item.color ? ' custom' : ''}${item.marked ? ' has-today' : ''}`}
            style={
              {
                flex: `${item.days} 1 0`,
                // A block's chosen colour replaces its tone; the current block keeps an outline.
                ...(item.color ? { backgroundColor: item.color, color: item.ink } : {}),
                ...(item.marked ? { '--today': `${strip.progress! * 100}%` } : {}),
              } as CSSProperties
            }
            title={item.name}
          >
            {item.label}
            {item.marked && <i className="training-block-today" aria-hidden="true" />}
          </span>
        ))}
      </div>
      <div className="training-block-axis" aria-hidden="true">
        <span>{strip.startLabel}</span>
        <span>{strip.endLabel}</span>
      </div>
    </div>
  );
}
