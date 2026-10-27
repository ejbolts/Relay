import { useRef, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { MachineSettingsSummary } from './MachineSettingsEditor';
import type { Exercise, MachineSetting } from './types';
import './exerciseMuscleHelp.css';

export function ExerciseMuscleHelp({
  exercise,
  settings,
  onSettings,
}: {
  exercise: Exercise;
  settings?: MachineSetting[];
  onSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardio = exercise.kind === 'cardio' || exercise.category === 'cardio';
  const credits = exercise.muscle_set_credits ?? [];
  const direct = credits.filter((credit) => credit.sets >= 1);
  const partial = credits.filter((credit) => credit.sets > 0 && credit.sets < 1);

  return (
    <span
      className="exercise-muscle-help"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') event.stopPropagation();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="exercise-muscle-help-button"
        aria-label={`Muscle set credits for ${exercise.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
          <path d="M12 16.5h.01" />
        </svg>
      </button>
      {open && (
        <PopupDialog
          title={exercise.name}
          kicker="MUSCLE SET CREDITS"
          className="exercise-muscle-dialog"
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        >
          {cardio ? (
            <p>Cardio does not add strength sets to your weekly muscle totals.</p>
          ) : (
            <>
              {credits.length ? (
                <div className="exercise-muscle-credit-groups">
                  {[
                    { title: 'Direct work', items: direct },
                    { title: 'Partial credit · assistance', items: partial },
                  ].map(({ title, items }) => (
                    <section key={title}>
                      <h3>{title}</h3>
                      {items.length ? (
                        <ul>
                          {items.map((credit) => (
                            <li key={credit.muscle_name}>
                              <span>{credit.muscle_name}</span>
                              <strong>
                                {credit.sets} {credit.sets === 1 ? 'set' : 'sets'}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="exercise-muscle-note">
                          No {title === 'Direct work' ? 'direct' : 'partial'} credits assigned.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <p>No muscle set credits are available for this exercise.</p>
              )}
              {(onSettings || !!settings?.length) && (
                <section className="exercise-muscle-settings" aria-label="Machine settings">
                  <div className="exercise-muscle-settings-heading">
                    <h3>Settings</h3>
                    {onSettings && (
                      <button
                        type="button"
                        aria-label={
                          settings?.length ? 'Edit machine settings' : 'Add machine settings'
                        }
                        onClick={() => {
                          setOpen(false);
                          onSettings();
                        }}
                      >
                        {settings?.length ? 'Edit' : 'Add'}
                      </button>
                    )}
                  </div>
                  <MachineSettingsSummary settings={settings} />
                </section>
              )}
            </>
          )}
        </PopupDialog>
      )}
    </span>
  );
}
