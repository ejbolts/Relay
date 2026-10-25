import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FeedbackForm } from './FeedbackForm';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { HomeScreenGuideContent } from './HomeScreenGuide';
import { appGuideSteps, CONTRIBUTING_URL, PROJECT_URL } from './appGuideSteps';
import type { AppTab } from './appNavigation';

type TargetBox = { top: number; left: number; width: number; height: number };

export function AppGuide({
  videosAllowed,
  onNavigate,
  onClose,
}: {
  videosAllowed: boolean;
  onNavigate: (tab: AppTab) => void;
  onClose: () => void;
}) {
  const steps = appGuideSteps(videosAllowed);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<TargetBox | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = steps[index];
  const installing = index === steps.length;
  const finished = index > steps.length;
  const tab = step?.tab;
  const target = step?.target;

  useEffect(() => {
    if (tab) onNavigate(tab);
  }, [tab, onNavigate]);

  useEffect(() => {
    const title =
      titleRef.current ?? document.querySelector<HTMLElement>('.app-guide .home-guide-intro');
    title?.focus({ preventScroll: true });
    document.querySelector('.app-guide')?.scrollTo(0, 0);
  }, [index]);

  useEffect(() => {
    if (!target) return;
    let element: HTMLElement | null = null;
    const measure = () => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      // Browsers round scroll offsets; a sub-pixel remainder must not prevent measurement.
      if (!element.closest('.app-tab-bar') && rect.bottom > window.innerHeight - 83) {
        window.scrollBy(0, Math.ceil(rect.bottom - (window.innerHeight - 84)));
        return;
      }
      const top = Math.max(4, rect.top - 5);
      const left = Math.max(4, rect.left - 5);
      setBox({
        top,
        left,
        width: Math.max(
          0,
          Math.min(document.documentElement.clientWidth - 4, rect.right + 5) - left,
        ),
        height: Math.max(0, Math.min(window.innerHeight - 4, rect.bottom + 5) - top),
      });
    };
    const observer = new ResizeObserver(measure);
    // The next screen can mount after the tour's navigation effect.
    const frame = requestAnimationFrame(() => {
      element = document.querySelector<HTMLElement>(`[data-guide-target="${target}"]`);
      if (!element) {
        setBox(null);
        return;
      }
      if (!element.closest('.app-tab-bar')) {
        element.scrollIntoView({ behavior: 'instant', block: 'start' });
        // Leave room for the fixed page header; place the annotation beneath these controls.
        window.scrollBy(0, -96);
      }
      measure();
      observer.observe(element);
    });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [target]);

  // Put the annotation opposite the highlighted control, leaving it visible behind the modal.
  const position = box && box.top + box.height / 2 > window.innerHeight / 2 ? 'top' : 'bottom';
  const availableHeight =
    box && step
      ? position === 'top'
        ? box.top - 32
        : window.innerHeight - box.top - box.height - 32
      : null;
  return (
    <PopupDialog
      title={installing ? 'Add to Home Screen' : 'App guide'}
      kicker={
        finished
          ? 'YOU ARE READY'
          : installing
            ? 'SET UP YOUR PHONE'
            : `QUICK TOUR · ${index + 1} OF ${steps.length}`
      }
      className={`app-guide ${installing ? 'home-guide app-guide-install' : finished ? 'app-guide-finish' : `app-guide-${position}`}`}
      style={
        availableHeight
          ? ({ '--guide-max-height': `${Math.max(180, availableHeight)}px` } as CSSProperties)
          : undefined
      }
      onClose={onClose}
    >
      {step && box && <div className="app-guide-spotlight" style={box} aria-hidden="true" />}
      {installing ? (
        <HomeScreenGuideContent />
      ) : (
        <div className="app-guide-body">
          <div className="app-guide-step" key={index}>
            <span className="app-guide-glyph">
              <Icon name={step?.icon ?? 'heart'} />
            </span>
            <h3 ref={titleRef} tabIndex={-1}>
              {step?.title ?? 'Thanks for trying Relay!'}
            </h3>
            <p>
              {step?.description ??
                'We hope it makes your next workout a little easier. What worked well, and what could be better?'}
            </p>
          </div>
          {finished ? (
            <>
              <FeedbackForm optional onSendingChange={setSendingFeedback} />
              <details className="guide-contribute">
                <summary>Want to help build Relay?</summary>
                <p>
                  Check existing issues, discuss bigger changes first, then work on a focused branch
                  or fork. Use sample data, run the project checks and include screenshots for UI
                  changes in your pull request.
                </p>
                <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer">
                  GitHub repository <Icon name="external" />
                </a>
                <a href={CONTRIBUTING_URL} target="_blank" rel="noopener noreferrer">
                  Contribution instructions <Icon name="external" />
                </a>
              </details>
            </>
          ) : (
            <div className="app-guide-progress" aria-label={`Step ${index + 1} of ${steps.length}`}>
              {steps.map((item, itemIndex) => (
                <span key={item.target} className={itemIndex <= index ? 'complete' : ''} />
              ))}
            </div>
          )}
        </div>
      )}
      <footer className="popup-dialog-actions">
        <button type="button" className="guide-skip" disabled={sendingFeedback} onClick={onClose}>
          {finished ? 'End guide' : 'Skip guide'}
        </button>
        {index > 0 && !finished && (
          <button type="button" onClick={() => setIndex(index - 1)}>
            Back
          </button>
        )}
        {!finished && (
          <button
            type="button"
            className="popup-primary-action"
            onClick={() => setIndex(index + 1)}
          >
            {index === steps.length - 1 ? 'Show steps' : 'Next'} <span aria-hidden="true">→</span>
          </button>
        )}
      </footer>
    </PopupDialog>
  );
}
