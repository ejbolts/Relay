import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  feedExercises,
  feedExerciseView,
  feedStats,
  friendSession,
  relativeDay,
} from '../../../../frontend/src/friendFeedData';
import type { TimelineItem } from '../../../../frontend/src/types';
import { FOCUS_HIGHLIGHT_MS } from '../../../../frontend/src/workoutFocusRequest';
import { useWeightUnit } from '../../data/queries';
import { Card } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { ExerciseIcon } from './ExerciseIcon';
import { socialIcons } from './icons';
import { useSocialNavigation } from './navigation';
import {
  ReactionActions,
  ReactionPeopleSheet,
  ReactionPicker,
  useReactionControl,
} from './ReactionBar';
import { dismissWorkoutFocus, useShownWorkoutFocus } from './workoutFocus';
import { useWorkoutPhotoEditor, WorkoutPhotos } from './WorkoutPhotos';
import { TrainedWithPill } from '../train/TrainedWithPill';

/**
 * One workout in the feed, matching the web's compact card: accent title + author · day +
 * top-right outline icons (photo, react, comment), summary stats with PRs, photos, and up to
 * three exercises with their icons, expanding inline when there are more. Sibling cards fade back
 * while its emoji sheet is open.
 */
export function FeedCard({
  item,
  today,
  picking = false,
  dimmed = false,
  onPickingChange,
}: {
  item: TimelineItem;
  today: string;
  picking?: boolean;
  dimmed?: boolean;
  onPickingChange?: (open: boolean) => void;
}) {
  const { colors, radius, space, type } = useTheme();
  const nav = useSocialNavigation();
  const unit = useWeightUnit();
  const { member, workout } = item;
  const session = friendSession(workout);
  const owner = member.is_you ? 'Your' : `${member.display_name}’s`;
  const subject = `${owner} ${workout.name}`;
  const stats = feedStats(workout, unit);
  const [exercisesExpanded, setExercisesExpanded] = useState(false);
  const movements = feedExercises(workout);
  const exercises = feedExerciseView(movements, exercisesExpanded, subject);
  const openMember = () => nav.openProfile(member);
  const openWorkout = (comments = false) =>
    nav.openWorkout({ id: workout.id, memberId: member.id, date: workout.workout_date, comments });
  const photos = workout.photos ?? [];
  const editor = useWorkoutPhotoEditor(workout.id, photos);
  const shown = useShownWorkoutFocus();
  const focus = shown?.mode === 'reveal' && shown.workoutId === workout.id ? shown : null;
  const reaction = useReactionControl({
    workoutId: workout.id,
    subject,
    reactions: item.reactions,
    ownWorkout: member.is_you,
    picking: onPickingChange ? picking : undefined,
    onPickingChange,
  });
  const [outline] = useState(() => new Animated.Value(0));
  const focusKey = focus?.key;
  const focusPanel = focus?.panel;
  useEffect(() => {
    if (focusKey === undefined) return;
    const flash = Animated.sequence([
      Animated.timing(outline, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.delay(FOCUS_HIGHLIGHT_MS),
      Animated.timing(outline, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]);
    // A comment opens on the workout's own screen, so only the outline belongs to the card.
    // It runs to the end even once the reactions it opened are closed, so the outline never
    // sticks; a newer request restarts it.
    flash.start(() => focusPanel === 'comments' && dismissWorkoutFocus(focusKey));
  }, [focusKey, focusPanel, outline]);
  const peopleFocus = focus?.panel === 'people' ? focus : null;
  return (
    <Card
      accessibilityLabel={subject}
      style={[styles.card, dimmed && { opacity: 0.35 }, reaction.picking && styles.pickingCard]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outline,
          {
            borderRadius: radius.card,
            borderColor: colors.accent,
            opacity: outline,
          },
        ]}
      />
      <View style={styles.header}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={openMember}
        >
          <Avatar person={member} size={40} />
        </Pressable>
        <View style={styles.heading}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${subject} workout`}
            onPress={() => openWorkout()}
          >
            <Text style={[styles.title, { color: colors.accentText }]} numberOfLines={2}>
              {session.name}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              member.is_you ? 'Open your profile' : `Open ${member.display_name}’s profile`
            }
            onPress={openMember}
            hitSlop={4}
          >
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
              <Text style={{ fontWeight: '600', color: colors.secondary }}>
                {member.is_you ? 'You' : member.display_name}
              </Text>
              {` · ${relativeDay(workout.workout_date, today)}`}
            </Text>
          </Pressable>
        </View>
        <View style={styles.headerActions}>
          <ReactionActions
            compact
            subject={subject}
            ownWorkout={member.is_you}
            control={reaction}
            onOpenComments={() => openWorkout(true)}
          >
            {member.is_you && editor.canAdd && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editor.adding ? 'Adding photo…' : `Add a photo to ${subject}`}
                accessibilityState={{ disabled: editor.adding }}
                disabled={editor.adding}
                hitSlop={4}
                onPress={() => {
                  haptics.tap();
                  editor.add();
                }}
                style={({ pressed }) => [styles.iconAction, pressed && { opacity: 0.6 }]}
              >
                {editor.adding ? (
                  <ActivityIndicator size="small" color={colors.accentText} />
                ) : (
                  <Icon name={socialIcons.addPhoto} size={20} color={colors.secondary} />
                )}
              </Pressable>
            )}
          </ReactionActions>
        </View>
      </View>
      {/* Train together: who it was trained with, on its own row. */}
      <TrainedWithPill workout={workout} />
      {(stats.length > 0 || item.record_count > 0) && (
        <View accessibilityLabel="Summary" style={styles.stats}>
          {stats.length > 0 && (
            <Text style={[styles.statText, type.number, { color: colors.secondary }]}>
              {stats.join(' · ')}
            </Text>
          )}
          {stats.length > 0 && item.record_count > 0 && (
            <Text style={[styles.statDot, { color: colors.muted }]}>·</Text>
          )}
          {item.record_count > 0 && (
            <View style={styles.records}>
              <Icon name="trophy" size={14} color={colors.gold} />
              <Text style={[styles.statText, { color: colors.gold, fontWeight: '700' }]}>
                {item.record_count} {item.record_count === 1 ? 'PR' : 'PRs'}
              </Text>
            </View>
          )}
        </View>
      )}
      <WorkoutPhotos
        photos={photos}
        subject={subject}
        inset={(space.gutter + space.lg) * 2}
        onRemove={member.is_you ? editor.remove : undefined}
      />
      {editor.error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {editor.error}
        </Text>
      )}
      {movements.length > 0 && (
        <View accessibilityLabel="Exercises" style={styles.exercises}>
          {exercises.listed.map((movement) => (
            <View key={movement.id} style={styles.exercise}>
              <ExerciseIcon exercise={movement.exercise} size={30} />
              <Text
                style={[styles.exerciseName, { color: colors.secondary, flex: 1 }]}
                numberOfLines={1}
              >
                {movement.exercise.name}
              </Text>
            </View>
          ))}
          {exercises.canExpand && exercises.toggleText && exercises.toggleLabel && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={exercises.toggleLabel}
              accessibilityState={{ expanded: exercisesExpanded }}
              hitSlop={6}
              onPress={() => {
                haptics.selection();
                setExercisesExpanded((current) => !current);
              }}
              style={({ pressed }) => [styles.moreLink, pressed && { opacity: 0.6 }]}
            >
              <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
                {exercises.toggleText}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {reaction.picking && (
        <ReactionPicker subject={subject} yours={item.reactions.yours} control={reaction} />
      )}
      {(reaction.people || !!peopleFocus) && (
        <ReactionPeopleSheet
          workoutId={workout.id}
          highlightPersonId={reaction.people ? undefined : peopleFocus?.personId}
          onClose={() => {
            reaction.setPeople(false);
            if (focus) dismissWorkoutFocus(focus.key);
          }}
          onOpenPerson={(person) => {
            reaction.setPeople(false);
            if (focus) dismissWorkoutFocus(focus.key);
            nav.openProfile(person);
          }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  pickingCard: { zIndex: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 16, fontWeight: '700', letterSpacing: -0.15 },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -6 },
  iconAction: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statText: { fontSize: 13.5, fontWeight: '600' },
  statDot: { fontSize: 13.5 },
  records: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exercises: { gap: 6 },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseName: { fontSize: 14, fontWeight: '600' },
  moreLink: {
    marginLeft: 40,
    minHeight: 32,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  outline: { ...StyleSheet.absoluteFill, borderWidth: 2 },
});
