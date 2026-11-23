import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { nextReaction, reactionSummary, REACTIONS } from '../../../../frontend/src/friendFeedData';
import type { WorkoutReactionKind, WorkoutReactions } from '../../../../frontend/src/types';
import { errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { socialIcons } from './icons';
import { socialApi } from './socialApi';
import { showReactions, useReactionPeople } from './socialQueries';

/** Emojis shown beside a reaction total, so a long workout name keeps its room. */
const SUMMARY_EMOJIS = 2;

/**
 * A workout's reactions and comments: React (or your reaction), the total, which lists who
 * reacted, and Comments. Your own workout shows its total without a React button.
 */
export function ReactionBar({
  workoutId,
  subject,
  reactions,
  ownWorkout = false,
  onOpenComments,
  onOpenPerson,
}: {
  workoutId: string;
  /** "Alex’s Push day", for screen readers. */
  subject: string;
  reactions: WorkoutReactions;
  ownWorkout?: boolean;
  /** Leave out where the comments are already on screen. */
  onOpenComments?: () => void;
  onOpenPerson: (person: { id: string; display_name: string }) => void;
}) {
  const { colors, type, radius } = useTheme();
  const client = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState(false);
  const summary = reactionSummary(reactions.counts);
  const selected = ownWorkout ? undefined : REACTIONS.find((item) => item.kind === reactions.yours);
  const comments = reactions.comment_count ?? 0;
  const reactionCount = `${summary.total} ${summary.total === 1 ? 'reaction' : 'reactions'}`;
  const react = useMutation({
    mutationFn: (chosen: WorkoutReactionKind) => {
      const next = nextReaction(reactions.yours, chosen);
      return next ? socialApi.react(workoutId, next) : socialApi.removeReaction(workoutId);
    },
    onSuccess: (updated) => {
      // The reaction endpoints leave out the comment count, which hasn't changed.
      showReactions(client, workoutId, { comment_count: comments, ...updated });
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
              selected
                ? `Your reaction to ${subject}: ${selected.label}. Change reaction`
                : `React to ${subject}`
            }
            accessibilityState={{ expanded: picking }}
            hitSlop={4}
            onPress={() => {
              void Haptics.selectionAsync();
              setPicking((open) => !open);
            }}
            style={({ pressed }) => [
              pill,
              selected && { backgroundColor: colors.accentSoft },
              pressed && { opacity: 0.6 },
            ]}
          >
            {selected ? (
              <Text style={styles.emoji}>{selected.emoji}</Text>
            ) : (
              <Icon name={socialIcons.react} size={18} color={colors.secondary} />
            )}
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
      {people && (
        <ReactionPeopleSheet
          workoutId={workoutId}
          onClose={() => setPeople(false)}
          onOpenPerson={(person) => {
            setPeople(false);
            onOpenPerson(person);
          }}
        />
      )}
    </View>
  );
}

/** Who reacted to a workout, and with what. */
function ReactionPeopleSheet({
  workoutId,
  onClose,
  onOpenPerson,
}: {
  workoutId: string;
  onClose: () => void;
  onOpenPerson: (person: { id: string; display_name: string }) => void;
}) {
  const { colors, type } = useTheme();
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
              style={({ pressed }) => [styles.person, pressed && { opacity: 0.6 }]}
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
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  more: { alignItems: 'center', paddingVertical: 12 },
});
