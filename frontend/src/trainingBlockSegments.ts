import { blockColor, blockInk, validBlockColor } from './blockColors';
import { MONTHS, blockDay, blockOn, blockProgress } from './trainingBlocks';
import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import type { TrainingBlock, TrainingBlocks } from './types';

// How training blocks divide the logged history: Home's proportional strip, and the overview's
// bar of every block through the years.

/** Tones for blocks without a chosen colour, in turn. */
export const TONES = 4;
/** The strip names this many recent blocks; older ones share one "Earlier" segment. */
export const TIMELINE_BLOCKS = 6;

export interface StripSegment {
  id: string;
  name: string;
  /** What the segment shows: the block's name, or Earlier or Before. */
  label: string;
  /** Days, for its share of the strip. */
  days: number;
  tone: 'earlier' | 'current' | `tone-${number}`;
  /** The block's chosen colour, which replaces its tone, with the ink to write on it. */
  color: string | null;
  ink: string | null;
  /** The running block's segment, with today marked `progress` of the way along it. */
  marked: boolean;
}

/**
 * Home's strip: the most recent blocks in proportion, after one segment for older blocks and the
 * history before them. A running block with a planned end is drawn to that end, with today
 * marked along it. Null before the first block.
 */
export function blockStrip(config: TrainingBlocks, currentId: string | undefined, today: string) {
  const first = config.blocks[0];
  if (!first) return null;
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
  const spans = [
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
  const origin = spans[0].start;
  const segments = spans.map((item): StripSegment => {
    const index = config.blocks.findIndex((block) => block.id === item.id);
    const color = index >= 0 ? validBlockColor(config.blocks[index].color) : null;
    return {
      id: item.id,
      name: item.name,
      label: item.id === 'earlier' ? (hidden ? 'Earlier' : 'Before') : item.name,
      days: Math.max(1, daysBetween(item.start, item.end)),
      tone:
        item.id === 'earlier'
          ? 'earlier'
          : item.id === currentId
            ? 'current'
            : `tone-${index % TONES}`,
      color,
      ink: color ? blockInk(color) : null,
      marked: item.id === currentId && progress !== null,
    };
  });
  return {
    segments,
    /** How far along its planned length today is, for the marked segment. */
    progress,
    label: `Timeline: ${segments.map((item) => item.name).join(', ')}`,
    startLabel: `${MONTHS[parseLocalDate(origin).getMonth()]} ${origin.slice(0, 4)}`,
    endLabel: plannedEnd
      ? blockDay(plannedEnd, plannedEnd.slice(0, 4) !== today.slice(0, 4))
      : 'Today',
  };
}

/** A stretch of history on the overview's bar. */
export interface YearSegment {
  key: string;
  blockId?: string;
  name: string;
  start: string;
  /** Exclusive. */
  end: string;
  /** Null for the history before the first block. */
  color: string | null;
  /** The rest of the running block's planned length, after today. */
  planned?: boolean;
}

/** Every stretch of history drawn on the overview's bar, including the planned rest of a block. */
export function blockYearSegments(config: TrainingBlocks, today: string): YearSegment[] {
  const first = config.blocks[0];
  const tomorrow = addDays(today, 1);
  const list: YearSegment[] = [];
  if (
    first &&
    config.history_start &&
    config.history_start < first.start_date &&
    config.earlier_workout_count
  ) {
    list.push({
      key: 'earlier',
      name: 'Before blocks',
      start: config.history_start,
      end: first.start_date,
      color: null,
    });
  }
  for (const block of config.blocks) {
    const color = blockColor(config.blocks, block, today);
    list.push({
      key: block.id,
      blockId: block.id,
      name: block.name,
      start: block.start_date,
      end: block.end_date ?? tomorrow,
      color,
    });
    if (!block.end_date && block.planned_end_date && block.planned_end_date >= tomorrow) {
      list.push({
        key: `${block.id}-planned`,
        blockId: block.id,
        name: `${block.name} (planned)`,
        start: tomorrow,
        end: addDays(block.planned_end_date, 1),
        color,
        planned: true,
      });
    }
  }
  return list;
}

/** The first year with history or a block. */
export function firstBlockYear(config: TrainingBlocks, today: string) {
  return Number(
    [config.history_start, config.blocks[0]?.start_date]
      .filter((day): day is string => !!day)
      .sort()[0]
      ?.slice(0, 4) ?? today.slice(0, 4),
  );
}

/** This year, or the year the running block's planned end falls in when that is later. */
export function lastBlockYear(config: TrainingBlocks, today: string) {
  return Math.max(
    Number(today.slice(0, 4)),
    Number(blockOn(config.blocks, today)?.planned_end_date?.slice(0, 4) ?? 0),
  );
}

/**
 * The overview's list for a year: the blocks starting in it, newest first, and whether the
 * history before the first block reaches into it.
 */
export function blocksInYear(config: TrainingBlocks, year: number) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  // A block belongs to the year it starts in; the bar still shows any overlap into this year.
  const inYear = config.blocks.filter((block) => block.start_date.slice(0, 4) === String(year));
  return {
    count: inYear.length,
    listed: [...inYear].reverse(),
    earlier:
      !!config.earlier_workout_count &&
      !!config.history_start &&
      !!config.blocks[0] &&
      config.history_start < yearEnd &&
      config.blocks[0].start_date > yearStart,
  };
}

/** A segment's place within one year, as fractions of the year from 0 to 1, or null if outside. */
export function segmentInYear(segment: Pick<YearSegment, 'start' | 'end'>, year: number) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  if (segment.end <= yearStart || segment.start >= yearEnd) return null;
  const length = daysBetween(yearStart, yearEnd);
  const from = Math.max(0, daysBetween(yearStart, segment.start));
  const to = Math.min(length, daysBetween(yearStart, segment.end));
  return { left: from / length, width: (to - from) / length };
}

/** "12 workouts", or nothing before the server has counted them. */
export const workoutCountLabel = (count: number | undefined) =>
  count === undefined ? '' : `${count.toLocaleString()} workout${count === 1 ? '' : 's'}`;

/** Details joined with dots, leaving out empty ones. */
export const joinedDetails = (...parts: string[]) => parts.filter(Boolean).join(' · ');

/** The block the overview highlights after a tap: tapping the highlighted one clears it. */
export function toggledBlock(blocks: TrainingBlock[], selected: string | null, blockId: string) {
  return !blocks.some((item) => item.id === blockId) || blockId === selected ? null : blockId;
}
