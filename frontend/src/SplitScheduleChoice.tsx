import { useEffect, useId, useRef, useState } from 'react';
import type { SplitProgression } from './types';

/** One small split shows both options, so the only difference is what happens after a day off. */
const EXAMPLE_SPLIT = ['Upper', 'Lower', 'Rest'];

const OPTIONS: {
  value: SplitProgression;
  label: string;
  flow: string[];
  result: string;
}[] = [
  {
    value: 'workouts',
    label: 'Follow my workouts',
    flow: ['Upper', 'Day off', 'Lower', 'Upper'],
    result: 'Lower waits; the planned Rest is skipped',
  },
  {
    value: 'calendar',
    label: 'By date',
    flow: ['Upper', 'Day off', 'Rest', 'Upper'],
    result: 'Lower is skipped',
  },
];

function Flow({ steps }: { steps: string[] }) {
  return steps.map((step, index) => (
    <span key={index}>
      {index > 0 && <span aria-hidden="true"> → </span>}
      {step}
    </span>
  ));
}

/** Chooses how a split moves on, with a small flow explaining each option. */
export function SplitScheduleChoice({
  value,
  disabled,
  onChange,
}: {
  value: SplitProgression;
  disabled?: boolean;
  onChange: (value: SplitProgression) => void;
}) {
  const id = useId();
  const [help, setHelp] = useState<SplitProgression | null>(null);
  const root = useRef<HTMLFieldSetElement>(null);
  const triggers = useRef<Partial<Record<SplitProgression, HTMLButtonElement | null>>>({});
  const open = OPTIONS.find((option) => option.value === help);

  useEffect(() => {
    if (!help) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setHelp(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [help]);

  return (
    <fieldset
      ref={root}
      className="routine-progression"
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !help) return;
        // Close only the explanation, not the dialog around it.
        event.preventDefault();
        event.stopPropagation();
        triggers.current[help]?.focus();
        setHelp(null);
      }}
    >
      <legend>Schedule</legend>
      <div className="segmented-control" role="radiogroup" aria-label="Schedule">
        {OPTIONS.map((option) => (
          <span
            key={option.value}
            className={`routine-progression-option${value === option.value ? ' active' : ''}`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={value === option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
            <button
              ref={(node) => {
                triggers.current[option.value] = node;
              }}
              type="button"
              className="routine-progression-help"
              aria-label={`What ${option.label} does`}
              aria-expanded={help === option.value}
              aria-controls={`${id}-help`}
              onClick={() => setHelp((current) => (current === option.value ? null : option.value))}
            >
              ?
            </button>
          </span>
        ))}
      </div>
      {open && (
        <div
          id={`${id}-help`}
          className="routine-progression-popover"
          role="region"
          aria-label={open.label}
        >
          <strong>{open.label}</strong>
          <dl className="routine-progression-example">
            <dt>Split</dt>
            <dd>
              <Flow steps={EXAMPLE_SPLIT} />
            </dd>
            <dt>Day off after Upper</dt>
            <dd className="routine-progression-flow">
              <Flow steps={open.flow} />
            </dd>
          </dl>
          <p>
            <span aria-hidden="true">→ </span>
            {open.result}
          </p>
        </div>
      )}
    </fieldset>
  );
}
