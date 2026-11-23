import { useId, type CSSProperties } from 'react';
import type { MuscleSetGoals } from './muscleSetGoals';
import { HelpPopup } from './HelpPopup';
import {
  CARDIO_ROW,
  describeVolumeRow as describe,
  splitVolumeRows,
  TARGET_MARKS as MARK,
  volumeRowValue as shown,
  type TargetStatus,
  type VolumeRow as Row,
} from './splitTargets';
import type { RoutineDay } from './types';
import './splitVolume.css';

export { CARDIO_ROW };

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
          {row.unit === 'min' && `${row.goal != null ? ` / ${row.goal}` : ''} min`}
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
  muscleGoals,
  cardioGoal,
  selected,
  onSelect,
}: {
  days: RoutineDay[];
  muscleGoal: number;
  muscleGoals?: MuscleSetGoals;
  /** Combined weekly cardio-zone goal in minutes; null when no goal is set. */
  cardioGoal: number | null;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const headingId = useId();
  const volume = splitVolumeRows(days, muscleGoal, muscleGoals, cardioGoal);
  const { rows, cardio, met, goals } = volume;
  return (
    <section className="split-volume" aria-labelledby={headingId}>
      <header>
        <h3 id={headingId}>Weekly volume</h3>
        {goals > 0 && (
          <span className="split-volume-count">
            {met === goals && <Mark status="met" />}
            {met} of {goals} on target
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
