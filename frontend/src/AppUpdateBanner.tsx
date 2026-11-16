export function AppUpdateBanner({
  version,
  required = false,
  refreshing,
  error,
  onRefresh,
}: {
  version?: string;
  /** The server needs this update before it accepts saves from the app. */
  required?: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <aside
      className={`app-update-banner${required ? ' is-required' : ''}`}
      aria-label="App update"
      role="status"
    >
      <span className="app-update-sheen" aria-hidden="true" />
      <div>
        <strong>
          {required
            ? 'Update needed to save'
            : version
              ? `Version ${version} is available`
              : 'An app update is available'}
        </strong>
        <span>
          {error ??
            (required
              ? 'Refresh to update. Workouts in progress stay on this device.'
              : 'Keep logging, or refresh to update.')}
        </span>
      </div>
      <button
        type="button"
        className="app-update-refresh"
        title="Refresh to update"
        disabled={refreshing}
        aria-busy={refreshing || undefined}
        onClick={onRefresh}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" d="M18.36 9.03A7.5 7.5 0 1 1 11.5 5.52" />
          <path fill="currentColor" strokeLinejoin="round" d="M10.8 2.6 15 5.5l-4.2 2.9Z" />
        </svg>
        <span>Update</span>
      </button>
    </aside>
  );
}
