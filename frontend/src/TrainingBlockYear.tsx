import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { BLOCK_KIND_LABELS, BLOCK_KINDS, blockCode, blockKind } from './blockKinds';
import { Icon } from './Icon';
import {
  MONTHS,
  blockDay,
  blockOn,
  blockProgress,
  blockRange,
  daysLeftLabel,
} from './trainingBlocks';
import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import { LandscapeChartFrame } from './LandscapeChartFrame';
import type { BlockKind, BlockStats, TrainingBlock, TrainingBlocks } from './types';
import './trainingBlockYear.css';

type KindFilter = 'all' | BlockKind | 'none';
type Segment = {
  key: string;
  blockId?: string;
  label: string;
  name: string;
  start: string;
  end: string;
  kind: BlockKind | 'none' | 'earlier';
  planned?: boolean;
};

const workouts = (count: number | undefined) =>
  count === undefined ? '' : `${count.toLocaleString()} workout${count === 1 ? '' : 's'}`;
const joined = (...parts: string[]) => parts.filter(Boolean).join(' · ');
const kindClass = (block: TrainingBlock) => `kind-${blockKind(block) ?? 'none'}`;

/** Every stretch of history drawn on the year bar, including the planned rest of the block. */
function segments(config: TrainingBlocks, today: string): Segment[] {
  const first = config.blocks[0];
  const tomorrow = addDays(today, 1);
  const list: Segment[] = [];
  if (
    first &&
    config.history_start &&
    config.history_start < first.start_date &&
    config.earlier_workout_count
  ) {
    list.push({
      key: 'earlier',
      label: '',
      name: 'Before blocks',
      start: config.history_start,
      end: first.start_date,
      kind: 'earlier',
    });
  }
  for (const block of config.blocks) {
    const kind = blockKind(block) ?? 'none';
    const label = blockCode(config.blocks, block);
    list.push({
      key: block.id,
      blockId: block.id,
      label,
      name: block.name,
      start: block.start_date,
      end: block.end_date ?? tomorrow,
      kind,
    });
    if (!block.end_date && block.planned_end_date && block.planned_end_date >= tomorrow) {
      list.push({
        key: `${block.id}-planned`,
        blockId: block.id,
        label: '',
        name: `${block.name} (planned)`,
        start: tomorrow,
        end: addDays(block.planned_end_date, 1),
        kind,
        planned: true,
      });
    }
  }
  return list;
}

/** Mondays in the year, for the week lines of the detailed bar. */
function mondays(year: number) {
  const first = `${year}-01-01`;
  const offset = (8 - parseLocalDate(first).getDay()) % 7;
  const days: string[] = [];
  for (let day = addDays(first, offset); day < `${year + 1}-01-01`; day = addDays(day, 7)) {
    if (day.slice(8) !== '01') days.push(day);
  }
  return days;
}

/**
 * One calendar year with a dotted line at each month and the blocks coloured by type. With
 * `onSelect`, each block is a button; the detailed variant names blocks and marks every week.
 */
export function BlockYearBar({
  config,
  year,
  today,
  filter = 'all',
  selectedId = null,
  onSelect,
  detail = false,
}: {
  config: TrainingBlocks;
  year: number;
  today: string;
  filter?: KindFilter;
  selectedId?: string | null;
  onSelect?: (blockId: string) => void;
  detail?: boolean;
}) {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const total = daysBetween(start, end);
  const at = (day: string) => (Math.min(total, Math.max(0, daysBetween(start, day))) / total) * 100;
  const shown = segments(config, today).filter((item) => item.end > start && item.start < end);
  const actual = shown.filter((item) => !item.planned && item.kind !== 'earlier');
  const summary = actual.length
    ? `${year}: ${actual.map((item) => item.name).join(', ')}`
    : `${year}: no training blocks`;
  return (
    <div className={`training-block-year${detail ? ' detail' : ''}`}>
      <div
        className="training-block-year-bar"
        role={onSelect ? 'group' : 'img'}
        aria-label={onSelect ? `${year} timeline` : summary}
      >
        {detail &&
          mondays(year).map((day) => (
            <span key={day} className="training-block-year-week" style={{ left: `${at(day)}%` }} />
          ))}
        {MONTHS.slice(1).map((month, index) => (
          <span
            key={month}
            className="training-block-year-month"
            style={{ left: `${at(`${year}-${String(index + 2).padStart(2, '0')}-01`)}%` }}
          />
        ))}
        {shown.map((item) => {
          const left = at(item.start);
          const width = at(item.end) - left;
          const faded = filter !== 'all' && item.kind !== filter;
          const label = detail && width >= 9 ? item.name : width >= 4 ? item.label : '';
          const className = `training-block-year-segment kind-${item.kind}${item.planned ? ' planned' : ''}${faded ? ' faded' : ''}${item.blockId && item.blockId === selectedId ? ' selected' : ''}`;
          // Inset each block by a pixel so neighbours and the bar's rounded ends never clip it.
          const style = { left: `calc(${left}% + 1px)`, width: `max(3px, calc(${width}% - 2px))` };
          if (onSelect && item.blockId) {
            const blockId = item.blockId;
            const block = config.blocks.find((entry) => entry.id === blockId);
            return (
              <button
                key={item.key}
                type="button"
                className={className}
                style={style}
                tabIndex={item.planned ? -1 : undefined}
                aria-hidden={item.planned ? true : undefined}
                aria-pressed={item.planned ? undefined : blockId === selectedId}
                aria-label={
                  block
                    ? `${block.name}, ${blockRange(block.start_date, block.end_date)}`
                    : undefined
                }
                onClick={() => onSelect(blockId)}
              >
                {label}
              </button>
            );
          }
          return (
            <span key={item.key} className={className} style={style} title={item.name}>
              {label}
            </span>
          );
        })}
        {today >= start && today < end && (
          <span className="training-block-year-today" style={{ left: `${at(today)}%` }} />
        )}
      </div>
      <div className="training-block-year-axis" aria-hidden="true">
        {MONTHS.map((month) => (
          <span key={month}>{detail ? month : month.charAt(0)}</span>
        ))}
      </div>
    </div>
  );
}

/** Every year of blocks for the landscape view, newest first, with the chosen block's details. */
function BlockTimelineYears({
  config,
  today,
  filter,
  selectedId,
  onSelect,
}: {
  config: TrainingBlocks;
  today: string;
  filter: KindFilter;
  selectedId: string | null;
  onSelect: (blockId: string) => void;
}) {
  const first = firstYear(config, today);
  const last = lastYear(config, today);
  const years = Array.from({ length: last - first + 1 }, (_, index) => last - index);
  const selected = config.blocks.find((block) => block.id === selectedId);
  const kind = selected ? blockKind(selected) : null;
  return (
    <div className="training-block-full">
      <div className="training-block-full-years">
        {years.map((year) => (
          <section key={year} className="training-block-full-year" aria-label={String(year)}>
            <h4>{year}</h4>
            <BlockYearBar
              config={config}
              year={year}
              today={today}
              filter={filter}
              selectedId={selectedId}
              onSelect={onSelect}
              detail
            />
          </section>
        ))}
      </div>
      <p className="training-block-full-detail" aria-live="polite">
        {selected && (
          <>
            <span className={`training-block-kind-dot ${kindClass(selected)}`} aria-hidden="true" />
            <strong>{selected.name}</strong>
            <span>
              {joined(
                kind ? BLOCK_KIND_LABELS[kind] : '',
                blockRange(selected.start_date, selected.end_date),
                workouts(selected.workout_count),
              )}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function firstYear(config: TrainingBlocks, today: string) {
  return Number(
    [config.history_start, config.blocks[0]?.start_date]
      .filter((day): day is string => !!day)
      .sort()[0]
      ?.slice(0, 4) ?? today.slice(0, 4),
  );
}

function lastYear(config: TrainingBlocks, today: string) {
  return Math.max(
    Number(today.slice(0, 4)),
    Number(blockOn(config.blocks, today)?.planned_end_date?.slice(0, 4) ?? 0),
  );
}

/** The block in progress: its weeks so far and how it compares with the last block of its type. */
function BlockNowCard({
  config,
  block,
  today,
}: {
  config: TrainingBlocks;
  block: TrainingBlock;
  today: string;
}) {
  const { week, weeks, daysLeft } = blockProgress(block, today);
  const kind = blockKind(block);
  const previous =
    kind && kind !== 'deload'
      ? [...config.blocks]
          .filter((item) => item.start_date < block.start_date && blockKind(item) === kind)
          .pop()
      : undefined;
  const [stats, setStats] = useState<{ now: BlockStats; before: BlockStats } | null>(null);
  const previousId = previous?.id;
  useEffect(() => {
    if (!previousId) return;
    let live = true;
    Promise.all([api.trainingBlocks.summary(block.id), api.trainingBlocks.summary(previousId)])
      .then(([now, before]) => live && setStats({ now: now.block, before: before.block }))
      .catch(() => {
        // The comparison is extra detail; the card still shows the block's progress.
      });
    return () => {
      live = false;
    };
  }, [block.id, previousId]);

  const perWeek = (volume: number, days: number) => volume / Math.max(1, days / 7);
  const change =
    stats && previous
      ? (() => {
          const now = perWeek(stats.now.volume_kg, daysBetween(block.start_date, today) + 1);
          const before = perWeek(
            stats.before.volume_kg,
            daysBetween(previous.start_date, previous.end_date ?? today),
          );
          return before > 0 ? Math.round((now / before - 1) * 100) : null;
        })()
      : null;
  return (
    <div className="training-block-now">
      <header>
        <strong>
          <span className={`training-block-kind-dot ${kindClass(block)}`} aria-hidden="true" />
          {block.name}
        </strong>
        <em>
          {joined(
            weeks ? `Week ${week} of ${weeks}` : `Week ${week}`,
            daysLeft !== null ? daysLeftLabel(daysLeft) : '',
          )}
        </em>
      </header>
      {weeks && weeks <= 26 && (
        <div
          className={`training-block-weeks ${kindClass(block)}`}
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`Week ${week} of ${weeks}`}
        >
          {Array.from({ length: weeks }, (_, index) => (
            <span
              key={index}
              className={index + 1 < week ? 'done' : index + 1 === week ? 'now' : ''}
            >
              {weeks <= 12 ? `W${index + 1}` : ''}
            </span>
          ))}
        </div>
      )}
      {stats && previous && stats.before.workout_count > 0 && (
        <p className="training-block-vs">
          vs {previous.name}
          {previous.start_date.slice(0, 4) !== block.start_date.slice(0, 4)
            ? ` ${previous.start_date.slice(0, 4)}`
            : ''}
          :{' '}
          {change !== null && (
            <>
              <b className={change >= 0 ? 'up' : 'down'}>
                {change > 0 ? '+' : change < 0 ? '−' : ''}
                {Math.abs(change)}%
              </b>{' '}
              volume per week ·{' '}
            </>
          )}
          {stats.now.pr_count} PR{stats.now.pr_count === 1 ? '' : 's'} vs {stats.before.pr_count}
        </p>
      )}
    </div>
  );
}

/** The training blocks overview: one year at a time, filtered by block type. */
export function TrainingBlockYearView({
  config,
  today,
  busy,
  onEdit,
}: {
  config: TrainingBlocks;
  today: string;
  busy: boolean;
  onEdit: (block: TrainingBlock) => void;
}) {
  const thisYear = Number(today.slice(0, 4));
  const first = firstYear(config, today);
  const last = lastYear(config, today);
  const [year, setYear] = useState(thisYear);
  const [filter, setFilter] = useState<KindFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = blockOn(config.blocks, today);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  // A block belongs to the year it starts in; the bar still shows any overlap into this year.
  const inYear = config.blocks.filter((block) => block.start_date.slice(0, 4) === String(year));
  const counts = new Map<KindFilter, number>();
  for (const block of inYear) {
    const kind = blockKind(block) ?? 'none';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const kinds = ([...BLOCK_KINDS, 'none'] as const).filter((kind) => counts.has(kind));
  const active = filter === 'all' || counts.has(filter) ? filter : 'all';
  const listed = [...inYear]
    .reverse()
    .filter((block) => active === 'all' || (blockKind(block) ?? 'none') === active);
  const earlier =
    active === 'all' &&
    !!config.earlier_workout_count &&
    !!config.history_start &&
    !!config.blocks[0] &&
    config.history_start < yearEnd &&
    config.blocks[0].start_date > yearStart;
  const selected = config.blocks.some((block) => block.id === selectedId) ? selectedId : null;
  // Tapping a block on the timeline highlights it and brings its card into view.
  const choose = (blockId: string) => {
    const block = config.blocks.find((item) => item.id === blockId);
    if (!block || blockId === selected) {
      setSelectedId(null);
      return;
    }
    setSelectedId(blockId);
    setYear(Number(block.start_date.slice(0, 4)));
    if (filter !== 'all' && (blockKind(block) ?? 'none') !== filter) setFilter('all');
    requestAnimationFrame(() =>
      [...(listRef.current?.querySelectorAll<HTMLElement>('[data-block-id]') ?? [])]
        .find((item) => item.dataset.blockId === blockId)
        ?.scrollIntoView?.({ block: 'nearest' }),
    );
  };
  const years = (
    <div className="training-block-years">
      <button
        type="button"
        aria-label="Previous year"
        disabled={year <= first}
        onClick={() => setYear(year - 1)}
      >
        <Icon name="chevron-left" />
      </button>
      <div aria-live="polite">
        <strong>{year}</strong>
        <small>
          {inYear.length} block{inYear.length === 1 ? '' : 's'}
        </small>
      </div>
      <button
        type="button"
        aria-label="Next year"
        disabled={year >= last}
        onClick={() => setYear(year + 1)}
      >
        <Icon name="chevron-right" />
      </button>
    </div>
  );
  return (
    <div className="training-block-page">
      <LandscapeChartFrame
        title="Training timeline"
        controls={years}
        modal
        className="training-block-year-frame"
      >
        {(expanded) =>
          expanded ? (
            <BlockTimelineYears
              config={config}
              today={today}
              filter={active}
              selectedId={selected}
              onSelect={choose}
            />
          ) : (
            <BlockYearBar
              config={config}
              year={year}
              today={today}
              filter={active}
              selectedId={selected}
              onSelect={choose}
            />
          )
        }
      </LandscapeChartFrame>
      {kinds.length > 0 && (
        <div className="training-block-kinds" role="group" aria-label="Block type">
          <button type="button" aria-pressed={active === 'all'} onClick={() => setFilter('all')}>
            All
          </button>
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={active === kind}
              onClick={() => setFilter(active === kind ? 'all' : kind)}
            >
              <span className={`training-block-kind-dot kind-${kind}`} aria-hidden="true" />
              {kind === 'none' ? 'Other' : BLOCK_KIND_LABELS[kind]}
              <span className="training-block-kind-count">{counts.get(kind)}</span>
            </button>
          ))}
        </div>
      )}
      {current && !current.end_date && year === thisYear && (
        <section className="training-block-now-section" aria-label="Current block">
          <h3>Now</h3>
          <BlockNowCard key={current.id} config={config} block={current} today={today} />
        </section>
      )}
      <ul className="training-block-cards" aria-label={`${year} training blocks`} ref={listRef}>
        {listed.map((item) => (
          <li
            key={item.id}
            data-block-id={item.id}
            className={item.id === selected ? 'selected' : undefined}
          >
            <span className={`training-block-swatch ${kindClass(item)}`} aria-hidden="true" />
            <div>
              <strong>
                {item.name}
                {item.id === current?.id && <span className="badge">Current</span>}
              </strong>
              <small>{blockRange(item.start_date, item.end_date)}</small>
              {item.id === current?.id && item.planned_end_date && (
                <small className="training-block-plan">
                  {joined(
                    daysLeftLabel(blockProgress(item, today).daysLeft!),
                    `Planned end ${blockDay(item.planned_end_date, item.planned_end_date.slice(0, 4) !== today.slice(0, 4))}`,
                  )}
                </small>
              )}
              {item.workout_count !== undefined && <small>{workouts(item.workout_count)}</small>}
            </div>
            <button
              type="button"
              aria-label={`Edit ${item.name}`}
              disabled={busy}
              onClick={() => onEdit(item)}
            >
              Edit
            </button>
          </li>
        ))}
        {earlier && (
          <li className="earlier">
            <span className="training-block-swatch earlier" aria-hidden="true" />
            <div>
              <strong>Before blocks</strong>
              <small>{blockRange(config.history_start!, config.blocks[0].start_date)}</small>
              <small>{workouts(config.earlier_workout_count)}</small>
            </div>
          </li>
        )}
        {!listed.length && !earlier && <li className="empty">No blocks in {year}.</li>}
      </ul>
    </div>
  );
}

/** Type choice for a new or edited block, with the injury field for recovery blocks. */
export function BlockKindFields({
  kind,
  focus,
  onKind,
  onFocus,
}: {
  kind: BlockKind | null;
  focus: string;
  onKind: (kind: BlockKind) => void;
  onFocus: (focus: string) => void;
}) {
  return (
    <>
      <div className="training-block-starts kinds" role="radiogroup" aria-label="Type">
        <span aria-hidden="true">Type</span>
        {BLOCK_KINDS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={kind === item}
            onClick={() => onKind(item)}
          >
            <span className={`training-block-kind-dot kind-${item}`} aria-hidden="true" />
            <strong>{BLOCK_KIND_LABELS[item]}</strong>
          </button>
        ))}
      </div>
      {kind === 'recovery' && (
        <label>
          Injury or focus
          <input
            maxLength={60}
            value={focus}
            placeholder="e.g. Left shoulder"
            onChange={(event) => onFocus(event.target.value)}
          />
        </label>
      )}
    </>
  );
}
