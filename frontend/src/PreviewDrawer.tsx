import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useElementHeight } from './useElementHeight';
import { useSwipeToggle } from './useSwipeToggle';

/**
 * A chart that slides down from the top when it appears, with a handle underneath: swipe it up to
 * minimise the chart to the handle and give the rest of the screen more room, or down to bring it
 * back. Tapping the handle does the same.
 */
export function PreviewDrawer({
  label,
  handle,
  children,
}: {
  label: string;
  /** What stays visible on the handle while the chart is minimised. */
  handle: ReactNode;
  children: ReactNode;
}) {
  // Shut on the first frame, so the chart slides down into place.
  const [shown, setShown] = useState(false);
  const [contentRef, full] = useElementHeight<HTMLDivElement>();
  const { open, dragged, handleProps } = useSwipeToggle({ opens: 'down', full });

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  const openness = dragged ?? (shown && open ? 1 : 0);
  return (
    <section
      className={`machine-weights-preview${dragged === null ? '' : ' is-dragging'}`}
      aria-label={label}
      style={{ '--open': openness, '--full': `${full}px` } as CSSProperties}
    >
      <div className="machine-weights-preview-body" aria-hidden={!open}>
        <div ref={contentRef}>{children}</div>
      </div>
      <button
        type="button"
        className="machine-weights-preview-handle"
        aria-label={open ? 'Minimise preview' : 'Show preview'}
        {...handleProps}
      >
        {handle}
        <span className="machine-weights-grabber" aria-hidden="true" />
      </button>
    </section>
  );
}
