import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  FEED_SHOWN_EXERCISES,
  feedExercises,
  feedStats,
  friendSession,
  relativeDay,
} from '../../../../frontend/src/friendFeedData';
import type { TimelineItem } from '../../../../frontend/src/types';
import { FOCUS_HIGHLIGHT_MS } from '../../../../frontend/src/workoutFocusRequest';
import { useWeightUnit } from '../../data/queries';
import { Card } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { socialIcons } from './icons';
import { useSocialNavigation } from './navigation';
import { ReactionBar } from './ReactionBar';
import { dismissWorkoutFocus, useShownWorkoutFocus } from './workoutFocus';
import { useWorkoutPhotoEditor, WorkoutPhotos } from './WorkoutPhotos';

/**
 * One workout in the feed: who and when, its photos and summary, then reactions and comments.
 * On your own workout you can add and remove photos. A card revealed from a notification is
 * briefly outlined.
 */
export function FeedCard({ item, today }: { item: TimelineItem; today: string }) {
  const { colors, radius, space, type } = useTheme();
  const nav = useSocialNavigation();
  const unit = useWeightUnit();
  const [showAll, setShowAll] = useState(false);
  const { member, workout } = item;
  const session = friendSession(workout);
  const owner = member.is_you ? 'Your' : `${member.display_name}’s`;
  const subject = `${owner} ${workout.name}`;
  const stats = feedStats(workout, unit);
  const movements = feedExercises(workout);
  const hidden = movements.length - FEED_SHOWN_EXERCISES;
  const listed = showAll ? movements : movements.slice(0, FEED_SHOWN_EXERCISES);
  const openMember = () => nav.openProfile(member);
  const openWorkout = (comments = false) =>
    nav.openWorkout({ id: workout.id, memberId: member.id, date: workout.workout_date, comments });
  const photos = workout.photos ?? [];
  const editor = useWorkoutPhotoEditor(workout.id, photos);
  const shown = useShownWorkoutFocus();
  const focus = shown?.mode === 'reveal' && shown.workoutId === workout.id ? shown : null;
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
  return (
    <Card accessibilityLabel={subject}>
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
          <Avatar person={member} size={42} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${subject} workout`}
            onPress={() => openWorkout()}
          >
            <Text style={[type.headline, { color: colors.text }]} numberOfLines={2}>
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
            <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
              <Text style={{ fontWeight: '600', color: colors.text }}>
                {member.is_you ? 'You' : member.display_name}
              </Text>
              {`  ${relativeDay(workout.workout_date, today)}`}
            </Text>
          </Pressable>
        </View>
      </View>
      <WorkoutPhotos
        photos={photos}
        subject={subject}
        inset={space.lg * 4}
        onRemove={member.is_you ? editor.remove : undefined}
      />
      {(stats.length > 0 || item.record_count > 0) && (
        <View accessibilityLabel="Summary" style={styles.stats}>
          {stats.length > 0 && (
            <Text style={[type.callout, type.number, { color: colors.secondary }]}>
              {stats.join(' · ')}
            </Text>
          )}
          {item.record_count > 0 && (
            <View style={styles.records}>
              <Icon name="trophy" size={13} color={colors.gold} />
              <Text style={[type.footnote, { color: colors.gold, fontWeight: '700' }]}>
                {item.record_count} {item.record_count === 1 ? 'PR' : 'PRs'}
              </Text>
            </View>
          )}
        </View>
      )}
      {movements.length > 0 && (
        <Text style={[type.footnote, { color: colors.secondary }]} accessibilityLabel="Exercises">
          {listed.map((movement) => movement.exercise.name).join(', ')}
          {hidden > 0 && (
            <Text
              accessibilityRole="button"
              accessibilityLabel={
                showAll
                  ? 'Show less'
                  : `Show ${hidden} more ${hidden === 1 ? 'exercise' : 'exercises'}`
              }
              onPress={() => setShowAll((current) => !current)}
              style={{ color: colors.accentText, fontWeight: '600' }}
            >
              {showAll ? '  Show less' : `  +${hidden} more`}
            </Text>
          )}
        </Text>
      )}
      <ReactionBar
        workoutId={workout.id}
        subject={subject}
        reactions={item.reactions}
        ownWorkout={member.is_you}
        onOpenComments={() => openWorkout(true)}
        onOpenPerson={nav.openProfile}
        focus={focus?.panel === 'people' ? focus : null}
        onFocusDone={() => focus && dismissWorkoutFocus(focus.key)}
      >
        {member.is_you && editor.canAdd && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editor.adding ? 'Adding photo…' : `Add a photo to ${subject}`}
            accessibilityState={{ disabled: editor.adding }}
            disabled={editor.adding}
            hitSlop={4}
            onPress={editor.add}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: colors.surface2, borderRadius: radius.pill },
              pressed && { opacity: 0.6 },
            ]}
          >
            {editor.adding ? (
              <ActivityIndicator size="small" color={colors.accentText} />
            ) : (
              <Icon name={socialIcons.addPhoto} size={18} color={colors.secondary} />
            )}
          </Pressable>
        )}
      </ReactionBar>
      {editor.error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {editor.error}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  records: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  outline: { ...StyleSheet.absoluteFill, borderWidth: 2 },
  pill: {
    minHeight: 34,
    minWidth: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
