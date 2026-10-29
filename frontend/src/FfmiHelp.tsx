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
                  FFMI compares fat-free mass with height. The model reference is a benchmark based
                  on groups of trained lifters. It uses the selected profile for comparison, rather
                  than predicting your personal genetic limit.
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
                in metres squared, with height and sex adjustments. Fat-free mass is estimated from
                weight and body fat; it includes muscle, bone, organs and water.
              </p>
              <p>
                <strong>Model reference.</strong> This is a benchmark based on groups of trained
                lifters, not the general-public average or a prediction of your genetic limit. The
                men's model uses height, wrist, ankle and target body fat. The women's model uses a
                raw FFMI reference of 20, about 24.7 on the adjusted scale. Individual outcomes can
                be above or below these model assumptions.
              </p>
              <p>
                <strong>Gym-goer comparison.</strong> The extra point shows a training-sample
                average: 22.1 for men, or 20.6 for women on this app's adjusted scale (16.7 before
                adjustment). These come from separate, mostly young training groups, not a
                representative survey of all gym members or a drug-free standard. The male sample
                used self-reported body measurements; the female sample used scans. Training
                experience, age and measurement method affect comparisons.
              </p>
              <p>
                <strong>Reading the comparison.</strong> A model reference of 24.7 and the
                exceptional reported case at 28.0 are different comparisons, not guaranteed
                outcomes. The men's model assumes roughly 4 to 12% body fat. Measurement errors
                affect results; FFMI cannot establish drug use.
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
