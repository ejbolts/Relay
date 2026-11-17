import { useWorkoutShareReminder } from './useWorkoutShareReminder';

export function WorkoutShareReminderSetting() {
  const [enabled, setEnabled] = useWorkoutShareReminder();
  return (
    <div className="notification-setting-row">
      <strong>Share workout reminder</strong>
      <button
        type="button"
        role="switch"
        aria-label="Share workout reminder"
        aria-checked={enabled}
        className={enabled ? 'is-on' : ''}
        onClick={() => setEnabled(!enabled)}
      >
        <span />
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}
