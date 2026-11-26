import type {
  CommentPage,
  FriendConnections,
  FriendFeed,
  FriendStatus,
  LiftComparisons,
  NotificationReadReference,
  SharedProfile,
  SharedProfileSummary,
  Routine,
  SharedWorkoutFilterOptions,
  SharedWorkoutFilters,
  SharedWorkoutKind,
  SharedWorkoutPage,
  SharingChoices,
  SharingNotifications,
  SharingSettings,
  SuggestedProfilePage,
  Timeline,
  WorkoutComment,
  WorkoutPhoto,
  WorkoutReactionKind,
  WorkoutReactionPage,
  WorkoutReactions,
} from '../../../../frontend/src/types';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';

// The sharing endpoints the web's `api.sharing` uses, for Social and profiles.

const id = encodeURIComponent;

export const socialApi = {
  friends: (signal?: AbortSignal) => apiGet<FriendConnections>('/api/sharing/friends', signal),
  timeline: (offset: number, limit: number, signal?: AbortSignal) =>
    apiGet<Timeline>(`/api/sharing/timeline?offset=${offset}&limit=${limit}`, signal),
  feed: (limit: number, signal?: AbortSignal) =>
    apiGet<FriendFeed>(`/api/sharing/feed?limit=${limit}`, signal),
  choices: (signal?: AbortSignal) => apiGet<SharingSettings>('/api/sharing', signal),
  updateChoices: (choices: SharingChoices) =>
    apiSend<SharingSettings>('/api/sharing', 'PUT', choices),
  friendInvite: () => apiGet<{ invite_code: string | null }>('/api/auth/friend-invite'),
  search: (query: string, signal?: AbortSignal) =>
    apiGet<SharedProfileSummary[]>(
      `/api/sharing/profiles?q=${encodeURIComponent(query.trim())}`,
      signal,
    ),
  suggestions: (page: number, signal?: AbortSignal) =>
    apiGet<SuggestedProfilePage>(`/api/sharing/suggestions?page=${page}`, signal),
  profile: (userId: string, signal?: AbortSignal) =>
    apiGet<SharedProfile>(`/api/sharing/profiles/${id(userId)}`, signal),
  lifts: (userId: string, signal?: AbortSignal) =>
    apiGet<LiftComparisons>(`/api/sharing/profiles/${id(userId)}/lifts`, signal),
  workouts: (
    userId: string,
    offset: number,
    limit: number,
    filters: Partial<SharedWorkoutFilters> & { kind?: SharedWorkoutKind } = {},
    signal?: AbortSignal,
  ) =>
    apiGet<SharedWorkoutPage>(
      `/api/sharing/profiles/${id(userId)}/workouts?${new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => !!value)),
      })}`,
      signal,
    ),
  /** The exercises, machines and workout types a profile's history can be filtered by. */
  workoutFilters: (userId: string, signal?: AbortSignal) =>
    apiGet<SharedWorkoutFilterOptions>(
      `/api/sharing/profiles/${id(userId)}/workout-filters`,
      signal,
    ),
  /** The splits a member shows on their profile. */
  splits: (userId: string, signal?: AbortSignal) =>
    apiGet<Routine[]>(`/api/routines/profile/${id(userId)}`, signal),
  /** Sends a friend request, or accepts theirs when they already asked you. */
  addFriend: (userId: string) =>
    apiSend<{ status: FriendStatus }>(`/api/sharing/friends/${id(userId)}`, 'POST'),
  acceptFriend: (userId: string) =>
    apiSend<{ status: FriendStatus }>(`/api/sharing/friends/${id(userId)}/accept`, 'POST'),
  /** Removes a friend, cancels your request, or declines theirs. */
  removeFriend: (userId: string) => apiSend<void>(`/api/sharing/friends/${id(userId)}`, 'DELETE'),
  block: (userId: string) => apiSend<void>(`/api/sharing/blocks/${id(userId)}`, 'POST'),
  unblock: (userId: string) => apiSend<void>(`/api/sharing/blocks/${id(userId)}`, 'DELETE'),
  react: (workoutId: string, reaction: WorkoutReactionKind) =>
    apiSend<WorkoutReactions>(`/api/sharing/workouts/${id(workoutId)}/reaction`, 'PUT', {
      reaction,
    }),
  removeReaction: (workoutId: string) =>
    apiSend<WorkoutReactions>(`/api/sharing/workouts/${id(workoutId)}/reaction`, 'DELETE'),
  reactionPeople: (workoutId: string, offset = 0, signal?: AbortSignal) =>
    apiGet<WorkoutReactionPage>(
      `/api/sharing/workouts/${id(workoutId)}/reactions?offset=${offset}`,
      signal,
    ),
  comments: (workoutId: string, offset = 0, signal?: AbortSignal) =>
    apiGet<CommentPage>(`/api/sharing/workouts/${id(workoutId)}/comments?offset=${offset}`, signal),
  addComment: (workoutId: string, body: string, replyToId: string | null) =>
    apiSend<WorkoutComment>(`/api/sharing/workouts/${id(workoutId)}/comments`, 'POST', {
      body,
      reply_to_id: replyToId,
      reaction: null,
    }),
  editComment: (commentId: string, body: string) =>
    apiSend<WorkoutComment>(`/api/sharing/comments/${id(commentId)}`, 'PATCH', { body }),
  deleteComment: (commentId: string) =>
    apiSend<void>(`/api/sharing/comments/${id(commentId)}`, 'DELETE'),
  reactToComment: (commentId: string, reaction: WorkoutReactionKind | null) =>
    apiSend<WorkoutComment>(
      `/api/sharing/comments/${id(commentId)}/reaction`,
      reaction ? 'PUT' : 'DELETE',
      reaction ? { reaction } : undefined,
    ),
  notifications: (signal?: AbortSignal) =>
    apiGet<SharingNotifications>('/api/sharing/notifications', signal),
  markNotificationsRead: (items: NotificationReadReference[]) =>
    apiSend<void>('/api/sharing/notifications/read', 'POST', { items }),
  /** Adds a photo picked on the phone to your own saved workout. */
  addWorkoutPhoto: (workoutId: string, file: { uri: string; name: string; type: string }) =>
    uploadFile<WorkoutPhoto>(`/api/workouts/${id(workoutId)}/photos`, 'POST', file, {
      failure: 'Relay could not add this photo.',
    }),
  removeWorkoutPhoto: (photoId: string) =>
    apiSend<void>(`/api/workout-photos/${id(photoId)}`, 'DELETE'),
};

/** A request that never reached the server fails with a plain error; an answer is an ApiError. */
export function connectionFailed(error: unknown) {
  return !(error instanceof ApiError);
}

/** The server refuses Social to a private profile until it is shared. */
export function sharingRequired(error: unknown) {
  return error instanceof ApiError && error.code === 'sharing_required';
}

export function notFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

/**
 * The server refused a member's data: they share with friends only, their profile is no longer
 * shared, or your own profile is private.
 */
export function accessRevoked(error: unknown) {
  return (
    error instanceof ApiError &&
    ((error.status === 403 && error.code === 'friend_required') ||
      (error.status === 404 && error.code === 'profile_not_found') ||
      error.code === 'sharing_required')
  );
}
