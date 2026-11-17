import type { CardioGoalCardSettings, CardioGoalCardStyle } from './homeLayout';
import type { CardioGoal } from './types';

const STYLES: { id: CardioGoalCardStyle; label: string }[] = [
  { id: 'progress', label: 'Progress bar' },
  { id: 'ring', label: 'Ring' },
  { id: 'list', label: 'List' },
];

export function CardioGoalCardSettingsForm({
  goals,
  value,
  onChange,
}: {
  goals: CardioGoal[];
  value: CardioGoalCardSettings;
  onChange: (change: Partial<CardioGoalCardSettings>) => void;
}) {
  const zone = goals.some((goal) => goal.zone === value.zone) ? value.zone : null;
  const trackOptions = [
    { zone: null, label: 'All goals' },
    ...goals.map((goal) => ({ zone: goal.zone, label: `Zone ${goal.zone} · ${goal.minutes} min` })),
  ];
  return (
    <div className="cardio-card-settings">
      <fieldset>
        <legend>Track</legend>
        <div className="cardio-card-track">
          {trackOptions.map((option) => (
            <label key={option.zone ?? 'all'}>
              <input
                type="radio"
                name="cardio-card-zone"
                checked={zone === option.zone}
                onChange={() => onChange({ zone: option.zone })}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Design</legend>
        <div className="cardio-card-styles">
          {STYLES.map((style) => (
            <label key={style.id}>
              <input
                type="radio"
                name="cardio-card-style"
                checked={value.style === style.id}
                onChange={() => onChange({ style: style.id })}
              />
              <span className={`cardio-style-preview is-${style.id}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>{style.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
