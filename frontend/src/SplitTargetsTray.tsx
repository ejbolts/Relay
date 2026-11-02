import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { HelpPopup } from './HelpPopup';
import { Icon } from './Icon';
import {
  daySetCredits,
  formatVolume,
  plannedWeeklyVolume,
  targetStatus,
  type TargetStatus,
} from './splitTargets';
import type { RoutineDay } from './types';
import './splitTargets.css';

const CARDIO = 'Cardio';
const STATUS_MARK: Record<TargetStatus, string> = { met: '✓', close: '~', under: '!' };
const STATUS_LABEL: Record<TargetStatus, string> = {
  met: 'on target',
  close: 'nearly there',
  under: 'under target',
};

interface Target {
  name: string;
  value: number;
  goal: number | null;
  unit: 'sets' | 'min';
  status: TargetStatus | null;
}

function StatusMark({ status }: { status: TargetStatus | null }) {
  return (
    <i className={`split-target-mark is-${status ?? 'none'}`} aria-hidden="true">
      {status ? STATUS_MARK[status] : '·'}
    </i>
  );
}

/** Sets keep one decimal place for part credits; cardio shows whole minutes. */
const shown = (target: Target) =>
  target.unit === 'min' ? Math.round(target.value).toLocaleString() : formatVolume(target.value);

const amount = (target: Target) =>
  target.goal == null
    ? `${shown(target)}${target.unit === 'min' ? ' min' : ''}`
    : `${shown(target)} / ${target.goal}${target.unit === 'min' ? ' min' : ''}`;

const description = (target: Target) =>
  target.goal == null
    ? `${target.name}: ${shown(target)} ${target.unit === 'min' ? 'minutes' : 'sets'} a week`
    : `${target.name}: ${shown(target)} of ${target.goal} ${target.unit === 'min' ? 'minutes' : 'sets'} a week, ${STATUS_LABEL[target.status!]}`;

/** Live weekly volume of the split being edited, compared with the user's weekly goals. */
export function SplitTargetsTray({
  days,
  muscleGoal,
  cardioGoal,
  focusedDay,
}: {
  days: RoutineDay[];
  muscleGoal: number;
  /** Combined weekly cardio-zone goal in minutes; null when no goal is set. */
  cardioGoal: number | null;
  /** The day being edited; its muscles lead the collapsed summary. */
  focusedDay: number | null;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const volume = plannedWeeklyVolume(days);
  const targets: Target[] = volume.muscles
    .map(({ muscle, sets }) => ({
      name: muscle,
      value: sets,
      goal: muscleGoal,
      unit: 'sets' as const,
      status: targetStatus(sets, muscleGoal),
    }))
    .sort((left, right) => left.value - right.value || left.name.localeCompare(right.name));
  if (cardioGoal || volume.cardioMinutes > 0)
    targets.push({
      name: CARDIO,
      value: volume.cardioMinutes,
      goal: cardioGoal || null,
      unit: 'min',
      status: cardioGoal ? targetStatus(volume.cardioMinutes, cardioGoal) : null,
    });

  const values = new Map(targets.map((target) => [target.name, shown(target)]));
  const previous = useRef<Map<string, string> | null>(null);
  const changed = (name: string) =>
    previous.current !== null && previous.current.get(name) !== values.get(name);
  useEffect(() => {
    previous.current = values;
  });

  if (!targets.length) return null;
  const goals = targets.filter((target) => target.status);
  const met = goals.filter((target) => target.status === 'met').length;
  const day = focusedDay === null ? undefined : days[focusedDay];
  const dayMuscles = day?.workout_type_id ? daySetCredits(day) : null;
  const inDay = (target: Target) =>
    target.name === CARDIO
      ? !!day?.movements.some(({ exercise }) => exercise.kind === 'cardio')
      : !!dayMuscles?.has(target.name);
  const chips = dayMuscles
    ? [...targets].sort((left, right) => Number(inDay(right)) - Number(inDay(left)))
    : targets;

  return (
    <section className={`split-targets${open ? ' is-open' : ''}`} aria-label="Weekly targets">
      <div className="split-targets-header">
        <button
          type="button"
          className="split-targets-toggle"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          <strong>Weekly targets</strong>
          {goals.length > 0 && (
            <span className="split-targets-count">
              {met === goals.length && <StatusMark status="met" />}
              {met} of {goals.length} on target
            </span>
          )}
          <Icon name="chevron-down" />
        </button>
        <HelpPopup title="Weekly targets">
          <p>
            Planned sets and cardio for a week of this split, compared with your weekly goals.
            Warm-up sets don't count, and secondary muscles count as part sets, as on Home.
          </p>
          {volume.cycleDays !== 7 && (
            <p>
              A {volume.cycleDays}-day cycle doesn't line up with a week, so these are weekly
              averages. Some weeks have more sessions of a day than others.
            </p>
          )}
          {cardioGoal ? <p>Planned cardio counts toward your combined cardio zone goals.</p> : null}
        </HelpPopup>
      </div>
      {open ? (
        <ul className="split-target-bars" id={listId}>
          {targets.map((target) => {
            const scale = (target.goal ?? target.value) * 1.6 || 1;
            return (
              <li key={target.name}>
                <span className="sr-only">{description(target)}</span>
                <StatusMark status={target.status} />
                <span className="split-target-name" aria-hidden="true">
                  {target.name}
                </span>
                <span
                  className="split-target-track"
                  aria-hidden="true"
                  style={
                    {
                      '--fill': `${Math.min(100, (target.value / scale) * 100)}%`,
                      '--goal': `${((target.goal ?? 0) / scale) * 100}%`,
                    } as CSSProperties
                  }
                >
                  <span className={`split-target-fill is-${target.status ?? 'none'}`} />
                  {target.goal != null && <span className="split-target-goal" />}
                </span>
                <span className="split-target-value" aria-hidden="true">
                  {amount(target)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="split-target-chips" id={listId}>
          {chips.map((target) => (
            <li
              key={`${target.name}-${values.get(target.name)}`}
              className={[
                dayMuscles && !inDay(target) ? 'is-faded' : '',
                changed(target.name) ? 'is-changed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="sr-only">{description(target)}</span>
              <StatusMark status={target.status} />
              <span aria-hidden="true">{target.name}</span>
              <b aria-hidden="true">
                {shown(target)}
                {target.unit === 'min' ? ' min' : ''}
              </b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
