import { useState } from 'react';
import { BodyFigure } from './BodyFigure';
import { bodyFigureKindForSex, bodySizeUnit, sharedBodyFigureValues } from './bodySizeEntries';
import type { BodySizeLog } from './bodySizes';
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
  const size = bodySizeUnit(useWeightUnit());
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
            kind={bodyFigureKindForSex(sex)}
            unit={size.unit}
            values={sharedBodyFigureValues(shown, size)}
          />
        </>
      )}
    </section>
  );
}
