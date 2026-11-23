import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { nextReaction, reactionSummary, REACTIONS } from '../../../../frontend/src/friendFeedData';
import { pendingReactionLabel } from '../../../../frontend/src/pendingReactionQueue';
import type { WorkoutReactionKind, WorkoutReactions } from '../../../../frontend/src/types';
import { useUser } from '../../session/SessionProvider';
import { errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { socialIcons } from './icons';
import { queueReaction, usePendingReaction } from './pendingReactions';
import { connectionFailed, socialApi } from './socialApi';
import { showReactions, useReactionPeople } from './socialQueries';

/** Emojis shown beside a reaction total, so a long workout name keeps its room. */
const SUMMARY_EMOJIS = 2;

/**
 * A workout's reactions and comments: React (or your reaction), the total, which lists who
 * reacted, and Comments. Your own workout shows its total without a React button. A reaction
 * chosen offline waits on the phone and sends once Relay can be reached, as on the web.
 */
export function ReactionBar({
  workoutId,
  subject,
  reactions,
  ownWorkout = false,
  onOpenComments,
  onOpenPerson,
  focus,
  onFocusDone,
  children,
}: {
  workoutId: string;
  /** "Alex’s Push day", for screen readers. */
  subject: string;
  reactions: WorkoutReactions;
  ownWorkout?: boolean;
  /** Leave out where the comments are already on screen. */
  onOpenComments?: () => void;
  onOpenPerson: (person: { id: string; display_name: string }) => void;
  /** Opens who reacted with this person highlighted, for a notification about their reaction. */
  focus?: { personId?: string } | null;
  /** Closing the reactions `focus` opened. */
  onFocusDone?: () => void;
  /** More buttons for the row, such as Add photo on your own workout. */
  children?: ReactNode;
}) {
  const { colors, type, radius } = useTheme();
  const client = useQueryClient();
  const account = useUser().id;
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState(false);
  const summary = reactionSummary(reactions.counts);
  const comments = reactions.comment_count ?? 0;
  // The reaction endpoints leave out the comment count, which hasn't changed.
  const show = (updated: WorkoutReactions) =>
    showReactions(client, workoutId, { comment_count: comments, ...updated });
  const pending = usePendingReaction(account, workoutId, show);
  const waiting = !ownWorkout && pending !== undefined;
  const pendingChoice = waiting ? REACTIONS.find((item) => item.kind === pending) : undefined;
  const selected = ownWorkout ? undefined : REACTIONS.find((item) => item.kind === reactions.yours);
  const reactionCount = `${summary.total} ${summary.total === 1 ? 'reaction' : 'reactions'}`;
  const react = useMutation({
    mutationFn: async (chosen: WorkoutReactionKind) => {
      const next = nextReaction(reactions.yours, chosen);
      const wait = () => {
        queueReaction(account, workoutId, next);
        return null;
      };
      if (!onlineManager.isOnline()) return wait();
      try {
        return next
          ? await socialApi.react(workoutId, next)
          : await socialApi.removeReaction(workoutId);
      } catch (reason) {
        if (connectionFailed(reason)) return wait();
        throw reason;
      }
    },
    // Offline, the choice still goes to the queue rather than waiting for a connection.
    networkMode: 'always',
    onSuccess: (updated) => {
      if (updated) show(updated);
      setPicking(false);
    },
    onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  });
  const pill = [styles.pill, { backgroundColor: colors.surface2, borderRadius: radius.pill }];
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {!ownWorkout && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              waiting
                ? pendingReactionLabel(subject, pending)
                : selected
                  ? `Your reaction to ${subject}: ${selected.label}. Change reaction`
                  : `React to ${subject}`
            }
            accessibilityState={{ expanded: picking, disabled: waiting }}
            disabled={waiting}
            hitSlop={4}
            onPress={() => {
              void Haptics.selectionAsync();
              setPicking((open) => !open);
            }}
            style={({ pressed }) => [
              pill,
              (waiting ? pendingChoice : selected) && { backgroundColor: colors.accentSoft },
              waiting && styles.waiting,
              pressed && { opacity: 0.6 },
            ]}
          >
            {waiting ? (
              pendingChoice ? (
                <Text style={styles.emoji}>{pendingChoice.emoji}</Text>
              ) : (
                <Icon name={socialIcons.react} size={18} color={colors.secondary} />
              )
            ) : selected ? (
              <Text style={styles.emoji}>{selected.emoji}</Text>
            ) : (
              <Icon name={socialIcons.react} size={18} color={colors.secondary} />
            )}
            {waiting && <Icon name={socialIcons.waiting} size={13} color={colors.muted} />}
          </Pressable>
        )}
        {summary.total > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${reactionCount} on ${subject}`}
            hitSlop={4}
            onPress={() => setPeople(true)}
            style={({ pressed }) => [pill, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.emojiSmall}>
              {summary.emojis.slice(0, SUMMARY_EMOJIS).join('')}
            </Text>
            <Text style={[type.footnote, type.number, { color: colors.text, fontWeight: '600' }]}>
              {summary.total}
            </Text>
          </Pressable>
        )}
        {onOpenComments && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${comments} ${comments === 1 ? 'comment' : 'comments'} on ${subject}`}
            hitSlop={4}
            onPress={onOpenComments}
            style={({ pressed }) => [pill, pressed && { opacity: 0.6 }]}
          >
            <Icon name={socialIcons.comment} size={17} color={colors.secondary} />
            {comments > 0 && (
              <Text style={[type.footnote, type.number, { color: colors.text, fontWeight: '600' }]}>
                {comments}
              </Text>
            )}
          </Pressable>
        )}
        {children}
      </View>
      {picking && (
        <View
          accessibilityLabel={`Choose a reaction to ${subject}`}
          style={[styles.picker, { backgroundColor: colors.surface2, borderRadius: radius.pill }]}
        >
          {REACTIONS.map((item) => {
            const mine = reactions.yours === item.kind;
            return (
              <Pressable
                key={item.kind}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: mine, disabled: react.isPending }}
                disabled={react.isPending}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  react.mutate(item.kind);
                }}
                style={({ pressed }) => [
                  styles.choice,
                  mine && { backgroundColor: colors.accentSoft },
                  pressed && { transform: [{ scale: 1.2 }] },
                ]}
              >
                <Text style={styles.emojiLarge}>{item.emoji}</Text>
              </Pressable>
            );
          })}
          {react.isPending && <ActivityIndicator size="small" color={colors.accentText} />}
        </View>
      )}
      {react.error && picking && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(react.error)}
        </Text>
      )}
      {(people || !!focus) && (
        <ReactionPeopleSheet
          workoutId={workoutId}
          highlightPersonId={people ? undefined : focus?.personId}
          onClose={() => {
            setPeople(false);
            onFocusDone?.();
          }}
          onOpenPerson={(person) => {
            setPeople(false);
            onFocusDone?.();
            onOpenPerson(person);
          }}
        />
      )}
    </View>
  );
}

/** Who reacted to a workout, and with what; a notification's person is highlighted. */
export function ReactionPeopleSheet({
  workoutId,
  highlightPersonId,
  onClose,
  onOpenPerson,
}: {
  workoutId: string;
  highlightPersonId?: string;
  onClose: () => void;
  onOpenPerson: (person: { id: string; display_name: string }) => void;
}) {
  const { colors, type, radius } = useTheme();
  const query = useReactionPeople(workoutId);
  const people = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Sheet visible onClose={onClose} title="Reactions">
      {query.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading reactions" color={colors.accentText} />
      ) : query.error ? (
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.secondary }]}>
          {errorMessage(query.error)}
        </Text>
      ) : (
        <View style={{ gap: 4 }}>
          {people.map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${person.display_name}'s profile`}
              onPress={() => onOpenPerson(person)}
              style={({ pressed }) => [
                styles.person,
                person.id === highlightPersonId && {
                  backgroundColor: colors.accentSoft,
                  borderRadius: radius.lg,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Avatar person={person} size={36} />
              <Text style={[type.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {person.display_name}
              </Text>
              <Text style={styles.emoji}>
                {REACTIONS.find((item) => item.kind === person.reaction)?.emoji}
              </Text>
            </Pressable>
          ))}
          {query.hasNextPage && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void query.fetchNextPage()}
              style={styles.more}
            >
              <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
                {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: {
    minHeight: 34,
    minWidth: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emoji: { fontSize: 18 },
  emojiSmall: { fontSize: 15, letterSpacing: -2 },
  emojiLarge: { fontSize: 26 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  choice: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  waiting: { opacity: 0.7 },
  more: { alignItems: 'center', paddingVertical: 12 },
});
