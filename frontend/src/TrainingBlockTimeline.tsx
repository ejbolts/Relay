import { MONTHS } from './trainingBlocks';
import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import type { TrainingBlocks } from './types';
import { localDate } from './utils';

export const TONES = 4;

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
  const segments = [
    ...(earlierStart
      ? [{ id: 'earlier', name: 'Before blocks', start: earlierStart, end: first.start_date }]
      : []),
    ...config.blocks.map((block) => ({
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
          const tone =
            item.id === 'earlier'
              ? 'earlier'
              : item.id === currentId
                ? 'current'
                : `tone-${index % TONES}`;
          return (
            <span
              key={item.id}
              className={`training-block-segment ${tone}`}
              style={{ flex: `${Math.max(1, daysBetween(item.start, item.end))} 1 0` }}
              title={item.name}
            >
              {item.id === 'earlier' ? 'Before' : item.name}
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
