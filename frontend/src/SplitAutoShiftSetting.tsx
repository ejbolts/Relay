import { useEffect, useId, useRef, useState } from 'react';

const LABEL = 'Shift after missed workouts';

/** The By date auto-shift switch, with a ? that explains it in place like the Schedule help. */
export function SplitAutoShiftSetting({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  const [help, setHelp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!help) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setHelp(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [help]);

  return (
    <div
      ref={root}
      className="routine-auto-shift-setting"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !help) return;
        // Close only the explanation, not the dialog around it.
        event.preventDefault();
        event.stopPropagation();
        setHelp(false);
        trigger.current?.focus();
      }}
    >
      <div className="notification-setting-row routine-auto-shift">
        <div className="routine-auto-shift-label">
          <strong>{LABEL}</strong>
          <button
            ref={trigger}
            type="button"
            className="routine-progression-help"
            aria-label={`What ${LABEL} does`}
            aria-expanded={help}
            aria-controls={`${id}-help`}
            onClick={() => setHelp((open) => !open)}
          >
            ?
          </button>
        </div>
        <button
          type="button"
          role="switch"
          aria-label={LABEL}
          aria-checked={value}
          className={value ? 'is-on' : ''}
          disabled={disabled}
          onClick={() => onChange(!value)}
        >
          <span />
          {value ? 'On' : 'Off'}
        </button>
      </div>
      {help && (
        <div
          id={`${id}-help`}
          className="routine-progression-popover"
          role="region"
          aria-label={LABEL}
        >
          <strong>{LABEL}</strong>
          <dl className="routine-progression-example">
            <dt>Split</dt>
            <dd>Push → Pull → Legs → Rest</dd>
            <dt>Missed Pull and Legs</dt>
            <dd className="routine-progression-flow">Pull moves to today; the rest follow</dd>
          </dl>
          <p>
            <span aria-hidden="true">→ </span>
            Happens when you open Relay, with Undo
          </p>
        </div>
      )}
    </div>
  );
}
