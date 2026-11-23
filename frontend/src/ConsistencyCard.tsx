import { useId, type ReactNode } from 'react';
import { averagePerWeek, CONSISTENCY_WEEKS } from './consistencyWeeks';
import { Icon } from './Icon';
export function ConsistencyCard({
  streak,
  trainingDays,
  weeks = CONSISTENCY_WEEKS,
  children,
  onOpenSplits,
}: {
  streak: number;
  trainingDays: number;
  /** Weeks the average covers: fewer than twelve while training started recently. */
  weeks?: number;
  children: ReactNode;
  onOpenSplits?: () => void;
}) {
  const titleId = useId();
  return (
    <section className="calendar-panel pulse-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Consistency</h2>
        <div className="consistency-header-actions">
          <span>Last 12 weeks</span>
          {onOpenSplits && (
            <button type="button" className="pulse-button link small" onClick={onOpenSplits}>
              My splits <Icon name="chevron-right" />
            </button>
          )}
        </div>
      </header>
      <div className="consistency-stats">
        <div>
          <span>Streak</span>
          <b>
            {streak} {streak === 1 ? 'day' : 'days'}
          </b>
        </div>
        <div>
          <span>Training days</span>
          <b>{trainingDays}</b>
        </div>
        <div>
          <span>Avg / week</span>
          <b>{averagePerWeek(trainingDays, weeks)}</b>
        </div>
      </div>
      {children}
    </section>
  );
}
