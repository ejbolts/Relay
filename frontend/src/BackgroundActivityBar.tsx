export function BackgroundActivityBar({ label }: { label: string | null }) {
  if (!label) return null;

  return (
    <div className="background-activity-bar" role="status" aria-live="polite">
      <span className="background-activity-spinner" aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  );
}
