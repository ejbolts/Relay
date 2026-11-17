import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { HelpPopup } from './HelpPopup';
import { liveWorkoutReport, type PresenceStatus } from './presence';
import { PresenceAvatar } from './PresenceAvatar';
import { VISIBILITY_LABELS } from './sharedProfileDisplay';
import { useUserSession } from './userContext';
import type { ProfileVisibility, SharingChoices, SharingSettings } from './types';

type OptionalChoice = Exclude<keyof SharingChoices, 'visibility'>;
type LiveChoice = 'share_online_status' | 'share_live_workouts';

const VISIBILITY_OPTIONS: Array<{ value: ProfileVisibility; description: string }> = [
  { value: 'private', description: 'Only you. You cannot see or add other members.' },
  {
    value: 'followers',
    description: 'Your friends. Others see only your name and photo.',
  },
  {
    value: 'public',
    description: 'Every member who shares. Friends still need your approval.',
  },
];

const ALWAYS_SHARED = [
  {
    label: 'Workouts + cardio',
    description: 'Exercises, sets, dates and durations, plus cardio time, distance and heart rate',
  },
  { label: 'Profile photo', description: 'Shown with your name, even before you become friends' },
];

const SHARING_OPTIONS: Array<{ key: OptionalChoice; label: string; description: string }> = [
  {
    key: 'share_machine_photos',
    label: 'Machine photos',
    description: 'Photos pinned to exercises in your shared workouts',
  },
  {
    key: 'share_body_weight',
    label: 'Body weight',
    description: 'Weigh-ins, body fat and body weight logged with sets',
  },
  {
    key: 'share_goals',
    label: 'Goals',
    description: 'Your body-weight goal and weekly Zone 2 cardio target',
  },
  {
    key: 'share_notes',
    label: 'Notes',
    description: 'Workout, exercise, set and cardio notes, including saved video links',
  },
];

const VISIBILITY_SAVED: Record<ProfileVisibility, string> = {
  private: 'Your profile is private. Nobody else can see it.',
  followers: 'Your profile is shared with your friends.',
  public: 'Your profile is public to every member who shares.',
};

const VISIBILITY_CONFIRM: Record<ProfileVisibility, string> = {
  private: 'Make my profile private',
  followers: 'Make my profile friends only',
  public: 'Make my profile public',
};

const LIVE_OPTIONS: Array<{ key: LiveChoice; label: string }> = [
  { key: 'share_online_status', label: 'Online status' },
  { key: 'share_live_workouts', label: 'Live workouts' },
];

const STATUS_TOAST_MS = 5000;

const PRIVATE_DEFAULTS: SharingChoices = {
  visibility: 'private',
  share_notes: false,
  share_body_weight: false,
  share_goals: false,
  share_machine_photos: false,
  share_online_status: true,
  share_live_workouts: true,
};

function choicesFrom(settings: SharingSettings): SharingChoices {
  return {
    visibility: settings.visibility,
    share_notes: settings.share_notes,
    share_body_weight: settings.share_body_weight,
    share_goals: settings.share_goals,
    share_machine_photos: settings.share_machine_photos,
    share_online_status: settings.share_online_status,
    share_live_workouts: settings.share_live_workouts,
  };
}

/** What friends would see right now with these choices: this device's workout, or online. */
function livePreview(choices: SharingChoices): { status: PresenceStatus; text: string } {
  const workout = choices.visibility === 'private' ? null : liveWorkoutReport();
  if (workout && choices.share_live_workouts) {
    return { status: { kind: 'workout', workout }, text: `Working out · ${workout.name}` };
  }
  if (choices.visibility !== 'private' && choices.share_online_status) {
    return { status: { kind: 'online' }, text: 'Active now' };
  }
  return { status: null, text: 'No live activity' };
}

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
  const [status, setStatus] = useState<{ message: string; id: number } | null>(null);
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

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), STATUS_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function save(next: SharingChoices, message: string) {
    if (saving) return;
    setSaving(true);
    setDraft(next);
    setStatus(null);
    setError(null);
    try {
      const stored = await api.sharing.updateChoices(next);
      setSaved(stored);
      setDraft(choicesFrom(stored));
      setStatus({ message, id: Date.now() });
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
  const visibilityPending = saved !== null && draft.visibility !== saved.visibility;

  function changeVisibility(visibility: ProfileVisibility) {
    setStatus(null);
    if (sharing && visibility === saved.visibility) setDraft(choicesFrom(saved));
    else setDraft({ ...draft, visibility });
  }

  function toggle(next: SharingChoices) {
    if (sharing && !visibilityPending) void save(next, 'Sharing choices saved.');
    else {
      setDraft(next);
      setStatus(null);
    }
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
          <button
            type="button"
            className="profile-primary sharing-start"
            disabled={saving || !visibilityPending}
            onClick={() => void save(draft, VISIBILITY_SAVED[draft.visibility])}
          >
            {saving && <Spinner />}
            <span>{VISIBILITY_CONFIRM[draft.visibility]}</span>
          </button>
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
          <small className="sharing-never">
            Shared accounts can be found by username. Your videos and sample data are never shared.
          </small>
          {status &&
            createPortal(
              <div
                key={status.id}
                className="undo-toast top-toast"
                role="status"
                aria-atomic="true"
                style={{ '--undo-toast-duration': `${STATUS_TOAST_MS}ms` } as CSSProperties}
              >
                <span>{status.message}</span>
                <button
                  className="undo-toast-close"
                  type="button"
                  aria-label="Dismiss sharing notification"
                  onClick={() => setStatus(null)}
                >
                  <Icon name="close" />
                </button>
              </div>,
              document.body,
            )}
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
  const { status, text } = livePreview(choices);
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
