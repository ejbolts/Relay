import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { motionReduced } from './motion';
import type { WeeklySetGain } from './weeklySetsUpdate';
import './weeklySetsShelf.css';

/** How long the shelf stays up after a set unless it is touched. */
export const WEEKLY_SETS_SHELF_MS = 3000;
const LEAVE_MS = 200;

const credits = (value: number) => Number(value.toFixed(3)).toLocaleString();

export interface WeeklySetsUpdate {
  /** Changes for each logged set, rolling each total and growing its bar again. */
  id: number;
  gains: WeeklySetGain[];
}

/**
 * Where the shelf sits: on top of the rest pill as one card, above the hidden rest's notch, or on
 * its own at the bottom when there is no rest.
 */
export type WeeklySetsShelfPlacement = 'pill' | 'notch' | 'alone';

/**
 * The weekly sets a logged working set adds to its muscles, in one row of columns above the rest
 * timer. It folds away after a few seconds; touching it keeps it up, and a second touch closes it.
 */
export function WeeklySetsShelf({
  update,
  goal,
  placement,
  onDismiss,
}: {
  update: WeeklySetsUpdate;
  goal: number;
  placement: WeeklySetsShelfPlacement;
  onDismiss: () => void;
}) {
  // Keyed to the update, so a newly logged set lets go of a hold and restarts the countdown.
  const [heldFor, setHeldFor] = useState<number | null>(null);
  const [leavingFor, setLeavingFor] = useState<number | null>(null);
  const held = heldFor === update.id;
  const leaving = leavingFor === update.id;
  // A set logged while the shelf is up updates it in place: no unfold, and sooner.
  const [firstId] = useState(update.id);
  const followUp = update.id !== firstId;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (held || leaving) return;
    const timer = window.setTimeout(() => setLeavingFor(update.id), WEEKLY_SETS_SHELF_MS);
    return () => window.clearTimeout(timer);
  }, [update.id, held, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dismiss.current(), motionReduced() ? 0 : LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const summary = update.gains
    .map(
      (item) =>
        `${item.muscle} ${credits(item.after)} of ${credits(goal)} weekly sets, up ${credits(item.gain)}`,
    )
    .join('. ');

  return (
    <>
      <button
        type="button"
        className={`weekly-sets-shelf is-${placement}${followUp ? ' is-follow-up' : ''}${held ? ' is-held' : ''}${leaving ? ' is-leaving' : ''}`}
        style={{ '--weekly-shelf-ms': `${WEEKLY_SETS_SHELF_MS}ms` } as CSSProperties}
        aria-label={held ? 'Close weekly sets' : 'Keep weekly sets open'}
        onClick={() => (held ? setLeavingFor(update.id) : setHeldFor(update.id))}
      >
        <span
          className="weekly-shelf-cells"
          style={{ '--count': update.gains.length } as CSSProperties}
          aria-hidden="true"
        >
          {update.gains.map((item, index) => (
            <WeeklySetsCell
              key={item.muscle}
              item={item}
              goal={goal}
              index={index}
              updateId={update.id}
            />
          ))}
        </span>
        {!held && !leaving && (
          <span
            key={`countdown-${update.id}`}
            className="weekly-shelf-countdown"
            aria-hidden="true"
          />
        )}
      </button>
      <span className="sr-only" role="status">
        {summary}
      </span>
    </>
  );
}

function WeeklySetsCell({
  item,
  goal,
  index,
  updateId,
}: {
  item: WeeklySetGain;
  goal: number;
  index: number;
  updateId: number;
}) {
  // A muscle carried over from the last set keeps its column and gain badge; its total rolls again
  // and the bar's glowing chunk extends to cover every set since the shelf opened. The bar's end is
  // the goal.
  const [glowStart] = useState(item.before);
  const from = Math.min(glowStart, item.before);
  const percent = (value: number) =>
    goal > 0 ? Math.round(Math.min(100, (value / goal) * 100) * 100) / 100 : 100;
  const met = item.after >= goal;
  const justMet = met && item.before < goal;
  return (
    <span
      className={`weekly-shelf-cell${met ? ' is-met' : ''}${justMet ? ' just-met' : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <span className="weekly-shelf-name">{item.muscle}</span>
      <span className="weekly-shelf-gain">+{credits(item.gain)}</span>
      <span className="weekly-shelf-value">
        <span className="weekly-shelf-roll">
          <span key={updateId}>
            <span>{credits(item.before)}</span>
            <span>{credits(item.after)}</span>
          </span>
        </span>
        <small>/{credits(goal)}</small>
        {met && (
          <span className="weekly-shelf-met">
            <Icon name="check" />
          </span>
        )}
      </span>
      <span className="weekly-shelf-bar">
        <span className="weekly-shelf-bar-before" style={{ width: `${percent(from)}%` }} />
        <span
          className="weekly-shelf-bar-gain"
          style={{
            left: `${percent(from)}%`,
            width: `${percent(item.after) - percent(from)}%`,
          }}
        />
      </span>
    </span>
  );
}
