import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  FEED_SHOWN_EXERCISES,
  feedExercises,
  feedStats,
  friendSession,
  relativeDay,
} from '../../../../frontend/src/friendFeedData';
import type { TimelineItem } from '../../../../frontend/src/types';
import { useWeightUnit } from '../../data/queries';
import { Card } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { useSocialNavigation } from './navigation';
import { ReactionBar } from './ReactionBar';
import { WorkoutPhotos } from './WorkoutPhotos';

/** One workout in the feed: who and when, its photos and summary, then reactions and comments. */
export function FeedCard({ item, today }: { item: TimelineItem; today: string }) {
  const { colors, space, type } = useTheme();
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
  return (
    <Card accessibilityLabel={subject}>
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
      <WorkoutPhotos photos={workout.photos ?? []} subject={subject} inset={space.lg * 4} />
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
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  records: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
