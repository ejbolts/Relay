import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { nextReaction, reactionSummary, REACTIONS } from '../../../../frontend/src/friendFeedData';
import { pendingReactionLabel } from '../../../../frontend/src/pendingReactionQueue';
import type { WorkoutReactionKind, WorkoutReactions } from '../../../../frontend/src/types';
import { useUser } from '../../session/SessionProvider';
import { Button, errorMessage } from '../../ui/components';
import { haptics } from '../../ui/haptics';
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

export interface ReactionControlOptions {
  workoutId: string;
  subject: string;
  reactions: WorkoutReactions;
  ownWorkout?: boolean;
  /** Controlled picker state, e.g. so Feed can dim sibling cards while picking. */
  picking?: boolean;
  onPickingChange?: (open: boolean) => void;
}

/** Shared state and mutation for reacting to a workout, used by ReactionBar and FeedCard. */
export function useReactionControl({
  workoutId,
  subject,
  reactions,
  ownWorkout = false,
  picking: controlledPicking,
  onPickingChange,
}: ReactionControlOptions) {
  const client = useQueryClient();
  const account = useUser().id;
  const [localPicking, setLocalPicking] = useState(false);
  const [people, setPeople] = useState(false);
  const picking = controlledPicking ?? localPicking;
  const setPicking = (next: boolean) => {
    if (controlledPicking === undefined) setLocalPicking(next);
    onPickingChange?.(next);
  };
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
    onError: () => haptics.error(),
  });

  const reactLabel = waiting
    ? pendingReactionLabel(subject, pending)
    : selected
      ? `Your reaction to ${subject}: ${selected.label}. Change reaction`
      : `React to ${subject}`;

  return {
    picking,
    setPicking,
    people,
    setPeople,
    summary,
    comments,
    waiting,
    pendingChoice,
    selected,
    reactionCount,
    react,
    reactLabel,
  };
}

export type ReactionControlState = ReturnType<typeof useReactionControl>;

/** The floating or inline emoji reaction picker, styled as the web's .friend-react-picker. */
export function ReactionPicker({
  subject,
  yours,
  control,
  floating = false,
  style,
}: {
  subject: string;
  yours: WorkoutReactionKind | null;
  control: ReactionControlState;
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, type } = useTheme();
  const { react } = control;
  return (
    <View style={[floating && styles.floatingWrap, style]}>
      <View
        accessibilityLabel={`Choose a reaction to ${subject}`}
        style={[
          styles.picker,
          {
            backgroundColor: colors.surface,
            borderColor: colors.lineStrong,
            borderRadius: radius.pill,
          },
          floating && [styles.floatingPicker, { shadowColor: colors.shadow }],
        ]}
      >
        {REACTIONS.map((item) => {
          const mine = yours === item.kind;
          return (
            <Pressable
              key={item.kind}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: mine, disabled: react.isPending }}
              disabled={react.isPending}
              onPress={() => {
                haptics.tap();
                react.mutate(item.kind);
              }}
              style={({ pressed }) => [
                styles.choice,
                mine && {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.accent,
                  borderWidth: 1,
                },
                pressed && { transform: [{ scale: 1.18 }] },
              ]}
            >
              <Text style={styles.emojiLarge}>{item.emoji}</Text>
            </Pressable>
          );
        })}
        {react.isPending && <ActivityIndicator size="small" color={colors.accentText} />}
      </View>
      {react.error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(react.error)}
        </Text>
      )}
    </View>
  );
}

/**
 * Compact header icons or full reaction row, matching the web's WorkoutReactionControl:
 * bare outline icons when zero, joined emoji+count pill when reactions exist.
 */
export function ReactionActions({
  subject,
  ownWorkout = false,
  compact = false,
  control,
  onOpenComments,
  children,
}: {
  subject: string;
  ownWorkout?: boolean;
  compact?: boolean;
  control: ReactionControlState;
  onOpenComments?: () => void;
  children?: ReactNode;
}) {
  const { colors, type, radius } = useTheme();
  const {
    picking,
    setPicking,
    setPeople,
    summary,
    comments,
    waiting,
    pendingChoice,
    selected,
    reactionCount,
    reactLabel,
  } = control;

  const reactIcon = waiting ? (
    pendingChoice ? (
      <Text style={styles.emoji}>{pendingChoice.emoji}</Text>
    ) : (
      <Icon name={socialIcons.react} size={20} color={colors.secondary} />
    )
  ) : selected ? (
    <Text style={styles.emoji}>{selected.emoji}</Text>
  ) : (
    <Icon name={socialIcons.react} size={20} color={colors.secondary} />
  );

  const togglePicker = () => {
    haptics.selection();
    setPicking(!picking);
  };

  const bareReactButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reactLabel}
      accessibilityState={{ expanded: picking, disabled: waiting }}
      disabled={waiting}
      hitSlop={4}
      onPress={togglePicker}
      style={({ pressed }) => [
        styles.iconButton,
        waiting && styles.waiting,
        pressed && { opacity: 0.6 },
      ]}
    >
      {reactIcon}
      {waiting && <Icon name={socialIcons.waiting} size={13} color={colors.muted} />}
    </Pressable>
  );

  const joinedReactions = !ownWorkout && summary.total > 0 && (
    <View
      style={[
        styles.joinedPill,
        !compact && {
          backgroundColor: selected ? colors.accentSoft : colors.surface2,
          borderColor: selected ? colors.accent : colors.lineStrong,
          borderWidth: 1,
          borderRadius: radius.pill,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reactLabel}
        accessibilityState={{ expanded: picking, disabled: waiting }}
        disabled={waiting}
        hitSlop={4}
        onPress={togglePicker}
        style={({ pressed }) => [
          styles.joinedPart,
          compact && styles.compactPart,
          waiting && styles.waiting,
          pressed && { opacity: 0.6 },
        ]}
      >
        {reactIcon}
        {waiting && <Icon name={socialIcons.waiting} size={12} color={colors.muted} />}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${reactionCount} on ${subject}`}
        hitSlop={4}
        onPress={() => {
          haptics.tap();
          setPeople(true);
        }}
        style={({ pressed }) => [
          styles.joinedCount,
          compact && styles.compactCount,
          pressed && { opacity: 0.6 },
        ]}
      >
        {!selected && !pendingChoice && (
          <Text style={styles.emojiSmall}>{summary.emojis.slice(0, SUMMARY_EMOJIS).join('')}</Text>
        )}
        <Text
          style={[
            type.footnote,
            type.number,
            { color: selected ? colors.accentText : colors.secondary, fontWeight: '700' },
          ]}
        >
          {summary.total}
        </Text>
      </Pressable>
    </View>
  );

  const ownSummary = ownWorkout && summary.total > 0 && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${reactionCount} on ${subject}`}
      hitSlop={4}
      onPress={() => {
        haptics.tap();
        setPeople(true);
      }}
      style={({ pressed }) => [
        compact ? styles.iconButton : styles.summaryPill,
        !compact && {
          backgroundColor: colors.surface2,
          borderColor: colors.lineStrong,
          borderRadius: radius.pill,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={styles.emojiSmall}>{summary.emojis.slice(0, SUMMARY_EMOJIS).join('')}</Text>
      <Text style={[type.footnote, type.number, { color: colors.secondary, fontWeight: '700' }]}>
        {summary.total}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.row, compact && styles.compactRow]}>
      {children}
      {ownWorkout ? ownSummary : summary.total > 0 ? joinedReactions : bareReactButton}
      {onOpenComments && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${comments} ${comments === 1 ? 'comment' : 'comments'} on ${subject}`}
          hitSlop={4}
          onPress={() => {
            haptics.tap();
            onOpenComments();
          }}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
        >
          <Icon name={socialIcons.comment} size={19} color={colors.secondary} />
          {comments > 0 && (
            <Text
              style={[type.footnote, type.number, { color: colors.secondary, fontWeight: '600' }]}
            >
              {comments}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

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
  const control = useReactionControl({ workoutId, subject, reactions, ownWorkout });
  return (
    <View style={styles.wrap}>
      <ReactionActions
        subject={subject}
        ownWorkout={ownWorkout}
        control={control}
        onOpenComments={onOpenComments}
      >
        {children}
      </ReactionActions>
      {control.picking && (
        <ReactionPicker subject={subject} yours={reactions.yours} control={control} />
      )}
      {(control.people || !!focus) && (
        <ReactionPeopleSheet
          workoutId={workoutId}
          highlightPersonId={control.people ? undefined : focus?.personId}
          onClose={() => {
            control.setPeople(false);
            onFocusDone?.();
          }}
          onOpenPerson={(person) => {
            control.setPeople(false);
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
        <View>
          {people.map((person, index) => (
            <View
              key={person.id}
              style={
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line,
                }
              }
            >
              <Pressable
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
            </View>
          ))}
          {query.hasNextPage && (
            <Button
              label={query.isFetchingNextPage ? 'Loading…' : 'Show more'}
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
              style={{ marginTop: 12 }}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  compactRow: { flexWrap: 'nowrap', gap: 2 },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  summaryPill: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  joinedPill: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  joinedPart: {
    minHeight: 36,
    paddingLeft: 10,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  compactPart: { paddingLeft: 6, paddingRight: 3, minHeight: 40 },
  joinedCount: {
    minHeight: 36,
    paddingLeft: 4,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  compactCount: { paddingLeft: 3, paddingRight: 6, minHeight: 40 },
  emoji: { fontSize: 18 },
  emojiSmall: { fontSize: 15, letterSpacing: -2 },
  emojiLarge: { fontSize: 24 },
  floatingWrap: {
    position: 'absolute',
    top: 56,
    right: 12,
    zIndex: 20,
    elevation: 10,
    alignItems: 'flex-end',
    gap: 4,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  floatingPicker: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  choice: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  waiting: { opacity: 0.7 },
});
