import { useEffect, useRef, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { useElementHeight } from './useElementHeight';
import { useSwipeToggle } from './useSwipeToggle';
import './setupGuide.css';

export interface CoachStep {
  title: string;
  body: string;
  /** The control this step is about, found inside the coach's own dialog or page. */
  target?: string;
  /** Steps that finish by themselves (a switch turned on, a dialog opened) have no button. */
  next?: { label?: string; disabled?: boolean; onClick: () => void };
}

/**
 * A setup guide's current step, pinned to the bottom of the screen it is guiding. It highlights
 * the control the step is about; the person uses the real control to move on. Swiping its handle
 * down minimises it to the header, to see more of the screen; swiping up or tapping brings it back,
 * and so does moving to another step.
 */
export function GuideCoach({
  step,
  index,
  total,
  floating = false,
  onBack,
  onExit,
}: {
  step: CoachStep;
  index: number;
  total: number;
  /** On a page rather than inside a dialog, so it sits above the page instead of in its flow. */
  floating?: boolean;
  /** Returns to the previous step on this screen; left out on a screen's first step. */
  onBack?: () => void;
  onExit: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [bodyRef, full] = useElementHeight<HTMLDivElement>();
  const { open, dragged, handleProps } = useSwipeToggle({ opens: 'up', full, resetKey: index });
  const { target, title } = step;
  useEffect(() => {
    if (!target) return;
    const scope = (): ParentNode => ref.current?.closest('dialog') ?? document;
    let element: Element | null = null;
    let scrolled = false;
    /** Brings the control into view above the coach, which covers the bottom of the screen. */
    const reveal = (control: Element) => {
      control.scrollIntoView?.({ block: 'center' });
      const coachTop = ref.current?.getBoundingClientRect().top ?? window.innerHeight;
      const hidden = control.getBoundingClientRect().bottom + 16 - coachTop;
      if (hidden <= 0) return;
      const dialog = ref.current?.closest('dialog');
      if (dialog) dialog.scrollTop += hidden;
      else window.scrollBy(0, hidden);
    };
    // Controls can re-render or appear a moment later, so keep the highlight on the current one.
    const mark = () => {
      const found = scope().querySelector(target);
      if (found !== element) {
        element?.classList.remove('guide-target');
        element = found;
      }
      if (!element) return;
      element.classList.add('guide-target');
      // A dialog opens after its contents mount, so wait until the control has a layout box.
      if (!scrolled && element.getClientRects().length) {
        scrolled = true;
        reveal(element);
      }
    };
    mark();
    const timer = window.setInterval(mark, 400);
    return () => {
      window.clearInterval(timer);
      element?.classList.remove('guide-target');
    };
  }, [target, title]);
  return (
    <aside
      ref={ref}
      className={`setup-coach${floating ? ' is-floating' : ''}${dragged === null ? '' : ' is-dragging'}`}
      aria-label="Setup guide"
      style={{ '--open': dragged ?? (open ? 1 : 0), '--full': `${full}px` } as CSSProperties}
    >
      <button
        type="button"
        className="setup-coach-handle"
        aria-label={open ? 'Minimise setup guide' : 'Show setup guide'}
        {...handleProps}
      >
        <span className="setup-coach-grabber" aria-hidden="true" />
      </button>
      <header>
        <span className="setup-coach-kicker">
          <Icon name="sparkle" />
          Setup guide · {index + 1} of {total}
        </span>
        <button type="button" className="setup-coach-exit" onClick={onExit}>
          Exit guide
        </button>
      </header>
      <div className="setup-coach-body" aria-hidden={!open}>
        <div ref={bodyRef}>
          <div aria-live="polite">
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </div>
          {(onBack || step.next) && (
            <div className="setup-coach-actions">
              {onBack && (
                <button type="button" className="setup-coach-back" onClick={onBack}>
                  <Icon name="chevron-left" />
                  Back
                </button>
              )}
              {step.next && (
                <button
                  type="button"
                  className="setup-coach-next"
                  disabled={step.next.disabled}
                  onClick={step.next.onClick}
                >
                  {step.next.label ?? 'Next'}
                  <Icon name="chevron-right" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <span className="setup-coach-progress" aria-hidden="true">
        {Array.from({ length: total }, (_, item) => (
          <i key={item} className={item <= index ? 'is-done' : undefined} />
        ))}
      </span>
    </aside>
  );
}
