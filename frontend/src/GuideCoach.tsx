import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
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
 * the control the step is about; the person uses the real control to move on.
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
      className={`setup-coach${floating ? ' is-floating' : ''}`}
      aria-label="Setup guide"
    >
      <header>
        <span className="setup-coach-kicker">
          <Icon name="sparkle" />
          Setup guide · {index + 1} of {total}
        </span>
        <button type="button" className="setup-coach-exit" onClick={onExit}>
          Exit guide
        </button>
      </header>
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
      <span className="setup-coach-progress" aria-hidden="true">
        {Array.from({ length: total }, (_, item) => (
          <i key={item} className={item <= index ? 'is-done' : undefined} />
        ))}
      </span>
    </aside>
  );
}
