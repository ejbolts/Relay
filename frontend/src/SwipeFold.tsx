import type { ReactNode, Ref } from 'react';
import type { SwipeToggleHandleProps } from './useSwipeToggle';
import './swipeFold.css';

/**
 * The part of a fold panel that folds away. Its panel sets `--open` and `--full` from
 * `useSwipeToggle`, and pass `contentRef` to `useElementHeight` so the fold knows its full height.
 */
export function SwipeFold({
  open,
  contentRef,
  className,
  children,
}: {
  open: boolean;
  contentRef: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className ? `swipe-fold ${className}` : 'swipe-fold'}
      aria-hidden={!open}
      inert={!open}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

/** The grab handle of a fold panel: drag it toward the panel's edge to fold it, or tap it. */
export function SwipeFoldHandle({
  className,
  label,
  handleProps,
  children,
}: {
  className: string;
  /** What the panel is, as in "Minimise guide" and "Show guide". */
  label: string;
  handleProps: SwipeToggleHandleProps;
  /** Shown with the grabber while folded, such as a chart's key. */
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`swipe-fold-handle ${className}`}
      aria-label={`${handleProps['aria-expanded'] ? 'Minimise' : 'Show'} ${label}`}
      {...handleProps}
    >
      {children}
      <span className="sheet-grabber" aria-hidden="true" />
    </button>
  );
}
