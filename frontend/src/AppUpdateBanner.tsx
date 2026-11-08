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
    <aside className="app-update-banner" aria-label="App update" role="status">
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
        aria-label="Refresh to update"
        title="Refresh to update"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17" />
        </svg>
      </button>
    </aside>
  );
}
