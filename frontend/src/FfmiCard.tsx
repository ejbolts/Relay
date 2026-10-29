import { useEffect, useState, type CSSProperties } from 'react';
import { api } from './api';
import { HelpPopup } from './HelpPopup';
import { PopupDialog } from './PopupDialog';
import {
  DEFAULT_FFMI_PROFILE,
  FFMI_COMPARISON,
  FFMI_TICK_LABELS_BELOW,
  FFMI_UNLABELLED_TICKS,
  ffmiScalePercent,
  ffmiScore,
  latestBodyFatMeasurement,
  lengthFromCm,
  lengthToCm,
  naturalPotential,
} from './ffmi';
import { useWeightUnit } from './trainingPreferencesContext';
import type { BodyMeasurement, FfmiProfile } from './types';
import { formatWeight } from './weightUnits';
import './ffmi.css';

const LENGTH_LIMITS_CM = {
  height_cm: [100, 250],
  wrist_cm: [10, 30],
  ankle_cm: [12, 40],
} as const;

type LengthField = keyof typeof LENGTH_LIMITS_CM;

function inputValue(cm: number | null, unit: 'kg' | 'lb'): string {
  return cm === null ? '' : String(lengthFromCm(cm, unit));
}

export function FfmiScale({ ffmi, maxFfmi }: { ffmi: number; maxFfmi: number | null }) {
  const position = (value: number) => ({ left: `${ffmiScalePercent(value)}%` }) as CSSProperties;
  const labels = (below: boolean) => (
    <div className={`ffmi-scale-ticks${below ? ' below' : ''}`} aria-hidden="true">
      {FFMI_COMPARISON.filter(
        ({ value }) =>
          !FFMI_UNLABELLED_TICKS.has(value) && FFMI_TICK_LABELS_BELOW.has(value) === below,
      ).map(({ value }) => (
        <span key={value} className="ffmi-scale-tick" style={position(value)}>
          <i>{value.toFixed(1)}</i>
        </span>
      ))}
    </div>
  );
  return (
    <div className="ffmi-scale">
      {labels(false)}
      <div
        className="ffmi-scale-track"
        role="img"
        aria-label={`Your FFMI ${ffmi.toFixed(1)}${maxFfmi === null ? '' : `, natural max ${maxFfmi.toFixed(1)}`}, on a scale from 17 to 29`}
      >
        <span className="ffmi-scale-fill" style={{ width: `${ffmiScalePercent(ffmi)}%` }} />
        {FFMI_COMPARISON.map(({ value }) => (
          <span key={value} className="ffmi-scale-line" style={position(value)} />
        ))}
        {maxFfmi !== null && <span className="ffmi-scale-marker max" style={position(maxFfmi)} />}
        <span className="ffmi-scale-marker you" style={position(ffmi)} />
      </div>
      {labels(true)}
      <div className="ffmi-scale-key">
        <span className="you">You {ffmi.toFixed(1)}</span>
        {maxFfmi !== null && <span className="max">Natural max {maxFfmi.toFixed(1)}</span>}
      </div>
    </div>
  );
}

export function FfmiCard({
  measurements,
  dataRevision = null,
  initialProfile = null,
}: {
  measurements: BodyMeasurement[];
  dataRevision?: string | null;
  initialProfile?: FfmiProfile | null;
}) {
  const weightUnit = useWeightUnit();
  const lengthUnit = weightUnit === 'lb' ? 'in' : 'cm';
  const [profile, setProfile] = useState<FfmiProfile | null>(initialProfile);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FfmiProfile>(DEFAULT_FFMI_PROFILE);
  const [lengths, setLengths] = useState<Record<LengthField, string>>({
    height_cm: '',
    wrist_cm: '',
    ankle_cm: '',
  });
  const [targetBodyFat, setTargetBodyFat] = useState('10');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .getFfmiProfile()
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch(() => {
        if (!cancelled) setProfile((current) => current ?? DEFAULT_FFMI_PROFILE);
      });
    return () => {
      cancelled = true;
    };
  }, [dataRevision]);

  if (!profile) return null;

  const measurement = latestBodyFatMeasurement(measurements);
  const ready = profile.sex !== null && profile.height_cm !== null;
  const ffmi =
    ready && measurement
      ? ffmiScore(
          profile.sex!,
          profile.height_cm!,
          measurement.weight_kg,
          measurement.body_fat_pct!,
        )
      : null;
  const potential = measurement ? naturalPotential(profile, measurement) : null;
  const needsFrame = profile.sex === 'male' && (!profile.wrist_cm || !profile.ankle_cm);

  function openEditor() {
    const current = profile ?? DEFAULT_FFMI_PROFILE;
    setDraft(current);
    setLengths({
      height_cm: inputValue(current.height_cm, weightUnit),
      wrist_cm: inputValue(current.wrist_cm, weightUnit),
      ankle_cm: inputValue(current.ankle_cm, weightUnit),
    });
    setTargetBodyFat(String(current.target_body_fat_pct));
    setError(null);
    setEditing(true);
  }

  function parseLength(field: LengthField): number | null | undefined {
    const text = lengths[field].trim();
    if (!text) return null;
    const cm = lengthToCm(Number(text), weightUnit);
    const [low, high] = LENGTH_LIMITS_CM[field];
    return Number.isFinite(cm) && cm >= low && cm <= high ? Math.round(cm * 10) / 10 : undefined;
  }

  async function save() {
    const height = parseLength('height_cm');
    const male = draft.sex === 'male';
    const wrist = male ? parseLength('wrist_cm') : null;
    const ankle = male ? parseLength('ankle_cm') : null;
    const target = Number(targetBodyFat);
    if (!draft.sex) return setError('Choose male or female.');
    if (height === null || height === undefined)
      return setError(
        `Enter a height between ${lengthFromCm(100, weightUnit)} and ${lengthFromCm(250, weightUnit)} ${lengthUnit}.`,
      );
    if (wrist === undefined || ankle === undefined)
      return setError('Check the wrist and ankle measurements.');
    if (!targetBodyFat.trim() || !Number.isFinite(target) || target < 3 || target > 40)
      return setError('Enter a target body fat between 3 and 40%.');
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateFfmiProfile({
        sex: draft.sex,
        height_cm: height,
        wrist_cm: wrist,
        ankle_cm: ankle,
        target_body_fat_pct: target,
      });
      setProfile(saved);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save these details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pulse-card ffmi-card" aria-label="FFMI">
      <header className="pulse-card-header">
        <h2 className="profile-help-row">
          FFMI{' '}
          <HelpPopup title="FFMI methodology">
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
              <strong>Women&apos;s estimate.</strong> We use a raw FFMI ceiling of 20, informed by
              Chappell et al. (2018), or about 24.7 on this adjusted scale. The 0.81 adjustment
              reflects average female-to-male FFMI ratios in the reference research. Evidence is
              more limited for women; the reference calculator provides whole-body estimates for
              women rather than individual body-part potential. Relay&apos;s circumference histories
              show your recorded measurements separately from its whole-body potential estimate.
            </p>
            <p>
              <strong>Research behind the reference.</strong> The source&apos;s probability model
              pools experienced, drug-tested bodybuilders studied by Kouri (1995), Mäestu (2010) and
              Chappell (2018). It combines the studies&apos; height-adjusted FFMI averages and
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
              the bone on the outside, and your ankle at its narrowest point above the ankle bones.
              Use a tape without compressing the skin. Height and these frame measurements belong in
              FFMI details.
            </p>
            <p>
              <a
                className="ffmi-methodology-link"
                href="https://mennohenselmans.com/ffmi-calculator/"
                target="_blank"
                rel="noreferrer"
              >
                Learn more about FFMI methodology
              </a>
            </p>
          </HelpPopup>
        </h2>
        {ready && (
          <button type="button" className="ffmi-edit" onClick={openEditor}>
            Edit
          </button>
        )}
      </header>

      {!ready && (
        <button type="button" className="ffmi-setup" onClick={openEditor}>
          Add height and sex
        </button>
      )}

      {ready && !measurement && (
        <p className="ffmi-empty">Log a weigh-in with body fat % to see your FFMI.</p>
      )}

      {ffmi !== null && measurement && (
        <>
          <div className="ffmi-score">
            <strong>{ffmi.toFixed(1)}</strong>
            <span>{profile.sex === 'male' ? 'Normalized FFMI' : 'Gender-adjusted FFMI'}</span>
          </div>
          <FfmiScale ffmi={ffmi} maxFfmi={potential?.maxFfmi ?? null} />
          <ol className="ffmi-legend">
            {FFMI_COMPARISON.map(({ value, label }) => (
              <li key={value} className={ffmi >= value ? 'reached' : ''}>
                <strong>{value.toFixed(1)}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          {potential && (
            <dl className="ffmi-potential">
              <div>
                <dt>Max lean mass</dt>
                <dd>{formatWeight(potential.maxLeanMassKg, weightUnit, 1)}</dd>
              </div>
              <div>
                <dt>Max weight at {profile.target_body_fat_pct}% fat</dt>
                <dd>{formatWeight(potential.maxBodyweightKg, weightUnit, 1)}</dd>
              </div>
              <div>
                <dt>Lean mass left</dt>
                <dd>{formatWeight(Math.max(0, potential.leanMassLeftKg), weightUnit, 1)}</dd>
              </div>
            </dl>
          )}
          {needsFrame && (
            <button type="button" className="ffmi-setup" onClick={openEditor}>
              Add wrist and ankle for your natural max
            </button>
          )}
        </>
      )}

      {editing && (
        <PopupDialog
          title="FFMI details"
          kicker="BODY"
          className="body-entry-popup"
          onClose={() => setEditing(false)}
        >
          <form
            className="body-entry-form ffmi-profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="segmented-control" role="radiogroup" aria-label="Sex">
              {(
                [
                  ['male', 'Male'],
                  ['female', 'Female'],
                ] as const
              ).map(([sex, label]) => (
                <button
                  key={sex}
                  type="button"
                  role="radio"
                  aria-checked={draft.sex === sex}
                  className={draft.sex === sex ? 'active' : ''}
                  onClick={() => setDraft((current) => ({ ...current, sex }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="body-entry-fields">
              {(
                [
                  ['height_cm', 'Height'],
                  ...(draft.sex === 'male'
                    ? ([
                        ['wrist_cm', 'Wrist'],
                        ['ankle_cm', 'Ankle'],
                      ] as const)
                    : []),
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  {label} ({lengthUnit})
                  <input
                    inputMode="decimal"
                    type="number"
                    step="0.1"
                    value={lengths[field]}
                    placeholder={field === 'height_cm' ? undefined : 'Optional'}
                    onChange={(event) =>
                      setLengths((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <label>
                Target body fat %
                <input
                  inputMode="decimal"
                  type="number"
                  min="3"
                  max="40"
                  step="0.5"
                  value={targetBodyFat}
                  onChange={(event) => setTargetBodyFat(event.target.value)}
                />
              </label>
            </div>
            {error && <p className="inline-error">{error}</p>}
            <footer className="popup-dialog-actions">
              <button type="button" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="popup-primary-action" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </form>
        </PopupDialog>
      )}
    </section>
  );
}
