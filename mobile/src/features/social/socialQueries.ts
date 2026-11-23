import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { SHARED_WORKOUT_PAGE_SIZE } from '../../../../frontend/src/sharedProfileDisplay';
import type {
  CommentPage,
  FriendConnections,
  FriendFeed,
  PersonalRecord,
  SharedWorkoutKind,
  SharedWorkoutPage,
  Timeline,
  TimelineItem,
  TrackedWorkout,
  WorkoutPhoto,
  WorkoutReactionPage,
  WorkoutReactions,
} from '../../../../frontend/src/types';
import { ApiError } from '../../data/api';
import { socialApi } from './socialApi';

/** Every Social query sits under `social`, so a friendship change refreshes all of them. */
export const socialKeys = {
  all: ['social'] as const,
  friends: ['social', 'friends'] as const,
  timeline: ['social', 'timeline'] as const,
  feed: (limit: number) => ['social', 'feed', limit] as const,
  choices: ['social', 'choices'] as const,
  search: (term: string) => ['social', 'search', term] as const,
  suggestions: (page: number) => ['social', 'suggestions', page] as const,
  profile: (id: string) => ['social', 'profile', id] as const,
  workouts: (id: string, kind?: SharedWorkoutKind, date?: string) =>
    ['social', 'profile', id, 'workouts', kind ?? 'all', date ?? ''] as const,
  workout: (workoutId: string) => ['social', 'workout', workoutId] as const,
  comments: (workoutId: string) => ['social', 'comments', workoutId] as const,
  reactionPeople: (workoutId: string) => ['social', 'reactions', workoutId] as const,
  notifications: ['social', 'notifications'] as const,
};

/** The feed's page size, as the web's. */
const TIMELINE_PAGE = 10;

/**
 * Friends, requests, sent requests and blocks. Refreshed every 30 seconds while the screen is in
 * front, as the web does, and whenever the app comes back to the foreground.
 */
export function useFriendConnections() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: socialKeys.friends,
    queryFn: ({ signal }) => socialApi.friends(signal),
    refetchInterval: focused ? 30_000 : false,
  });
}

/** Social's feed, a page at a time, newest first; it refreshes every minute while shown. */
export function useTimeline() {
  const focused = useIsFocused();
  return useInfiniteQuery({
    queryKey: socialKeys.timeline,
    queryFn: ({ pageParam, signal }) => socialApi.timeline(pageParam, TIMELINE_PAGE, signal),
    initialPageParam: 0,
    getNextPageParam: (last: Timeline, pages) =>
      last.has_more ? pages.reduce((total, page) => total + page.items.length, 0) : undefined,
    select: (data) => withoutRepeats(data.pages.flatMap((page) => page.items)),
    refetchInterval: focused ? 60_000 : false,
  });
}

function withoutRepeats(items: TimelineItem[]): TimelineItem[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.workout.id) && seen.add(item.workout.id));
}

/** Each friend's latest session, for Home's Recent Friends Activity card. */
export function useFriendFeed(limit: number) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: socialKeys.feed(limit),
    queryFn: ({ signal }) => socialApi.feed(limit, signal),
    placeholderData: keepPreviousData,
    refetchInterval: focused ? 30_000 : false,
  });
}

export function useSharingChoices() {
  return useQuery({
    queryKey: socialKeys.choices,
    queryFn: ({ signal }) => socialApi.choices(signal),
  });
}

export function usePeopleSearch(term: string) {
  return useQuery({
    queryKey: socialKeys.search(term),
    queryFn: ({ signal }) => socialApi.search(term, signal),
    enabled: term.length > 0,
    select: (profiles) => profiles.filter((profile) => !profile.is_you),
  });
}

export function useSuggestions(page: number) {
  return useQuery({
    queryKey: socialKeys.suggestions(page),
    queryFn: ({ signal }) => socialApi.suggestions(page, signal),
    placeholderData: keepPreviousData,
  });
}

/** A shared profile, for its screen and for loading it in the background. */
export function sharedProfileQuery(id: string) {
  return queryOptions({
    queryKey: socialKeys.profile(id),
    queryFn: ({ signal }) => socialApi.profile(id, signal),
  });
}

export function useSharedProfile(id: string) {
  return useQuery(sharedProfileQuery(id));
}

/** A profile's shared workouts, a page at a time, for one history tab or one day. */
export function sharedWorkoutsQuery(
  id: string,
  { kind, date }: { kind?: SharedWorkoutKind; date?: string } = {},
) {
  return infiniteQueryOptions({
    queryKey: socialKeys.workouts(id, kind, date),
    queryFn: ({ pageParam, signal }) =>
      socialApi.workouts(
        id,
        pageParam,
        SHARED_WORKOUT_PAGE_SIZE,
        { kind, start_date: date, end_date: date },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last: SharedWorkoutPage, pages) => {
      const shown = pages.reduce((total, page) => total + page.workouts.length, 0);
      // Pages stop once the server has nothing new, even if its total disagrees.
      return last.workouts.length && shown < last.total ? shown : undefined;
    },
  });
}

export function useSharedWorkouts(
  id: string,
  { kind, date, enabled }: { kind?: SharedWorkoutKind; date?: string; enabled: boolean },
) {
  return useInfiniteQuery({ ...sharedWorkoutsQuery(id, { kind, date }), enabled });
}

/** Every loaded page of a profile's workouts as one list, with their records and reactions. */
export function sharedWorkoutList(data: InfiniteData<SharedWorkoutPage> | undefined) {
  const seen = new Set<string>();
  const pages = data?.pages ?? [];
  return {
    workouts: pages
      .flatMap((page) => page.workouts)
      .filter((workout) => !seen.has(workout.id) && seen.add(workout.id)),
    records: pages.flatMap((page) => page.personal_records),
    reactions: Object.assign({}, ...pages.map((page) => page.reactions ?? {})) as Record<
      string,
      WorkoutReactions
    >,
  };
}

export function useComments(workoutId: string) {
  return useInfiniteQuery({
    queryKey: socialKeys.comments(workoutId),
    queryFn: ({ pageParam, signal }) => socialApi.comments(workoutId, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last: CommentPage) => last.next_offset ?? undefined,
  });
}

export function useReactionPeople(workoutId: string) {
  return useInfiniteQuery({
    queryKey: socialKeys.reactionPeople(workoutId),
    queryFn: ({ pageParam, signal }) => socialApi.reactionPeople(workoutId, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last: WorkoutReactionPage) => last.next_offset ?? undefined,
  });
}

/** After a friendship changes: everything Social shows depends on it. */
export function refreshSocial(client: QueryClient) {
  return client.invalidateQueries({ queryKey: socialKeys.all });
}

/**
 * Shows a workout's new reactions (or comment count) everywhere it appears: the feed, Home's
 * card, friends' latest sessions and the owner's profile.
 */
export function showReactions(client: QueryClient, workoutId: string, reactions: WorkoutReactions) {
  client.setQueryData<SharedWorkoutData>(socialKeys.workout(workoutId), (data) =>
    data ? { ...data, reactions } : data,
  );
  client.setQueryData<InfiniteData<Timeline>>(socialKeys.timeline, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.workout.id === workoutId ? { ...item, reactions } : item,
            ),
          })),
        }
      : data,
  );
  client.setQueriesData<FriendFeed>({ queryKey: ['social', 'feed'] }, (feed) =>
    feed
      ? {
          ...feed,
          items: feed.items.map((item) =>
            item.workout.id === workoutId ? { ...item, reactions } : item,
          ),
        }
      : feed,
  );
  client.setQueryData<FriendConnections>(socialKeys.friends, (connections) =>
    connections
      ? {
          ...connections,
          friends: connections.friends.map((friend) =>
            friend.latest?.workout.id === workoutId
              ? { ...friend, latest: { ...friend.latest, reactions } }
              : friend,
          ),
        }
      : connections,
  );
  client.setQueriesData<InfiniteData<SharedWorkoutPage>>(
    {
      predicate: (query) =>
        query.queryKey[0] === 'social' &&
        query.queryKey[1] === 'profile' &&
        query.queryKey[3] === 'workouts',
    },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) =>
              page.workouts.some((workout) => workout.id === workoutId)
                ? { ...page, reactions: { ...page.reactions, [workoutId]: reactions } }
                : page,
            ),
          }
        : data,
  );
}

/** One shared workout, with its reactions and the records it set. */
export interface SharedWorkoutData {
  workout: TrackedWorkout;
  reactions: WorkoutReactions;
  records: PersonalRecord[];
  /** Weight and reps records, from the feed, until the full list has loaded. */
  recordCount?: number;
}

const NO_REACTIONS: WorkoutReactions = { counts: [], yours: null, comment_count: 0 };

/** A workout the feed, Home's card or a profile already holds, so it opens without waiting. */
export function cachedWorkout(client: QueryClient, workoutId: string): SharedWorkoutData | null {
  const timeline = client.getQueryData<InfiniteData<Timeline>>(socialKeys.timeline);
  for (const item of timeline?.pages.flatMap((page) => page.items) ?? []) {
    if (item.workout.id === workoutId)
      return {
        workout: item.workout,
        reactions: item.reactions,
        records: [],
        recordCount: item.record_count,
      };
  }
  for (const [, feed] of client.getQueriesData<FriendFeed>({ queryKey: ['social', 'feed'] })) {
    const item = feed?.items.find((entry) => entry.workout.id === workoutId);
    if (item) return { workout: item.workout, reactions: item.reactions, records: [] };
  }
  const latest = client
    .getQueryData<FriendConnections>(socialKeys.friends)
    ?.friends.find((friend) => friend.latest?.workout.id === workoutId)?.latest;
  if (latest) return { workout: latest.workout, reactions: latest.reactions, records: [] };
  return null;
}

/**
 * A shared workout, read from its owner's history on its day. It opens from a cached copy and is
 * still read again, for its sets, records and latest reactions.
 */
export function useSharedWorkout(workoutId: string, memberId: string, date: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: socialKeys.workout(workoutId),
    queryFn: async ({ signal }): Promise<SharedWorkoutData> => {
      const cached = cachedWorkout(client, workoutId);
      for (let offset = 0; ;) {
        const page = await socialApi.workouts(
          memberId,
          offset,
          SHARED_WORKOUT_PAGE_SIZE,
          { start_date: date, end_date: date },
          signal,
        );
        const workout = page.workouts.find((item) => item.id === workoutId);
        if (workout)
          return {
            workout,
            reactions:
              page.reactions?.[workoutId] ??
              client.getQueryData<SharedWorkoutData>(socialKeys.workout(workoutId))?.reactions ??
              cached?.reactions ??
              NO_REACTIONS,
            records: page.personal_records.filter((record) => record.workout_id === workoutId),
          };
        offset += page.workouts.length;
        if (!page.workouts.length || offset >= page.total)
          throw new ApiError(404, 'This workout is no longer available.');
      }
    },
    initialData: () => cachedWorkout(client, workoutId) ?? undefined,
    // A cached copy has no records or notes the feed leaves out, so read it straight away.
    initialDataUpdatedAt: 0,
  });
}

/**
 * The notifications bell's friend requests, accepted requests, reactions and comments. Read every
 * 30 seconds while Home or Social is in front, as the web does, and when the app comes back.
 */
export function useNotifications() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: socialKeys.notifications,
    queryFn: ({ signal }) => socialApi.notifications(signal),
    refetchInterval: focused ? 30_000 : false,
  });
}

/** Shows a workout's new photos everywhere it appears: Social, profiles and Training. */
export function showWorkoutPhotos(client: QueryClient, workoutId: string, photos: WorkoutPhoto[]) {
  const patch = <T extends TrackedWorkout>(workout: T): T =>
    workout.id === workoutId ? { ...workout, photos } : workout;
  client.setQueryData<SharedWorkoutData>(socialKeys.workout(workoutId), (data) =>
    data ? { ...data, workout: patch(data.workout) } : data,
  );
  client.setQueryData<InfiniteData<Timeline>>(socialKeys.timeline, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => ({ ...item, workout: patch(item.workout) })),
          })),
        }
      : data,
  );
  client.setQueriesData<FriendFeed>({ queryKey: ['social', 'feed'] }, (feed) =>
    feed
      ? { ...feed, items: feed.items.map((item) => ({ ...item, workout: patch(item.workout) })) }
      : feed,
  );
  client.setQueriesData<InfiniteData<SharedWorkoutPage>>(
    {
      predicate: (query) =>
        query.queryKey[0] === 'social' &&
        query.queryKey[1] === 'profile' &&
        query.queryKey[3] === 'workouts',
    },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({ ...page, workouts: page.workouts.map(patch) })),
          }
        : data,
  );
  // Training's saved workout, history and calendar pages all sit under `workouts`.
  client.setQueriesData({ queryKey: ['workouts'] }, (data: unknown) => withPhotos(data, patch));
}

/** A Training query's data with the workout's photos replaced, whatever its shape. */
function withPhotos(data: unknown, patch: (workout: TrackedWorkout) => TrackedWorkout): unknown {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data))
    return data.map((item) =>
      item && typeof item === 'object' && 'movements' in item ? patch(item) : item,
    );
  const value = data as Record<string, unknown>;
  if ('movements' in value && 'id' in value) return patch(value as unknown as TrackedWorkout);
  if (Array.isArray(value.workouts))
    return { ...value, workouts: withPhotos(value.workouts, patch) };
  if (Array.isArray(value.pages))
    return { ...value, pages: value.pages.map((page) => withPhotos(page, patch)) };
  return data;
}
