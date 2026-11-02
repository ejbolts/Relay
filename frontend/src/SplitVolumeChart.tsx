import { useId, type CSSProperties } from 'react';
import { HelpPopup } from './HelpPopup';
import { formatVolume, plannedWeeklyVolume, targetStatus, type TargetStatus } from './splitTargets';
import type { RoutineDay } from './types';
import './splitVolume.css';

/** The selection key for the cardio row. */
export const CARDIO_ROW = '__cardio';

const MARK: Record<TargetStatus, string> = { met: '✓', close: '~', under: '!' };
const LABEL: Record<TargetStatus, string> = {
  met: 'on target',
  close: 'nearly there',
  under: 'under target',
};

interface Row {
  key: string;
  name: string;
  value: number;
  goal: number | null;
  unit: 'sets' | 'min';
  status: TargetStatus | null;
}

/** Sets keep one decimal place for part credits; cardio shows whole minutes. */
const shown = (row: Row) =>
  row.unit === 'min' ? Math.round(row.value).toLocaleString() : formatVolume(row.value);

function describe(row: Row) {
  const unit = row.unit === 'min' ? 'minutes' : 'sets';
  return row.goal == null
    ? `${row.name}: ${shown(row)} ${unit} a week`
    : `${row.name}: ${shown(row)} of ${row.goal} ${unit} a week, ${LABEL[row.status!]}`;
}

function Mark({ status }: { status: TargetStatus | null }) {
  return (
    <i className={`split-volume-mark is-${status ?? 'none'}`} aria-hidden="true">
      {status ? MARK[status] : '·'}
    </i>
  );
}

function VolumeRow({
  row,
  selected,
  onSelect,
}: {
  row: Row;
  selected: boolean;
  onSelect: (key: string | null) => void;
}) {
  const scale = (row.goal ?? row.value) * 1.6 || 1;
  return (
    <li className={row.key === CARDIO_ROW ? 'is-cardio' : undefined}>
      <button
        type="button"
        className="split-volume-row"
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : row.key)}
      >
        <span className="sr-only">{describe(row)}</span>
        <Mark status={row.status} />
        <span className="split-volume-name" aria-hidden="true">
          {row.name}
        </span>
        <span
          className="split-volume-track"
          aria-hidden="true"
          style={
            {
              '--fill': `${Math.min(100, (row.value / scale) * 100)}%`,
              '--goal': `${((row.goal ?? 0) / scale) * 100}%`,
            } as CSSProperties
          }
        >
          <span className={`split-volume-fill is-${row.status ?? 'none'}`} />
          {row.goal != null && <span className="split-volume-goal" />}
        </span>
        <span className="split-volume-value" aria-hidden="true">
          <b>{shown(row)}</b>
          {row.goal != null ? ` / ${row.goal}` : ''}
          {row.unit === 'min' ? ' min' : ''}
        </span>
      </button>
    </li>
  );
}

/**
 * Planned weekly sets per muscle and cardio minutes for the split being edited. Selecting a
 * row lets the day list show which days supply it.
 */
export function SplitVolumeChart({
  days,
  muscleGoal,
  cardioGoal,
  selected,
  onSelect,
}: {
  days: RoutineDay[];
  muscleGoal: number;
  /** Combined weekly cardio-zone goal in minutes; null when no goal is set. */
  cardioGoal: number | null;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const headingId = useId();
  const volume = plannedWeeklyVolume(days);
  const rows: Row[] = volume.muscles.map(({ muscle, sets }) => ({
    key: muscle,
    name: muscle,
    value: sets,
    goal: muscleGoal,
    unit: 'sets',
    status: targetStatus(sets, muscleGoal),
  }));
  const cardio: Row | null =
    cardioGoal || volume.cardioMinutes > 0
      ? {
          key: CARDIO_ROW,
          name: 'Cardio',
          value: volume.cardioMinutes,
          goal: cardioGoal || null,
          unit: 'min',
          status: cardioGoal ? targetStatus(volume.cardioMinutes, cardioGoal) : null,
        }
      : null;
  const goals = [...rows, ...(cardio ? [cardio] : [])].filter((row) => row.status);
  const met = goals.filter((row) => row.status === 'met').length;
  return (
    <section className="split-volume" aria-labelledby={headingId}>
      <header>
        <h3 id={headingId}>Weekly volume</h3>
        {goals.length > 0 && (
          <span className="split-volume-count">
            {met === goals.length && <Mark status="met" />}
            {met} of {goals.length} on target
          </span>
        )}
        <HelpPopup title="Weekly volume">
          <p>
            Planned sets and cardio for a week of this split, compared with your weekly goals.
            Warm-up sets don't count, and secondary muscles count as part sets, as on Home. Tap a
            row to see which days train it.
          </p>
          {volume.cycleDays !== 7 && (
            <p>
              A {volume.cycleDays}-day cycle doesn't line up with a week, so these are weekly
              averages. Some weeks have more sessions of a day than others.
            </p>
          )}
          {cardioGoal ? <p>Planned cardio counts toward your combined cardio zone goals.</p> : null}
        </HelpPopup>
      </header>
      {rows.length === 0 && !cardio ? (
        <p className="split-volume-empty">No exercises yet</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <VolumeRow
              key={row.key}
              row={row}
              selected={selected === row.key}
              onSelect={onSelect}
            />
          ))}
          {cardio && (
            <VolumeRow row={cardio} selected={selected === CARDIO_ROW} onSelect={onSelect} />
          )}
        </ul>
      )}
    </section>
  );
}
