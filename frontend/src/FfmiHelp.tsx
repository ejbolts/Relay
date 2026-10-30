import { useRef, useState, type ReactNode } from 'react';
import { PopupDialog } from './PopupDialog';
import './helpPopup.css';
import './ffmi.css';

export function FfmiHelp({ title = 'FFMI', children }: { title?: string; children?: ReactNode }) {
  const [view, setView] = useState<'overview' | 'methodology' | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setView(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <span className="help-popup" onClick={(event) => event.stopPropagation()}>
      <button
        ref={trigger}
        type="button"
        className="auth-help-button"
        aria-label={`About ${title.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={view !== null}
        onClick={() => setView('overview')}
      >
        ?
      </button>
      {view && (
        <PopupDialog
          key={view}
          title={view === 'methodology' ? 'FFMI methodology' : title}
          className="help-popup-dialog ffmi-help-dialog"
          onClose={close}
        >
          {view === 'overview' ? (
            <>
              {children ?? (
                <p>
                  FFMI compares estimated fat-free mass with height. The score uses the same formula
                  for men and women; the icon selects population reference points. These comparisons
                  describe a study sample, not training levels or personal limits.
                </p>
              )}
              <p>
                <button
                  type="button"
                  className="ffmi-methodology-link"
                  onClick={() => setView('methodology')}
                >
                  Learn more about FFMI methodology
                </button>
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>Your score.</strong> FFMI is estimated fat-free mass in kg divided by height
                in metres squared, without a sex multiplier or extra height adjustment. The same
                measurements produce the same score for either sex. Fat-free mass includes muscle,
                bone, organs and water. Previously displayed adjusted scores may therefore differ.
              </p>
              <p>
                <strong>Population references.</strong> The chart uses male or female 5th, 50th and
                95th percentiles from a non-random sample of white Swiss adults aged 18–34. The
                median is the middle of that sample: 18.9 for men and 15.4 for women. These are not
                worldwide averages, gym-goer norms, health cutoffs or achievement levels. We do not
                assign you a percentile from these three points.
              </p>
              <p>
                <strong>Score details.</strong> The optional male height-adjusted figure adds 6.1 ×
                (1.8 − height in metres) and is separate from the raw score on the chart. The
                sensitivity range shows what your FFMI would be if body fat were 3 percentage points
                higher or lower. This is an example, not a confidence interval or a measured error
                range. Track changes with a consistent measurement method.
              </p>
              <p>
                <strong>Model estimates.</strong> The separate model uses height, wrist, ankle and
                target body fat for men, assuming roughly 4–12% body fat. The women's model assumes
                FFMI 20. Both are rough model assumptions, not predictions of your genetic limit.
                People can exceed them. FFMI cannot establish drug use, and 25 is not a universal
                natural ceiling.
              </p>
              <p>
                <strong>Taking measurements.</strong> Keep tape positions consistent without
                compressing the skin. Measure the wrist below the hand and the ankle at its
                narrowest point above the ankle bones. Circumferences track body size, not muscle
                alone.
              </p>
              <p>
                <button
                  type="button"
                  className="ffmi-methodology-link"
                  onClick={() => setView('overview')}
                >
                  Back to overview
                </button>
              </p>
            </>
          )}
        </PopupDialog>
      )}
    </span>
  );
}
