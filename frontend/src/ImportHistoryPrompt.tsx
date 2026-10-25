import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';

/** The step after a new account's tour: bring existing training in, or carry on. */
export function ImportHistoryPrompt({
  onSkip,
  onContinue,
}: {
  onSkip: () => void;
  onContinue: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <PopupDialog
      title="Your workout history"
      kicker="NEXT STEP"
      className="app-guide import-history-prompt"
      onClose={onSkip}
    >
      <div className="app-guide-body">
        <div className="app-guide-step">
          <span className="app-guide-glyph">
            <Icon name="up" />
          </span>
          <h3 ref={titleRef} tabIndex={-1}>
            Already tracking your workouts?
          </h3>
          <p>
            Bring your workout CSV straight from Strength Level, Hevy or Strong, or use a
            spreadsheet or Relay export. Review it before saving so your charts, records and
            suggestions start from your real training.
          </p>
          <p className="import-history-later">
            You can do this later in Settings → Data &amp; connections → Import &amp; export.
          </p>
        </div>
      </div>
      <footer className="popup-dialog-actions">
        <button type="button" className="guide-skip" onClick={onSkip}>
          Skip for now
        </button>
        <button type="button" className="popup-primary-action" onClick={onContinue}>
          Import or export <span aria-hidden="true">→</span>
        </button>
      </footer>
    </PopupDialog>
  );
}
