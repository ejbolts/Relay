import type { CSSProperties } from 'react';
import { blockInk, validBlockColor } from './blockColors';
import { MONTHS, blockDay, blockProgress } from './trainingBlocks';
import './trainingBlockYear.css';
import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import type { TrainingBlocks } from './types';
import { localDate } from './utils';

export const TONES = 4;
/** The strip names this many recent blocks; older ones share one "Earlier" segment. */
export const TIMELINE_BLOCKS = 6;

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
  const first = config.blocks[0];
  if (!first) return null;
  // A running block with a planned end is drawn to that end, with a line marking today.
  const current = config.blocks.find((block) => block.id === currentId);
  const plannedEnd =
    current && !current.end_date && current.planned_end_date && current.planned_end_date >= today
      ? current.planned_end_date
      : null;
  const progress = plannedEnd && current ? blockProgress(current, today).progress : null;
  const earlierStart =
    config.history_start && config.history_start < first.start_date && config.earlier_workout_count
      ? config.history_start
      : null;
  // With many blocks, only the most recent are named so each stays readable.
  const shown = config.blocks.slice(-TIMELINE_BLOCKS);
  const hidden = config.blocks.length - shown.length;
  const earlierName = hidden
    ? `${hidden} earlier block${hidden === 1 ? '' : 's'}${earlierStart ? ' and history' : ''}`
    : 'Before blocks';
  const segments = [
    ...(earlierStart || hidden
      ? [
          {
            id: 'earlier',
            name: earlierName,
            start: earlierStart ?? first.start_date,
            end: shown[0].start_date,
          },
        ]
      : []),
    ...shown.map((block) => ({
      id: block.id,
      name: block.name,
      start: block.start_date,
      end:
        block.end_date ??
        (block.id === currentId && plannedEnd ? addDays(plannedEnd, 1) : addDays(today, 1)),
    })),
  ];
  const origin = segments[0].start;
  return (
    <div className="training-block-timeline">
      <div
        className="training-block-bar"
        role="img"
        aria-label={`Timeline: ${segments.map((item) => item.name).join(', ')}`}
      >
        {segments.map((item) => {
          const index = config.blocks.findIndex((block) => block.id === item.id);
          const tone =
            item.id === 'earlier'
              ? 'earlier'
              : item.id === currentId
                ? 'current'
                : `tone-${index % TONES}`;
          // A block's chosen colour replaces its tone; the current block keeps an outline.
          const color = index >= 0 ? validBlockColor(config.blocks[index].color) : null;
          const marked = item.id === currentId && progress !== null;
          return (
            <span
              key={item.id}
              className={`training-block-segment ${tone}${color ? ' custom' : ''}${marked ? ' has-today' : ''}`}
              style={
                {
                  flex: `${Math.max(1, daysBetween(item.start, item.end))} 1 0`,
                  ...(color ? { backgroundColor: color, color: blockInk(color) } : {}),
                  ...(marked ? { '--today': `${progress * 100}%` } : {}),
                } as CSSProperties
              }
              title={item.name}
            >
              {item.id === 'earlier' ? (hidden ? 'Earlier' : 'Before') : item.name}
              {marked && <i className="training-block-today" aria-hidden="true" />}
            </span>
          );
        })}
      </div>
      <div className="training-block-axis" aria-hidden="true">
        <span>{`${MONTHS[parseLocalDate(origin).getMonth()]} ${origin.slice(0, 4)}`}</span>
        <span>
          {plannedEnd
            ? blockDay(plannedEnd, plannedEnd.slice(0, 4) !== today.slice(0, 4))
            : 'Today'}
        </span>
      </div>
    </div>
  );
}
