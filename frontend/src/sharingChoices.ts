import type { PresenceStatus } from './presenceStatus';
import type { LiveWorkout, ProfileVisibility, SharingChoices, SharingSettings } from './types';

// Profile sharing's choices and wording, shared by the web's Settings and the app.

export type OptionalChoice = Exclude<keyof SharingChoices, 'visibility'>;
export type LiveChoice = 'share_online_status' | 'share_live_workouts';

export const VISIBILITY_OPTIONS: Array<{ value: ProfileVisibility; description: string }> = [
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

export const ALWAYS_SHARED = [
  {
    label: 'Workouts + cardio',
    description: 'Exercises, sets, dates and durations, plus cardio time, distance and heart rate',
  },
  { label: 'Profile photo', description: 'Shown with your name, even before you become friends' },
];

export const SHARING_OPTIONS: Array<{ key: OptionalChoice; label: string; description: string }> = [
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
    key: 'share_body_sizes',
    label: 'Body measurements',
    description: 'Neck, chest, waist, arm and leg measurements',
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

export const VISIBILITY_SAVED: Record<ProfileVisibility, string> = {
  private: 'Your profile is private. Nobody else can see it.',
  followers: 'Your profile is shared with your friends.',
  public: 'Your profile is public to every member who shares.',
};

export const VISIBILITY_CONFIRM: Record<ProfileVisibility, string> = {
  private: 'Make my profile private',
  followers: 'Make my profile friends only',
  public: 'Make my profile public',
};

export const LIVE_OPTIONS: Array<{ key: LiveChoice; label: string }> = [
  { key: 'share_online_status', label: 'Online status' },
  { key: 'share_live_workouts', label: 'Live workouts' },
];

export const SHARING_NEVER =
  'Shared accounts can be found by username. Your videos and sample data are never shared.';

export const SHARING_CHOICES_SAVED = 'Sharing choices saved.';

export const PRIVATE_DEFAULTS: SharingChoices = {
  visibility: 'private',
  share_notes: false,
  share_body_weight: false,
  share_body_sizes: false,
  share_goals: false,
  share_machine_photos: false,
  share_online_status: true,
  share_live_workouts: true,
};

export function choicesFrom(settings: SharingSettings): SharingChoices {
  return {
    visibility: settings.visibility,
    share_notes: settings.share_notes,
    share_body_weight: settings.share_body_weight,
    // Missing from a server that predates the choice.
    share_body_sizes: settings.share_body_sizes ?? false,
    share_goals: settings.share_goals,
    share_machine_photos: settings.share_machine_photos,
    share_online_status: settings.share_online_status,
    share_live_workouts: settings.share_live_workouts,
  };
}

/**
 * A new visibility stays a draft until it is confirmed; choosing the saved one again cancels it.
 * Share switches save at once while the profile is shared and no visibility change is pending.
 */
export function visibilityPending(saved: SharingSettings | null, draft: SharingChoices): boolean {
  return saved !== null && draft.visibility !== saved.visibility;
}

/** Whether changing a share switch saves straight away, or only changes the draft. */
export function savesAtOnce(saved: SharingSettings | null, draft: SharingChoices): boolean {
  return saved !== null && saved.visibility !== 'private' && !visibilityPending(saved, draft);
}

/** The draft after choosing a visibility: reselecting the saved one drops the pending change. */
export function withVisibility(
  saved: SharingSettings | null,
  draft: SharingChoices,
  visibility: ProfileVisibility,
): SharingChoices {
  if (saved && saved.visibility !== 'private' && visibility === saved.visibility)
    return choicesFrom(saved);
  return { ...draft, visibility };
}

/** What friends would see right now with these choices: this device's workout, or online. */
export function livePreview(
  choices: SharingChoices,
  workout: LiveWorkout | null,
): { status: PresenceStatus; text: string } {
  const live = choices.visibility === 'private' ? null : workout;
  if (live && choices.share_live_workouts) {
    return { status: { kind: 'workout', workout: live }, text: `Working out · ${live.name}` };
  }
  if (choices.visibility !== 'private' && choices.share_online_status) {
    return { status: { kind: 'online' }, text: 'Active now' };
  }
  return { status: null, text: 'No live activity' };
}
