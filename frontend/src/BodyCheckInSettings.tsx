import type { BodyCheckInMode, BodyCheckInSettings } from './homeLayout';
import { Icon } from './Icon';
import { useWeightUnit } from './trainingPreferencesContext';
import './bodyCheckInSettings.css';

const OPTIONS: { id: BodyCheckInMode; label: string }[] = [
  { id: 'weight', label: 'Weight only' },
  { id: 'fat', label: 'Body fat only' },
  { id: 'combined-single', label: 'Combined' },
];

export function BodyCheckInSettingsForm({
  value,
  onChange,
}: {
  value: BodyCheckInSettings;
  onChange: (change: Partial<BodyCheckInSettings>) => void;
}) {
  const unit = useWeightUnit();
  return (
    <fieldset className="body-check-in-options">
      <legend>Check-in</legend>
      {OPTIONS.map(({ id, label }) => (
        <label key={id} className="body-check-in-option">
          <span className="body-check-in-option-label">
            <input
              type="radio"
              name="body-check-in-mode"
              checked={value.mode === id || (value.mode === 'combined' && id === 'combined-single')}
              onChange={() => onChange({ mode: id })}
            />
            {label}
          </span>
          <span className="body-check-in-preview" aria-hidden="true">
            <span className="body-check-in-preview-head">
              <b>Check-in</b>
              <i>
                <Icon name="check" />
              </i>
            </span>
            {id !== 'fat' && (
              <span className="body-check-in-preview-row">
                <span>Weight</span>
                <span className="body-check-in-preview-controls">
                  <span className="body-check-in-preview-stepper">{'\u2212'}</span>
                  <b>
                    84.3 <small>{unit}</small>
                  </b>
                  <span className="body-check-in-preview-stepper">+</span>
                </span>
              </span>
            )}
            {id !== 'weight' && (
              <span className="body-check-in-preview-row">
                <span>Body fat</span>
                <span className="body-check-in-preview-controls">
                  <span className="body-check-in-preview-stepper">{'\u2212'}</span>
                  <b>
                    14.0 <small>%</small>
                  </b>
                  <span className="body-check-in-preview-stepper">+</span>
                </span>
              </span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
