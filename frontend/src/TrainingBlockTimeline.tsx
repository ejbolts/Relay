import { blockKind } from './blockKinds';
import { MONTHS } from './trainingBlocks';
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
}: {
  config: TrainingBlocks;
  currentId?: string;
}) {
  const today = localDate();
  const first = config.blocks[0];
  if (!first) return null;
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
      end: block.end_date ?? addDays(today, 1),
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
          // Typed blocks share the training blocks dialog's colours; untyped ones keep a tone.
          const kind = index >= 0 ? blockKind(config.blocks[index]) : null;
          const tone =
            item.id === 'earlier'
              ? 'earlier'
              : [
                  item.id === currentId ? 'current' : '',
                  kind ? `kind-${kind}` : item.id === currentId ? '' : `tone-${index % TONES}`,
                ]
                  .filter(Boolean)
                  .join(' ');
          return (
            <span
              key={item.id}
              className={`training-block-segment ${tone}`}
              style={{ flex: `${Math.max(1, daysBetween(item.start, item.end))} 1 0` }}
              title={item.name}
            >
              {item.id === 'earlier' ? (hidden ? 'Earlier' : 'Before') : item.name}
            </span>
          );
        })}
      </div>
      <div className="training-block-axis" aria-hidden="true">
        <span>{`${MONTHS[parseLocalDate(origin).getMonth()]} ${origin.slice(0, 4)}`}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
