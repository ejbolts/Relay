import { useId } from 'react';
import type { ActivityCardSettings } from './homeLayout';
import { SparkBars } from './PulseCharts';
import { averageOf } from './trainingSummary';

export function ActivityCardSettingsForm({
  values,
  value,
  onChange,
}: {
  values: number[];
  value: ActivityCardSettings;
  onChange: (change: Partial<ActivityCardSettings>) => void;
}) {
  const name = useId();
  return (
    <div className="cardio-card-settings">
      <fieldset>
        <legend>History &amp; average</legend>
        <div className="cardio-card-styles activity-card-previews">
          {([4, 8, 12] as const).map((weeks) => {
            const history = values.slice(-weeks);
            return (
              <label key={weeks}>
                <input
                  type="radio"
                  name={name}
                  aria-label={`${weeks} weeks`}
                  checked={value.weeks === weeks}
                  onChange={() => onChange({ weeks })}
                />
                <span className="activity-card-preview" aria-hidden="true">
                  <SparkBars values={history} label={`${weeks}-week preview`} />
                </span>
                <span>{weeks} weeks</span>
                <span className="activity-card-average">
                  {(averageOf(history) ?? 0).toFixed(1)} / week
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
