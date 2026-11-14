import type { BodyCheckInMode, BodyCheckInSettings } from './homeLayout';
import { useWeightUnit } from './trainingPreferencesContext';
import './bodyCheckInSettings.css';

const OPTIONS: { id: BodyCheckInMode; label: string }[] = [
  { id: 'weight', label: 'Weight only' },
  { id: 'fat', label: 'Body fat only' },
  { id: 'combined', label: 'Combined \u00b7 separate buttons' },
  { id: 'combined-single', label: 'Combined \u00b7 one button' },
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
              checked={value.mode === id}
              onChange={() => onChange({ mode: id })}
            />
            {label}
          </span>
          <span className="body-check-in-preview" aria-hidden="true">
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
                {id !== 'combined-single' && <i>Update</i>}
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
                {id !== 'combined-single' && <i>Update</i>}
              </span>
            )}
            {id === 'combined-single' && <i className="body-check-in-preview-save">Update</i>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
