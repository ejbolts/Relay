import { Stack } from 'expo-router';
import { useRef, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  feedStats,
  friendSession,
  loggedTime,
  relativeDay,
} from '../../../../frontend/src/friendFeedData';
import { recordCountsByWorkout } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import { useWeightUnit } from '../../data/queries';
import { Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { WorkoutDetails } from '../training/WorkoutCard';
import { Avatar } from './Avatar';
import { CommentComposer, CommentList, useCommentThread } from './Comments';
import { useSocialNavigation } from './navigation';
import { ReactionBar } from './ReactionBar';
import { socialHeader } from './screenOptions';
import { useSharedProfile, useSharedWorkout } from './socialQueries';
import { WorkoutPhotoActions } from './WorkoutPhotoActions';
import { WorkoutPhotos } from './WorkoutPhotos';

/**
 * A shared workout opened from the feed or Home: who logged it, its summary, exercises and sets,
 * then its reactions and comments, with a composer kept above the keyboard.
 */
export function SharedWorkoutScreen({
  workoutId,
  memberId,
  date,
  showComments = false,
  highlightCommentId,
}: {
  workoutId: string;
  memberId: string;
  date: string;
  showComments?: boolean;
  /** A comment opened from a notification. */
  highlightCommentId?: string;
}) {
  const { colors, space, type } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useSocialNavigation();
  const unit = useWeightUnit();
  const query = useSharedWorkout(workoutId, memberId, date);
  const member = useSharedProfile(memberId).data;
  const data = query.data;
  const thread = useCommentThread(workoutId, data?.reactions ?? null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const composer = useRef<ComponentRef<typeof TextInput>>(null);
  const scrolled = useRef(false);
  const header = <Stack.Screen options={socialHeader(colors, 'Workout')} />;

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page }}>
        {header}
        {query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <Loading label="Loading workout" />
        )}
      </View>
    );
  }

  const { workout, reactions } = data;
  const session = friendSession(workout);
  const own = memberId === nav.me;
  const name = own ? 'You' : (member?.display_name ?? '');
  const subject = `${own ? 'Your' : `${member?.display_name ?? ''}’s`} ${workout.name}`;
  const records = data.records.length
    ? (recordCountsByWorkout(data.records).get(workout.id) ?? 0)
    : (data.recordCount ?? 0);
  const stats = feedStats(workout, unit);
  const when = [relativeDay(workout.workout_date, localDate()), loggedTime(workout.created_at)]
    .filter(Boolean)
    .join(' · ');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.page }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
    >
      {header}
      <ScrollView
        ref={scroll}
        contentContainerStyle={{
          padding: space.gutter,
          gap: space.stack,
          paddingBottom: space.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={own ? 'Open your profile' : `Open ${name}’s profile`}
            onPress={() => nav.openProfile({ id: memberId })}
            style={({ pressed }) => [styles.person, pressed && { opacity: 0.6 }]}
          >
            {member && <Avatar person={member} size={42} />}
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>{name}</Text>
              <Text style={[type.footnote, { color: colors.muted }]}>{when}</Text>
            </View>
            <Icon name="chevronRight" size={14} color={colors.muted} />
          </Pressable>
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
              {session.name}
            </Text>
            {(stats.length > 0 || records > 0) && (
              <View style={styles.statsRow}>
                {stats.length > 0 && (
                  <Text style={[type.callout, type.number, { color: colors.secondary }]}>
                    {stats.join(' · ')}
                  </Text>
                )}
                {stats.length > 0 && records > 0 && (
                  <Text style={[type.callout, { color: colors.muted }]}>·</Text>
                )}
                {records > 0 && (
                  <View style={styles.records}>
                    <Icon name="trophy" size={14} color={colors.gold} />
                    <Text style={[type.callout, { color: colors.gold, fontWeight: '700' }]}>
                      {records} {records === 1 ? 'PR' : 'PRs'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          {own ? (
            <WorkoutPhotoActions
              workoutId={workout.id}
              photos={workout.photos ?? []}
              subject={subject}
              inset={(space.gutter + space.lg) * 2}
            />
          ) : (
            <WorkoutPhotos
              photos={workout.photos ?? []}
              subject={subject}
              inset={(space.gutter + space.lg) * 2}
              full
            />
          )}
          <ReactionBar
            workoutId={workout.id}
            subject={subject}
            reactions={reactions}
            ownWorkout={own}
            onOpenPerson={nav.openProfile}
          />
        </Card>
        {workout.movements.length > 0 && (
          <Card>
            <WorkoutDetails
              workout={workout}
              personalRecords={data.records}
              bodyweight={null}
              unit={unit}
            />
          </Card>
        )}
        <Card style={{ gap: space.md }}>
          <View
            style={{ gap: space.md }}
            onLayout={(event) => {
              if (!showComments || scrolled.current) return;
              scrolled.current = true;
              const y = event.nativeEvent.layout.y;
              requestAnimationFrame(() => scroll.current?.scrollTo({ y, animated: true }));
            }}
          >
            <CardHeader
              title="Comments"
              detail={
                thread.items.length > 0
                  ? `${thread.items.length} ${thread.items.length === 1 ? 'comment' : 'comments'}`
                  : undefined
              }
            />
            <CommentList
              thread={thread}
              highlightId={highlightCommentId}
              onOpenPerson={nav.openProfile}
              onCompose={() => composer.current?.focus()}
            />
          </View>
        </Card>
      </ScrollView>
      <View
        style={[
          styles.composer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.line,
            paddingBottom: Math.max(insets.bottom, space.sm),
          },
        ]}
      >
        <CommentComposer thread={thread} ref={composer} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  records: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  composer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
