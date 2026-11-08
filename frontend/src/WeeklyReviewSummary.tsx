import { Icon } from './Icon';
import type { PersonalRecord } from './types';
import { dayMonth, formatVolume, shortDate } from './trainingSummary';
import { formatWeight, recordDisplayValue, weightFromKg, type WeightUnit } from './weightUnits';
import { reviewHasActivity, type WeeklyReview } from './weeklyReview';
import './weeklyReview.css';

const RECORD_LABELS: Partial<Record<PersonalRecord['record_type'], string>> = {
  weight: 'Heaviest weight',
  reps_at_weight: 'Reps at weight',
};

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

/** One week's figures against the week before, shared by the Home card and the weekly popup. */
export function WeeklyReviewSummary({
  review,
  weightUnit,
  isCurrentWeek,
  onOpenProgress,
  onOpenCardio,
  onOpenBody,
}: {
  review: WeeklyReview;
  weightUnit: WeightUnit;
  isCurrentWeek: boolean;
  onOpenProgress: (exerciseId?: string) => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
}) {
  const { training, previousTraining, muscles, cardio, body } = review;
  const bodyChange =
    body.averageKg !== null && body.previousAverageKg !== null
      ? body.averageKg - body.previousAverageKg
      : null;

  return (
    <>
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

      {!reviewHasActivity(review) && (
        <p className="pulse-empty-line">
          {isCurrentWeek ? 'Nothing logged yet this week.' : 'Nothing was logged that week.'}
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
          muscles.movers.length > 0 && (
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
          )
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
        {body.averageKg === null && <p className="pulse-empty-line">No check-ins logged.</p>}
        <button type="button" className="text-link" onClick={onOpenBody}>
          Body
        </button>
      </div>
    </>
  );
}
