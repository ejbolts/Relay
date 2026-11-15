import { useRef, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { formatSeconds } from './utils';
import './restTimeSelect.css';

const REST_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 210, 240];
const MAX_REST_SECONDS = 7200;

export function RestTimeSelect({
  seconds,
  label,
  onChange,
}: {
  seconds: number;
  label: string;
  onChange: (seconds: number) => void;
}) {
  const custom = !REST_OPTIONS.includes(seconds);
  const select = useRef<HTMLSelectElement>(null);
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [remainder, setRemainder] = useState('');
  const [error, setError] = useState<string | null>(null);
  function close() {
    setEditing(false);
    window.requestAnimationFrame(() => select.current?.focus({ preventScroll: true }));
  }
  return (
    <>
      <select
        ref={select}
        value={custom ? 'current-custom' : seconds}
        onChange={(event) => {
          if (event.target.value !== 'custom') {
            onChange(Number(event.target.value));
            return;
          }
          setMinutes(String(Math.floor(seconds / 60)));
          setRemainder(String(seconds % 60));
          setError(null);
          setEditing(true);
        }}
        aria-label={label}
      >
        {REST_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {formatSeconds(value)}
            {value === 0 ? ' (no rest)' : ''}
          </option>
        ))}
        {/* A separate selected value lets Custom reopen the editor for an existing custom time. */}
        {custom && (
          <option value="current-custom" hidden>
            {formatSeconds(seconds)}
          </option>
        )}
        <option value="custom">Custom...</option>
      </select>
      {editing && (
        <PopupDialog title="Custom rest time" className="custom-rest-time-dialog" onClose={close}>
          <form
            className="custom-rest-time-form"
            onSubmit={(event) => {
              event.preventDefault();
              const mins = Number(minutes),
                secs = Number(remainder);
              const total = mins * 60 + secs;
              if (
                minutes.trim() === '' ||
                remainder.trim() === '' ||
                !Number.isInteger(mins) ||
                !Number.isInteger(secs) ||
                mins < 0 ||
                secs < 0 ||
                secs > 59 ||
                total > MAX_REST_SECONDS
              ) {
                setError('Enter a rest time from 0:00 to 120:00.');
                return;
              }
              onChange(total);
              close();
            }}
          >
            <div className="custom-rest-time-fields">
              <label>
                Minutes
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="120"
                  step="1"
                  required
                  autoFocus
                  value={minutes}
                  onChange={(event) => {
                    setMinutes(event.target.value);
                    setError(null);
                  }}
                />
              </label>
              <label>
                Seconds
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="59"
                  step="1"
                  required
                  value={remainder}
                  onChange={(event) => {
                    setRemainder(event.target.value);
                    setError(null);
                  }}
                />
              </label>
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="popup-dialog-actions">
              <button type="button" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="popup-primary-action">
                Set rest time
              </button>
            </div>
          </form>
        </PopupDialog>
      )}
    </>
  );
}
