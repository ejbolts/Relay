import { useId, useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { MuscleSetsWeek } from './liveMuscleSets';
import type { BodyMeasurement, CardioWeek, PersonalRecord, TrackedWorkout } from './types';
import { dayMonth, formatVolume, shortDate } from './trainingSummary';
import { formatWeight, recordDisplayValue, weightFromKg, type WeightUnit } from './weightUnits';
import { weeklyReview } from './weeklyReview';
import './muscleSets.css';
import './weeklyReview.css';

const RECORD_LABELS: Partial<Record<PersonalRecord['record_type'], string>> = {
  weight: 'Heaviest weight',
  reps_at_weight: 'Reps at weight',
};

const MAX_WEEKS_AGO = 11;

const weekName = (weeksAgo: number) =>
  weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo} weeks ago`;

const trim = (value: number) => Number(value.toFixed(1)).toLocaleString('en-GB');

/** A change against the week before. `better` marks which direction is good, if either is. */
function Delta({
  change,
  format = trim,
  unit = '',
  better = 'up',
}: {
  change: number | null;
  format?: (value: number) => string;
  unit?: string;
  better?: 'up' | 'down' | null;
}) {
  if (change === null) return null;
  const size = Math.abs(change) < 0.05 ? 0 : change;
  const direction = size > 0 ? 'up' : size < 0 ? 'down' : 'same';
  const tone = direction === 'same' || !better ? 'neutral' : direction === better ? 'good' : 'bad';
  return (
    <small
      className={`weekly-delta is-${tone}`}
      aria-label={
        direction === 'same'
          ? 'same as the week before'
          : `${direction} ${format(Math.abs(size))}${unit} on the week before`
      }
    >
      {direction === 'same' ? '±0' : `${direction === 'up' ? '+' : '−'}${format(Math.abs(size))}`}
      {direction !== 'same' && unit}
    </small>
  );
}

export function WeeklyReviewCard({
  workouts,
  records,
  measurements,
  muscleWeeks,
  muscleGoal,
  cardioWeeks,
  weightUnit,
  today,
  weekStartDay,
  onOpenProgress,
  onOpenCardio,
  onOpenBody,
}: {
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  measurements: BodyMeasurement[];
  /** Per-muscle sets for the current week followed by earlier weeks, newest first. */
  muscleWeeks: MuscleSetsWeek[];
  muscleGoal: number;
  /** Cardio for the current week then earlier weeks, newest first. */
  cardioWeeks: CardioWeek[];
  weightUnit: WeightUnit;
  today: string;
  weekStartDay: number;
  onOpenProgress: (exerciseId?: string) => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
}) {
  const titleId = useId();
  const [requestedWeeksAgo, setWeeksAgo] = useState(0);
  const limit = muscleWeeks.length ? muscleWeeks.length - 1 : MAX_WEEKS_AGO;
  const weeksAgo = Math.min(requestedWeeksAgo, limit);
  const review = useMemo(
    () =>
      weeklyReview({
        workouts,
        records,
        measurements,
        muscleWeeks,
        muscleGoal,
        cardioWeeks,
        today,
        weekStartDay,
        weeksAgo,
      }),
    [
      workouts,
      records,
      measurements,
      muscleWeeks,
      muscleGoal,
      cardioWeeks,
      today,
      weekStartDay,
      weeksAgo,
    ],
  );
  const { training, previousTraining, muscles, cardio, body } = review;
  const name = weekName(weeksAgo);
  const nothingLogged =
    !training.workouts &&
    !training.cardioSessions &&
    !cardio?.totalMinutes &&
    !review.records.length &&
    !body.checkIns;
  const bodyChange =
    body.averageKg !== null && body.previousAverageKg !== null
      ? body.averageKg - body.previousAverageKg
      : null;

  return (
    <section className="pulse-card weekly-review" aria-labelledby={titleId}>
      <header className="pulse-card-header muscle-sets-header">
        <h2 id={titleId}>Weekly review</h2>
        <div className="muscle-week-nav" role="group" aria-label="Review week">
          <button
            type="button"
            aria-label="Previous week"
            disabled={weeksAgo >= limit}
            onClick={() => setWeeksAgo(weeksAgo + 1)}
          >
            <Icon name="chevron-left" />
          </button>
          <span aria-live="polite">{name}</span>
          <button
            type="button"
            aria-label="Next week"
            disabled={weeksAgo === 0}
            onClick={() => setWeeksAgo(weeksAgo - 1)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </header>
      <p className="weekly-review-range">
        {dayMonth(review.weekStart)} – {dayMonth(review.weekEnd)}
        {!review.complete && ' · so far'}
      </p>

      <dl className="weekly-review-stats">
        <div>
          <dt>Workouts</dt>
          <dd className="num">
            {training.workouts}
            <Delta change={training.workouts - previousTraining.workouts} />
          </dd>
        </div>
        <div>
          <dt>Sets</dt>
          <dd className="num">
            {training.sets}
            <Delta change={training.sets - previousTraining.sets} />
          </dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd className="num">
            {formatVolume(training.volumeKg, weightUnit)}
            <Delta
              change={training.volumeKg - previousTraining.volumeKg}
              format={(value) => formatVolume(value, weightUnit)}
            />
          </dd>
        </div>
      </dl>

      {nothingLogged && (
        <p className="pulse-empty-line">
          {weeksAgo === 0 ? 'Nothing logged yet this week.' : 'Nothing was logged that week.'}
        </p>
      )}

      <div className="weekly-review-block">
        <h3>
          Records
          <span className="num">
            {review.records.length}
            <Delta change={review.records.length - review.previousRecordCount} />
          </span>
        </h3>
        {review.records.length > 0 ? (
          <ul className="weekly-review-records">
            {review.records.slice(0, 3).map((record) => (
              <li key={record.id}>
                <button type="button" onClick={() => onOpenProgress(record.exercise_id)}>
                  <Icon name="trophy" />
                  <span>
                    <b>{record.exercise_name ?? 'Exercise'}</b>
                    <small>
                      {RECORD_LABELS[record.record_type]}
                      {record.record_type === 'reps_at_weight' && record.weight_kg != null
                        ? ` @ ${formatWeight(record.weight_kg, weightUnit)}`
                        : ''}{' '}
                      · {shortDate(record.achieved_date)}
                    </small>
                  </span>
                  <strong className="num">{recordDisplayValue(record, weightUnit)}</strong>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-empty-line">No new strength records.</p>
        )}
        {review.records.length > 3 && (
          <button type="button" className="text-link" onClick={() => onOpenProgress()}>
            All {review.records.length} in Progress
          </button>
        )}
      </div>

      <div className="weekly-review-block">
        <h3>
          Sets per muscle
          {muscles && (
            <span className="num">
              {muscles.atGoal} at goal
              <Delta
                change={
                  muscles.previousAtGoal === null ? null : muscles.atGoal - muscles.previousAtGoal
                }
              />
            </span>
          )}
        </h3>
        {muscles && muscles.totalSets > 0 ? (
          <>
            <p className="weekly-review-line">
              {trim(muscles.totalSets)} sets across muscles; goal is {muscles.goal} each.
            </p>
            {muscles.movers.length > 0 && (
              <ul className="weekly-review-movers" aria-label="Biggest changes on the week before">
                {muscles.movers.map((item) => (
                  <li key={item.muscle}>
                    <span>{item.muscle}</span>
                    <b className="num">
                      {trim(item.sets)}
                      <Delta change={item.change} />
                    </b>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="pulse-empty-line">No working sets logged.</p>
        )}
      </div>

      <div className="weekly-review-block">
        <h3>
          Cardio
          {cardio && (
            <span className="num">
              {trim(cardio.totalMinutes)} min
              <Delta
                change={
                  cardio.previousTotalMinutes === null
                    ? null
                    : cardio.totalMinutes - cardio.previousTotalMinutes
                }
              />
            </span>
          )}
        </h3>
        {cardio && cardio.zones.length > 0 ? (
          <ul className="weekly-review-zones">
            {cardio.zones.map((zone) => (
              <li key={zone.zone}>
                <span>Zone {zone.zone}</span>
                <span className="weekly-review-zone-bar" aria-hidden="true">
                  <i
                    style={{ width: `${Math.min(100, (zone.minutes / zone.goalMinutes) * 100)}%` }}
                  />
                </span>
                <b className="num">
                  {trim(zone.minutes)} / {trim(zone.goalMinutes)} min
                  <Delta
                    change={
                      zone.previousMinutes === null ? null : zone.minutes - zone.previousMinutes
                    }
                  />
                </b>
              </li>
            ))}
          </ul>
        ) : cardio ? (
          <p className="pulse-empty-line">
            {cardio.totalMinutes ? 'No zone goals set.' : 'No cardio logged.'}
          </p>
        ) : (
          <p className="pulse-empty-line">No cardio data.</p>
        )}
        <button type="button" className="text-link" onClick={onOpenCardio}>
          Cardio
        </button>
      </div>

      <div className="weekly-review-block">
        <h3>
          Body weight
          {body.averageKg !== null && (
            <span className="num">
              {weightFromKg(body.averageKg, weightUnit).toFixed(1)} {weightUnit}
              <Delta
                change={bodyChange === null ? null : weightFromKg(bodyChange, weightUnit)}
                format={(value) => value.toFixed(1)}
                unit={` ${weightUnit}`}
                better={null}
              />
            </span>
          )}
        </h3>
        {body.averageKg === null ? (
          <p className="pulse-empty-line">No check-ins logged.</p>
        ) : (
          <p className="weekly-review-line">
            Average of {body.checkIns} check-in{body.checkIns === 1 ? '' : 's'}.
          </p>
        )}
        <button type="button" className="text-link" onClick={onOpenBody}>
          Body
        </button>
      </div>
    </section>
  );
}
