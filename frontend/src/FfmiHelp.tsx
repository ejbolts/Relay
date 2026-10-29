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
                  FFMI compares fat-free mass with height. The potential marker is a model estimate,
                  while the comparison labels describe research reference points, including
                  exceptional cases. They are guides, not guaranteed personal limits.
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
                <strong>Your score.</strong> FFMI relates fat-free mass to height. Fat-free mass
                includes muscle, bone, organs and water. We use your latest weigh-in with body fat,
                divide lean mass in kg by height in metres squared, then adjust men to 1.8 m and
                divide women&apos;s scores by 0.81 for the comparison scale.
              </p>
              <p>
                <strong>Men&apos;s natural potential.</strong> Height, wrist and ankle size estimate
                the lean mass a fully developed natural lifter might carry. We follow the reference
                calculator&apos;s Casey Butt model, which draws on the larger sample and revised
                formulas in the fourth edition of <em>Your Muscular Potential</em>. Earlier online
                formulas can give higher estimates because they relied on fewer, unusually gifted
                athletes. Target body fat adjusts the estimate and converts lean mass to bodyweight.
              </p>
              <p>
                <strong>Women&apos;s estimate.</strong> We use a raw FFMI reference of 20, informed
                by Chappell et al. (2018), or about 24.7 on this adjusted scale. This is a model
                assumption, not a proven limit for every woman. The 0.81 adjustment reflects average
                female-to-male FFMI ratios in the reference research. Evidence is more limited for
                women; the reference calculator provides whole-body estimates for women rather than
                individual body-part potential. Relay&apos;s circumference histories show your
                recorded measurements separately from its whole-body potential estimate.
              </p>
              <p>
                <strong>Research behind the reference.</strong> The source&apos;s probability model
                pools experienced, drug-tested bodybuilders studied by Kouri (1995), Mäestu (2010)
                and Chappell (2018). It combines the studies&apos; height-adjusted FFMI averages and
                spread, corrects for body-composition measurement error, and fits a bell curve to
                estimate how common a score could be among natural lifters. Relay shows reference
                levels and whole-body potential; it does not calculate this probability.
              </p>
              <p>
                <strong>How to interpret it.</strong> These are population-based estimates, not a
                personal genetic ceiling. The men&apos;s model is intended for very lean physiques,
                roughly 4–12% body fat; a higher body-fat target does not make it reliable outside
                that range. Body-fat and tape-measure errors affect the result. An FFMI score cannot
                establish whether someone uses performance-enhancing drugs.
              </p>
              <p>
                <strong>Taking measurements.</strong> Measure your wrist just below the hand, above
                the bone on the outside, and your ankle at its narrowest point above the ankle
                bones. Use a tape without compressing the skin. Height and these frame measurements
                belong in FFMI details.
              </p>
              <p>
                <strong>Why 24.7 can sit below 28.</strong> The potential marker is an estimate from
                the selected model. For men it depends on height, frame measurements and target body
                fat; for women the adjusted reference is about 24.7. The 28.0 comparison point
                represents an exceptional reported natural case. Neither is a guaranteed personal
                ceiling: models simplify individual variation, and an unusual reported case is not
                an expected outcome for everyone.
              </p>
              <p>
                <a
                  className="ffmi-methodology-link"
                  href="https://mennohenselmans.com/ffmi-calculator/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source: Menno Henselmans&apos; FFMI calculator
                </a>
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
