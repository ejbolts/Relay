/**
 * Home's outline while its data loads. Kept apart from Home itself so the first file the browser
 * downloads can show it without carrying the whole screen.
 */
export function TodaySkeleton() {
  return (
    <section
      className="today-screen content-page today-loading-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="sr-only">Loading your training summary</p>
      <div className="page-header" aria-hidden="true">
        <div>
          <span className="skeleton-block skeleton-eyebrow" />
          <span className="skeleton-block skeleton-title" />
        </div>
      </div>
      <div className="pulse-card skeleton-card skeleton-card-tall" aria-hidden="true" />
      <div className="pulse-kpis" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div className="pulse-kpi" key={item}>
            <span className="skeleton-block skeleton-label" />
            <span className="skeleton-block skeleton-value" />
          </div>
        ))}
      </div>
      <div className="pulse-card skeleton-card" aria-hidden="true" />
    </section>
  );
}
