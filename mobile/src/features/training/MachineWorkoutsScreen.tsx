import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { machineDate, timeSince } from '../../../../frontend/src/machineHistory';
import { LIST_PAGE_SIZE } from '../../../../frontend/src/pagination';
import { localDate } from '../../../../frontend/src/utils';
import { useAuthorisedImage } from '../../data/authorisedImage';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../data/offline';
import { Button, Card, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useAllMachinePhotos } from '../workout/loggerQueries';
import { MachineFilterSheet } from './MachineFilterSheet';
import { useMachineWorkouts } from './machineQueries';
import type { MachineFilter } from './MachinePhotos';
import { Divider, MoreButton } from './parts';
import { RepeatWorkoutButton } from './RepeatWorkoutButton';
import { useTrainingContext } from './useTrainingContext';
import { WorkoutCard, WorkoutDetails } from './WorkoutCard';

/**
 * Every saved workout that pinned one machine, newest first, as the web's "Filtered by machine"
 * view of Training's Sessions: when the machine was last used and how often, then its workouts
 * with the newest open and the machine's exercise outlined. Change picks another machine; Back
 * closes the filter.
 */
export function MachineWorkoutsScreen({
  photoId,
  caption,
  exerciseName,
}: {
  photoId: string;
  /** Shown until the saved machines load, and kept if this machine isn't among them. */
  caption?: string;
  exerciseName?: string;
}) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const choose = ({ photo, exerciseName: name }: MachineFilter) => {
    setChanging(false);
    router.setParams({ id: photo.id, caption: photo.caption, exercise: name });
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Filtered by machine' }} />
      {/* Another machine starts again with its own newest workout open. */}
      <MachineWorkouts
        key={photoId}
        photoId={photoId}
        caption={caption}
        exerciseName={exerciseName}
        onChange={() => setChanging(true)}
        onFilterMachine={choose}
      />
      <MachineFilterSheet visible={changing} onSelect={choose} onClose={() => setChanging(false)} />
    </>
  );
}

function MachineWorkouts({
  photoId,
  caption,
  exerciseName,
  onChange,
  onFilterMachine,
}: {
  photoId: string;
  caption?: string;
  exerciseName?: string;
  onChange: () => void;
  onFilterMachine: (filter: MachineFilter) => void;
}) {
  const { colors, space, type } = useTheme();
  const router = useRouter();
  const context = useTrainingContext();
  const [today] = useState(localDate);
  const query = useMachineWorkouts(photoId);
  const machine = useAllMachinePhotos().data?.find((item) => item.id === photoId);
  const workouts = query.data ?? null;
  // The newest workout opens first, as on the web, until another is opened or closed.
  const [chosenOpen, setChosenOpen] = useState<string | null | undefined>(undefined);
  const openId = chosenOpen === undefined ? (workouts?.[0]?.id ?? null) : chosenOpen;
  const [pages, setPages] = useState(1);
  const shown = workouts?.slice(0, pages * LIST_PAGE_SIZE) ?? [];
  // The machine's exercise is outlined in each workout, as the web targets it.
  const exerciseId =
    machine?.exercise_id ??
    workouts
      ?.flatMap((item) => item.movements)
      .find((movement) => movement.machine_photos?.some((photo) => photo.id === photoId))?.exercise
      .id ??
    null;

  const offline = waitingForNetwork(query);
  const error = offline ? OFFLINE_MESSAGE : query.isError ? errorMessage(query.error) : null;
  const lastUsed = workouts?.[0]?.workout_date ?? null;
  const count = workouts?.length ?? 0;
  const status = error
    ? error
    : workouts === null
      ? 'Finding your sessions…'
      : lastUsed
        ? `Last used ${machineDate(lastUsed)} · ${timeSince(lastUsed, today)} · ${count} ${count === 1 ? 'workout' : 'workouts'}`
        : 'No saved workouts use this machine yet.';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }
    >
      <Card accessibilityLabel="Machine filter">
        <View style={styles.banner}>
          <BannerPhoto url={machine?.thumbnail_url ?? null} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
              {machine?.caption || caption || 'Machine'}
            </Text>
            {!!(machine?.exercise_name || exerciseName) && (
              <Text style={[type.callout, { color: colors.secondary }]}>
                {machine?.exercise_name || exerciseName}
              </Text>
            )}
            <Text
              accessibilityRole={error ? 'alert' : 'text'}
              accessibilityLiveRegion="polite"
              style={[type.footnote, { color: error ? colors.danger : colors.muted }]}
            >
              {status}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          {error && (
            <Button
              label="Try again"
              variant="secondary"
              size="small"
              onPress={() => void query.refetch()}
            />
          )}
          <Button label="Change" variant="secondary" size="small" onPress={onChange} />
        </View>
      </Card>

      {shown.length > 0 && (
        <View style={{ gap: 8 }} accessibilityLabel="Workouts on this machine">
          <View style={styles.listHeader}>
            <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
              On this machine
            </Text>
            <Text style={[type.footnote, { color: colors.secondary }]}>Newest first</Text>
          </View>
          <Card style={styles.list}>
            {shown.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <Divider />}
                <WorkoutCard
                  workout={item}
                  color={context.colorOf(item)}
                  records={context.recordCounts.get(item.id) ?? 0}
                  open={openId === item.id}
                  showYear
                  onToggle={() => setChosenOpen(openId === item.id ? null : item.id)}
                >
                  <WorkoutDetails
                    workout={item}
                    personalRecords={context.personalRecords}
                    bodyweight={context.bodyweightOn(item.workout_date)}
                    unit={context.unit}
                    highlightExerciseId={exerciseId}
                    onOpenExercise={(id) =>
                      router.push({ pathname: '/training/exercise/[id]', params: { id } })
                    }
                    onFilterMachine={onFilterMachine}
                    machineFilterId={photoId}
                  />
                  <View style={styles.cardActions}>
                    <RepeatWorkoutButton workout={item} unit={context.unit} />
                  </View>
                </WorkoutCard>
              </View>
            ))}
          </Card>
          {workouts && shown.length < workouts.length && (
            <MoreButton label="Show more workouts" onPress={() => setPages(pages + 1)} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

function BannerPhoto({ url }: { url: string | null }) {
  const { colors, radius } = useTheme();
  const image = useAuthorisedImage(url);
  return (
    <View style={[styles.photo, { backgroundColor: colors.surface3, borderRadius: radius.md }]}>
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} />
      ) : (
        <Icon name="filter" size={20} color={colors.muted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  photo: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  list: { paddingVertical: 0, gap: 0 },
  cardActions: { paddingBottom: 16 },
});
