import { Icon } from './Icon';
import './offlineNotice.css';

/** Floats over every screen while offline without changing the page layout. */
export function OfflineNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="offline-notice" aria-label="Connection" role="status" aria-atomic="true">
      <Icon name="cloud-off" />
      <strong>You're offline</strong>
      <button
        type="button"
        className="offline-notice-close"
        aria-label="Dismiss offline notice"
        onClick={onDismiss}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </aside>
  );
}
