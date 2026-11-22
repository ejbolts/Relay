import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { NotificationDialog } from './NotificationDialog';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import { RARITY_LABELS, borderUnlockedLabel } from './profileBorderLabels';
import {
  borderProgressLabel,
  borderProgressPercent,
  borderSets,
  borderTimeBadge,
  borderTimeLabel,
  shownTier,
} from './profileBorderProgress';
import type { ProfileBorders, User } from './types';

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
const numeral = (tier: number) => NUMERALS[tier - 1] ?? String(tier);

/** Every profile border with the account's progress; earned ones can be worn. */
export function ProfileBorderPicker({
  user,
  onSaved,
  onClose,
  onSetSex,
}: {
  user: User;
  onSaved: (user: User) => void;
  onClose: () => void;
  /** Opens the profile editor at the sex choice, which the strength borders wait on. */
  onSetSex: () => void;
}) {
  const [data, setData] = useState<ProfileBorders | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [previewKey, setPreviewKey] = useState<string | null>(user.profile_border ?? null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoadError(null);
    api.profileBorders().then(
      (loaded) => {
        if (!current) return;
        setData(loaded);
        // Start on the worn border, or on the first one earned (its best tier) to try on.
        const listed = (key: string | null) =>
          loaded.borders.some((border) => border.key === key) ? key : null;
        const sets = borderSets(loaded.borders).flatMap(([, groupSets]) => groupSets);
        const earned = sets.find((set) => set.some((border) => border.unlocked)) ?? sets[0];
        setPreviewKey(
          (previous) =>
            listed(previous) ??
            listed(loaded.selected) ??
            (earned ? shownTier(earned, null).key : null),
        );
      },
      (reason) => {
        if (current) setLoadError(authErrorMessage(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const groups = useMemo(() => borderSets(data?.borders ?? []), [data]);
  const unlocked = data?.borders.filter((border) => border.unlocked).length ?? 0;
  const preview = data?.borders.find((border) => border.key === previewKey) ?? null;
  const previewTiers = preview?.family
    ? (data?.borders ?? [])
        .filter((border) => border.family === preview.family)
        .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
    : [];
  const worn = data?.selected ?? null;

  async function wear(key: string | null) {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      onSaved(await api.chooseProfileBorder(key));
      setData((current) => (current ? { ...current, selected: key } : current));
      setStatus(key ? 'Border updated' : 'Border removed');
    } catch (reason) {
      setSaveError(authErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Borders"
      className="border-picker"
      kicker={data ? `${unlocked} of ${data.borders.length} unlocked` : undefined}
      onClose={onClose}
    >
      {!data ? (
        <div className="border-picker-loading">
          {loadError ? (
            <>
              <p className="inline-error" role="alert">
                {loadError}
              </p>
              <button
                type="button"
                className="profile-secondary"
                onClick={() => setAttempt((count) => count + 1)}
              >
                Try again
              </button>
            </>
          ) : (
            <p role="status">Loading borders…</p>
          )}
        </div>
      ) : (
        <>
          <section className="border-preview" aria-label="Selected border">
            <ProfileAvatar
              className="profile-avatar border-preview-avatar"
              user={{ ...user, profile_border: preview?.key ?? null }}
              animated
            />
            {preview && (
              <div className="border-preview-copy" aria-live="polite">
                <p className="border-preview-name">
                  <strong>{preview.name}</strong>
                  <span className={`border-rarity ${preview.rarity}`}>
                    {RARITY_LABELS[preview.rarity]}
                  </span>
                </p>
                {previewTiers.length > 1 && (
                  <div className="border-tiers" role="group" aria-label="Tiers">
                    {previewTiers.map((tier) => (
                      <button
                        key={tier.key}
                        type="button"
                        className={tier.unlocked ? 'is-earned' : undefined}
                        aria-pressed={tier.key === preview.key}
                        aria-label={`Tier ${tier.tier}, ${tier.unlocked ? 'unlocked' : 'locked'}`}
                        onClick={() => {
                          setPreviewKey(tier.key);
                          setSaveError(null);
                        }}
                      >
                        {numeral(tier.tier ?? 1)}
                        {!tier.unlocked && <Icon name="lock" />}
                      </button>
                    ))}
                  </div>
                )}
                <p className="border-preview-requirement">{preview.requirement}</p>
                {borderTimeLabel(preview) && (
                  <p className={`border-preview-timer ${preview.status ?? ''}`}>
                    <Icon name="timer" />
                    {borderTimeLabel(preview)}
                  </p>
                )}
                {preview.unlocked && borderUnlockedLabel(preview.unlocked_on) && (
                  <p className="border-preview-unlocked">
                    {borderUnlockedLabel(preview.unlocked_on)}
                  </p>
                )}
                {preview.needs_sex ? (
                  <button type="button" className="text-link" onClick={onSetSex}>
                    Set your sex to unlock
                  </button>
                ) : !preview.unlocked && preview.progress ? (
                  <div className="border-progress">
                    <span
                      className="border-progress-track"
                      role="progressbar"
                      aria-label={`${preview.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={preview.progress.target}
                      aria-valuenow={Math.min(preview.progress.current, preview.progress.target)}
                      aria-valuetext={borderProgressLabel(preview.progress)}
                    >
                      <span style={{ width: `${borderProgressPercent(preview.progress)}%` }} />
                    </span>
                    <small className="num">{borderProgressLabel(preview.progress)}</small>
                  </div>
                ) : worn === preview.key ? (
                  <div className="border-preview-actions">
                    <span className="border-wearing">
                      <Icon name="check" />
                      Wearing
                    </span>
                    <button
                      type="button"
                      className="text-link"
                      disabled={saving}
                      onClick={() => void wear(null)}
                    >
                      Take off
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="profile-primary border-wear"
                    disabled={saving}
                    onClick={() => void wear(preview.key)}
                  >
                    {saving ? 'Saving…' : 'Wear border'}
                  </button>
                )}
                {saveError && (
                  <p className="inline-error" role="alert">
                    {saveError}
                  </p>
                )}
              </div>
            )}
          </section>
          <div className="border-groups">
            {groups.map(([group, sets]) => (
              <section key={group} className="border-group" aria-label={group}>
                <h3>{group}</h3>
                <ul>
                  {sets.map((set) => {
                    const border = shownTier(set, worn);
                    const earned = set.filter((tier) => tier.unlocked).length;
                    const state =
                      worn === border.key ? 'wearing' : border.unlocked ? 'unlocked' : 'locked';
                    return (
                      <li key={border.family ?? border.key}>
                        <button
                          type="button"
                          className={`border-tile${border.unlocked ? '' : ' is-locked'}`}
                          aria-pressed={set.some((tier) => tier.key === previewKey)}
                          aria-label={
                            set.length > 1
                              ? `${border.name}, ${state}, ${earned} of ${set.length} tiers earned`
                              : `${border.name}, ${state}`
                          }
                          onClick={() => {
                            setPreviewKey(border.key);
                            setSaveError(null);
                          }}
                        >
                          <span className="border-tile-art">
                            <ProfileAvatar
                              className="profile-avatar border-tile-avatar"
                              user={{ ...user, profile_border: border.key }}
                            />
                            {borderTimeBadge(border) && (
                              <span className="border-tile-timer">{borderTimeBadge(border)}</span>
                            )}
                            {worn === border.key ? (
                              <span className="border-tile-badge is-worn">
                                <Icon name="check" />
                              </span>
                            ) : (
                              !border.unlocked && (
                                <span className="border-tile-badge">
                                  <Icon name="lock" />
                                </span>
                              )
                            )}
                          </span>
                          <span className="border-tile-name">{border.name}</span>
                          {set.length > 1 && (
                            <span className="border-tile-pips" aria-hidden="true">
                              {set.map((tier) => (
                                <i
                                  key={tier.key}
                                  className={tier.unlocked ? 'is-earned' : undefined}
                                />
                              ))}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
      {status && (
        <NotificationDialog
          message={status}
          portal={false}
          durationMs={2500}
          onClose={() => setStatus(null)}
        />
      )}
    </PopupDialog>
  );
}
