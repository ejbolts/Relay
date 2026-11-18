import { useState } from 'react';
import { BodyFigure } from './BodyFigure';
import { BODY_SIZE_FIELDS, type BodySizeLog } from './bodySizes';
import { Icon } from './Icon';
import { useWeightUnit } from './trainingPreferencesContext';
import type { Sex } from './types';
import './bodySizes.css';

const shortDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  );

/** A member's shared tape measurements on their body outline, one dated entry at a time. */
export function SharedBodySizesCard({
  entries,
  sex,
}: {
  /** Newest first. */
  entries: BodySizeLog[];
  sex: Sex | null | undefined;
}) {
  const unit = useWeightUnit() === 'lb' ? 'in' : 'cm';
  const factor = unit === 'in' ? 2.54 : 1;
  const [index, setIndex] = useState(0);
  const shown = entries[Math.min(index, entries.length - 1)];
  return (
    <section
      className="pulse-card shared-card body-sizes-card"
      aria-labelledby="shared-body-sizes-title"
    >
      <header className="pulse-card-header">
        <h2 id="shared-body-sizes-title">Body measurements</h2>
      </header>
      {!shown ? (
        <p className="shared-card-empty">No body measurements yet.</p>
      ) : (
        <>
          <div className="body-sizes-stepper">
            {entries.length > 1 && (
              <button
                type="button"
                aria-label="Earlier measurements"
                disabled={index >= entries.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                <Icon name="chevron-left" />
              </button>
            )}
            <time dateTime={shown.measurement_date}>{shortDate(shown.measurement_date)}</time>
            {entries.length > 1 && (
              <button
                type="button"
                aria-label="Later measurements"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <Icon name="chevron-right" />
              </button>
            )}
          </div>
          <BodyFigure
            kind={sex === 'female' ? 'female' : 'male'}
            unit={unit}
            values={Object.fromEntries(
              BODY_SIZE_FIELDS.filter(([key]) => shown[key] != null).map(([key]) => [
                key,
                String(Number((shown[key]! / factor).toFixed(1))),
              ]),
            )}
          />
        </>
      )}
    </section>
  );
}
