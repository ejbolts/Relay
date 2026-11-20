import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { GuideCard, type GuideNext } from './GuideCard';
import './setupGuide.css';

export interface CoachStep {
  title: string;
  body: string;
  /** The control this step is about, found inside the coach's own dialog or page. */
  target?: string;
  /** Steps that finish by themselves (a switch turned on, a dialog opened) have no button. */
  next?: GuideNext;
}

/**
 * A setup guide's current step, pinned to the bottom of the screen it is guiding, as a guide card.
 * It highlights the control the step is about; the person uses the real control to move on.
 * Swiping its grabber down folds it to its title and Next, to see more of the screen; swiping up
 * or tapping brings it back, and so does moving to another step. Inside a dialog it sits above the
 * dialog's footer, so the dialog's main action stays in reach.
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
  const [dock, setDock] = useState(0);
  const { target, title } = step;
  // Dialogs keep their actions in a sticky footer; stay above it rather than over it.
  useLayoutEffect(() => {
    const footer = floating
      ? null
      : ref.current?.closest('dialog')?.querySelector<HTMLElement>(':scope > .popup-dialog-footer');
    if (!footer) {
      setDock(0);
      return;
    }
    const measure = () => setDock(footer.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, [floating, index]);
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
      style={dock ? ({ '--coach-dock': `calc(${dock}px + 0.5rem)` } as CSSProperties) : undefined}
    >
      <GuideCard
        guide="Setup guide"
        index={index}
        total={total}
        title={step.title}
        onBack={onBack}
        next={step.next}
        onLeave={onExit}
      >
        <p>{step.body}</p>
      </GuideCard>
    </aside>
  );
}
