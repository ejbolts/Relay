import { useEffect, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { CollapsibleSection } from './CollapsibleSection';
import { HelpPopup } from './HelpPopup';
import { liveWorkoutReport } from './presence';
import { PresenceAvatar } from './PresenceAvatar';
import { VISIBILITY_LABELS } from './sharedProfileDisplay';
import { useToast } from './Toast';
import { useUserSession } from './userContext';
import {
  ALWAYS_SHARED,
  choicesFrom,
  LIVE_OPTIONS,
  livePreview,
  PRIVATE_DEFAULTS,
  savesAtOnce,
  SHARING_CHOICES_SAVED,
  SHARING_NEVER,
  SHARING_OPTIONS,
  VISIBILITY_CONFIRM,
  VISIBILITY_OPTIONS,
  VISIBILITY_SAVED,
  visibilityPending as isVisibilityPending,
  withVisibility,
} from './sharingChoices';
import type { ProfileVisibility, SharingChoices, SharingSettings } from './types';

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

/** Settings' sharing section: who can see the profile, and what it shares. */
export function ProfileSharingPanel({ onSaved }: { onSaved?: () => void }) {
  const { user } = useUserSession();
  const [saved, setSaved] = useState<SharingSettings | null>(null);
  const [draft, setDraft] = useState<SharingChoices>(PRIVATE_DEFAULTS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.sharing
      .choices()
      .then((settings) => {
        if (cancelled) return;
        setSaved(settings);
        setDraft(choicesFrom(settings));
        setLoadError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(authErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const sharing = saved !== null && saved.visibility !== 'private';

  async function save(next: SharingChoices, message: string) {
    if (saving) return;
    setSaving(true);
    setDraft(next);
    setError(null);
    try {
      const stored = await api.sharing.updateChoices(next);
      setSaved(stored);
      setDraft(choicesFrom(stored));
      toast.show(message);
      onSaved?.();
    } catch (reason) {
      setDraft(saved ? choicesFrom(saved) : PRIVATE_DEFAULTS);
      setError(authErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  // A new visibility stays a draft until its confirm button is pressed; reselecting the saved
  // one cancels it. Share toggles save at once while sharing with no visibility change pending.
  const visibilityPending = isVisibilityPending(saved, draft);

  function changeVisibility(visibility: ProfileVisibility) {
    setDraft(withVisibility(saved, draft, visibility));
  }

  function toggle(next: SharingChoices) {
    if (savesAtOnce(saved, draft)) void save(next, SHARING_CHOICES_SAVED);
    else setDraft(next);
  }

  return (
    <CollapsibleSection
      className="settings-panel panel profile-sharing"
      kicker="SHARING"
      title="Profile sharing"
      help={
        <HelpPopup title="Profile sharing">
          <p>
            Choose who can see your training. Only members who share their own profile can see or
            follow others.
          </p>
        </HelpPopup>
      }
      defaultExpanded
      badge={
        saved && (
          <span className={`sharing-state ${sharing ? 'is-on' : ''}`}>
            {VISIBILITY_LABELS[saved.visibility]}
          </span>
        )
      }
    >
      {loadError ? (
        <div className="sharing-load-error">
          <p className="inline-error" role="alert">
            {loadError}
          </p>
          <button
            type="button"
            className="profile-secondary"
            onClick={() => {
              setLoadError(null);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : !saved ? (
        <p className="sharing-loading" role="status">
          Loading your sharing choices…
        </p>
      ) : (
        <>
          <fieldset className="sharing-visibility" disabled={saving}>
            <legend>Who can see your profile</legend>
            {VISIBILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={draft.visibility === option.value ? 'is-selected' : undefined}
              >
                <input
                  type="radio"
                  name="profile-visibility"
                  value={option.value}
                  checked={draft.visibility === option.value}
                  onChange={() => changeVisibility(option.value)}
                />
                <span>
                  <strong>{VISIBILITY_LABELS[option.value]}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {/* The saved choice is shown by its radio and the badge; the button only confirms a change. */}
          {(visibilityPending || saving) && (
            <button
              type="button"
              className="profile-primary sharing-start"
              disabled={saving}
              onClick={() => void save(draft, VISIBILITY_SAVED[draft.visibility])}
            >
              {saving && <Spinner />}
              <span>{VISIBILITY_CONFIRM[draft.visibility]}</span>
            </button>
          )}
          <CollapsibleSection
            className="sharing-options"
            title="What you share"
            headingLevel={3}
            headingClassName="sharing-group-title"
          >
            {ALWAYS_SHARED.map((item) => (
              <div className="notification-setting-row" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={item.label}
                  aria-checked="true"
                  aria-disabled="true"
                  className="is-on is-locked"
                >
                  <span />
                  Always
                </button>
              </div>
            ))}
            {SHARING_OPTIONS.map((option) => (
              <div className="notification-setting-row" key={option.key}>
                <div>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={option.label}
                  aria-checked={draft[option.key]}
                  className={draft[option.key] ? 'is-on' : ''}
                  disabled={saving}
                  onClick={() => toggle({ ...draft, [option.key]: !draft[option.key] })}
                >
                  <span />
                  {draft[option.key] ? 'On' : 'Off'}
                </button>
              </div>
            ))}
          </CollapsibleSection>
          <CollapsibleSection
            className="sharing-options sharing-live"
            title="Live activity"
            headingLevel={3}
            headingClassName="sharing-group-title"
          >
            {LIVE_OPTIONS.map((option) => (
              <div className="notification-setting-row" key={option.key}>
                <div>
                  <strong>{option.label}</strong>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={option.label}
                  aria-checked={draft[option.key]}
                  className={draft[option.key] ? 'is-on' : ''}
                  disabled={saving}
                  onClick={() => toggle({ ...draft, [option.key]: !draft[option.key] })}
                >
                  <span />
                  {draft[option.key] ? 'On' : 'Off'}
                </button>
              </div>
            ))}
            <LivePreview choices={draft} user={user} />
          </CollapsibleSection>
          <small className="sharing-never">{SHARING_NEVER}</small>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}

function LivePreview({
  choices,
  user,
}: {
  choices: SharingChoices;
  user: ReturnType<typeof useUserSession>['user'];
}) {
  const { status, text } = livePreview(choices, liveWorkoutReport());
  return (
    <div className="sharing-live-preview">
      <span className="sharing-live-preview-label">Friends see you as</span>
      <div className="sharing-live-preview-person">
        {user && <PresenceAvatar user={user} status={status} />}
        <span className="friend-card-name">
          {user && <b>{user.display_name}</b>}
          <small className={`friend-status ${status?.kind ?? 'hidden'}`}>{text}</small>
        </span>
      </div>
    </div>
  );
}
