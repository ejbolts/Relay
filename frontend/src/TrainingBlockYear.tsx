import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from './api';
import { BLOCK_COLOR_CHOICES, blockColor } from './blockColors';
import { Icon } from './Icon';
import { LandscapeChartFrame } from './LandscapeChartFrame';
import {
  MONTHS,
  blockDay,
  blockOn,
  blockProgress,
  blockRange,
  daysLeftLabel,
} from './trainingBlocks';
import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import type { BlockStats, TrainingBlock, TrainingBlocks } from './types';
import './trainingBlockYear.css';

type Segment = {
  key: string;
  blockId?: string;
  name: string;
  start: string;
  end: string;
  /** Null for the history before the first block. */
  color: string | null;
  planned?: boolean;
};

const workouts = (count: number | undefined) =>
  count === undefined ? '' : `${count.toLocaleString()} workout${count === 1 ? '' : 's'}`;
const joined = (...parts: string[]) => parts.filter(Boolean).join(' · ');
const colorStyle = (color: string): CSSProperties => ({ '--block-color': color }) as CSSProperties;

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

/** Width of the timeline's scroller, kept current as it resizes. */
function useScrollerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  // jsdom and the first frame have no layout; a phone-sized width keeps the maths usable.
  return width || 320;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Every block on one continuous timeline. Swipe to scroll through the years, and pinch (or
 * Ctrl + wheel, or + and -) to zoom; week lines appear once weeks are wide enough to read.
 */
export function ScrollTimeline({
  config,
  today,
  detail = false,
  selectedId = null,
  onSelect,
  onCentreYear,
  scrollRequest = null,
}: {
  config: TrainingBlocks;
  today: string;
  detail?: boolean;
  selectedId?: string | null;
  onSelect?: (blockId: string) => void;
  /** Reports the year in the middle of the view as the timeline scrolls. */
  onCentreYear?: (year: number) => void;
  /** Scrolls so the date is at the left edge; a new key repeats the request. */
  scrollRequest?: { date: string; key: number } | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const width = useScrollerWidth(scroller);
  const first = firstYear(config, today);
  const last = lastYear(config, today);
  const start = `${first}-01-01`;
  const end = `${last + 1}-01-01`;
  const total = daysBetween(start, end);
  // Zoom is pixels per day: from the whole history in view to about two weeks across.
  const minZoom = width / total;
  const maxZoom = width / 14;
  const [chosenZoom, setChosenZoom] = useState<number | null>(null);
  const zoom = clamp(chosenZoom ?? width / 365, minZoom, maxZoom);
  const x = (day: string) => clamp(daysBetween(start, day), 0, total) * zoom;
  const pendingScroll = useRef<number | null>(null);
  const reportedYear = useRef<number | null>(null);
  const placed = useRef(false);
  const frame = useRef(0);

  // Zoom about a point on screen, keeping the date under it in place.
  const zoomAt = (next: number, focal = width / 2) => {
    const element = scroller.current;
    const scrollLeft = element?.scrollLeft ?? 0;
    const target = clamp(next, minZoom, maxZoom);
    pendingScroll.current = ((scrollLeft + focal) / zoom) * target - focal;
    setChosenZoom(target);
  };
  const latest = useRef({ zoomAt, zoom });
  useEffect(() => {
    latest.current = { zoomAt, zoom };
  });

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (pendingScroll.current !== null) {
      element.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    } else if (!placed.current && element.clientWidth) {
      // Open with today a little right of centre, so recent blocks lead into it.
      placed.current = true;
      element.scrollLeft = x(today) - element.clientWidth * 0.6;
    }
  });

  useEffect(() => {
    const element = scroller.current;
    if (!element || !scrollRequest) return;
    const left = x(scrollRequest.date);
    if (element.scrollTo) element.scrollTo({ left, behavior: 'smooth' });
    else element.scrollLeft = left;
    // Only a new request scrolls; zooming keeps the reader's place instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest?.key]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let pinch: { distance: number; zoom: number } | null = null;
    const spread = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2)
        pinch = { distance: spread(event.touches), zoom: latest.current.zoom };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const middle = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      latest.current.zoomAt(
        pinch.zoom * (spread(event.touches) / Math.max(1, pinch.distance)),
        middle - element.getBoundingClientRect().left,
      );
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    // Trackpad pinches arrive as Ctrl + wheel.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      latest.current.zoomAt(
        latest.current.zoom * Math.exp(-event.deltaY * 0.01),
        event.clientX - element.getBoundingClientRect().left,
      );
    };
    // Safari's own pinch would zoom the page instead of the timeline.
    const stopGesture = (event: Event) => event.preventDefault();
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('gesturestart', stopGesture);
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', stopGesture);
    };
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const reportCentre = () => {
    if (!onCentreYear) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const element = scroller.current;
      if (!element) return;
      const centre = addDays(
        start,
        Math.floor((element.scrollLeft + element.clientWidth / 2) / zoom),
      );
      const year = Number(centre.slice(0, 4));
      if (year !== reportedYear.current && year >= first && year <= last) {
        reportedYear.current = year;
        onCentreYear(year);
      }
    });
  };

  // Gridlines and labels: years always, months when there is room, weeks once readable.
  const monthWidth = zoom * 30.4;
  const lines: { key: string; left: number; kind: 'year' | 'month' | 'week' }[] = [];
  const labels: { key: string; left: number; text: string; year: boolean }[] = [];
  for (let year = first; year <= last; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const day = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      if (month === 0) {
        if (year > first) lines.push({ key: day, left: x(day), kind: 'year' });
        labels.push({ key: day, left: x(day), text: String(year), year: true });
      } else if (monthWidth >= 6) {
        lines.push({ key: day, left: x(day), kind: 'month' });
        // Initials leave no room after a year label, so February gives way to the year.
        if (monthWidth >= 16 && (monthWidth >= 34 || month > 1))
          labels.push({
            key: day,
            left: x(day),
            text: monthWidth >= 34 ? MONTHS[month] : MONTHS[month].charAt(0),
            year: false,
          });
      }
    }
  }
  if (zoom * 7 >= 12) {
    const offset = (8 - parseLocalDate(start).getDay()) % 7;
    for (let day = addDays(start, offset); day < end; day = addDays(day, 7)) {
      if (day.slice(8) !== '01') lines.push({ key: `w${day}`, left: x(day), kind: 'week' });
    }
  }
  const shown = segments(config, today);
  return (
    <div
      ref={scroller}
      className={`training-block-scroll${detail ? ' detail' : ''}`}
      role="group"
      aria-label="Training timeline"
      tabIndex={0}
      onScroll={reportCentre}
      onKeyDown={(event) => {
        if (event.key === '+' || event.key === '=') zoomAt(zoom * 1.5);
        else if (event.key === '-' || event.key === '_') zoomAt(zoom / 1.5);
        else return;
        event.preventDefault();
      }}
    >
      <div className="training-block-scroll-track" style={{ width: total * zoom }}>
        <div className="training-block-year-bar">
          {lines.map((line) => (
            <span
              key={line.key}
              className={`training-block-scroll-line ${line.kind}`}
              style={{ left: line.left }}
            />
          ))}
          {shown.map((item) => {
            const left = x(item.start);
            const span = x(item.end) - left;
            const className = `training-block-year-segment${item.color ? '' : ' earlier'}${item.planned ? ' planned' : ''}${item.blockId && item.blockId === selectedId ? ' selected' : ''}`;
            // Inset each block by a pixel so neighbours and the bar's ends never clip it.
            const style = {
              ...(item.color ? colorStyle(item.color) : {}),
              left: left + 1,
              width: Math.max(3, span - 2),
            };
            const label = !item.planned && span >= 36 ? item.name : '';
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
            <span className="training-block-year-today" style={{ left: x(today) }} />
          )}
        </div>
        <div className="training-block-scroll-axis" aria-hidden="true">
          {labels.map((label) => (
            <span key={label.key} className={label.year ? 'year' : ''} style={{ left: label.left }}>
              {label.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The landscape view: the timeline at full size, with the chosen block's details. */
function BlockTimelineFull({
  config,
  today,
  selectedId,
  onSelect,
}: {
  config: TrainingBlocks;
  today: string;
  selectedId: string | null;
  onSelect: (blockId: string) => void;
}) {
  const selected = config.blocks.find((block) => block.id === selectedId);
  return (
    <div className="training-block-full">
      <ScrollTimeline
        config={config}
        today={today}
        detail
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <p className="training-block-full-detail" aria-live="polite">
        {selected && (
          <>
            <span
              className="training-block-dot"
              style={colorStyle(blockColor(config.blocks, selected, today))}
              aria-hidden="true"
            />
            <strong>{selected.name}</strong>
            <span>
              {joined(
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

/** The block in progress: its weeks so far and how it compares with the last regular block. */
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
  const previous = block.deload
    ? undefined
    : [...config.blocks].filter((item) => item.start_date < block.start_date && !item.deload).pop();
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
  const color = colorStyle(blockColor(config.blocks, block, today));
  return (
    <div className="training-block-now" style={color}>
      <header>
        <strong>
          <span className="training-block-dot" aria-hidden="true" />
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
          className="training-block-weeks"
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

/** The training blocks overview: one year at a time. */
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<{ date: string; key: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The arrows move the timeline to a year; scrolling it moves the year and list along.
  const goToYear = (next: number) => {
    setYear(next);
    setScrollRequest((request) => ({ date: `${next}-01-01`, key: (request?.key ?? 0) + 1 }));
  };
  const current = blockOn(config.blocks, today);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  // A block belongs to the year it starts in; the bar still shows any overlap into this year.
  const inYear = config.blocks.filter((block) => block.start_date.slice(0, 4) === String(year));
  const listed = [...inYear].reverse();
  const earlier =
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
        onClick={() => goToYear(year - 1)}
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
        onClick={() => goToYear(year + 1)}
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
        iconOnly
        className="training-block-year-frame"
      >
        {(expanded) =>
          expanded ? (
            <BlockTimelineFull
              config={config}
              today={today}
              selectedId={selected}
              onSelect={choose}
            />
          ) : (
            <ScrollTimeline
              config={config}
              today={today}
              selectedId={selected}
              onSelect={choose}
              onCentreYear={setYear}
              scrollRequest={scrollRequest}
            />
          )
        }
      </LandscapeChartFrame>
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
            <span
              className="training-block-swatch"
              style={colorStyle(blockColor(config.blocks, item, today))}
              aria-hidden="true"
            />
            <div>
              <strong>
                {item.name}
                {item.id === current?.id && <span className="badge">Current</span>}
                {item.deload && <span className="badge deload">Deload</span>}
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

/** Colour choice for a block: automatic, or one of the palette's colours. */
export function BlockColorField({
  value,
  automatic,
  onChange,
}: {
  value: string | null;
  automatic: string;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="training-block-colours" role="radiogroup" aria-label="Colour">
      <span aria-hidden="true">Colour</span>
      <div className="training-block-swatches">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="Automatic colour"
          className="automatic"
          style={colorStyle(automatic)}
          onClick={() => onChange(null)}
        >
          Auto
        </button>
        {BLOCK_COLOR_CHOICES.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value?.toLowerCase() === color}
            aria-label={color}
            style={colorStyle(color)}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}
