import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { machineAliases } from '../../../../frontend/src/exerciseHistory';
import { machineDate, timeSince } from '../../../../frontend/src/machineHistory';
import { LIST_PAGE_SIZE } from '../../../../frontend/src/pagination';
import { workoutDisplayName } from '../../../../frontend/src/trainingSummary';
import type { TrackedWorkout } from '../../../../frontend/src/types';
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
import { ListPager } from './ListPager';
import { Divider } from './parts';
import { RepeatWorkoutButton } from './RepeatWorkoutButton';
import { trainingKeys } from './trainingQueries';
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
  const client = useQueryClient();
  const query = useMachineWorkouts(photoId);
  const catalogQuery = useAllMachinePhotos();
  const catalog = catalogQuery.data;
  const workouts = query.data ?? null;
  // A machine merged into another since this filter was opened answers as the machine it now
  // belongs to: its photo ids alias the survivor (the shared rule in exerciseHistory.ts).
  const pinned = useMemo(
    () => workouts?.flatMap((item) => item.movements.flatMap((m) => m.machine_photos ?? [])) ?? [],
    [workouts],
  );
  const machineId = useMemo(
    () => machineAliases([...(catalog ?? []), ...pinned]).get(photoId) ?? photoId,
    [catalog, pinned, photoId],
  );
  const machine = catalog?.find((item) => item.id === machineId);
  // A machine the cached list doesn't know yet (merged into elsewhere) shows as its workouts
  // pin it: the canonical photo, its name and its exercise.
  const pinnedMachine = pinned.find((photo) => photo.id === machineId);
  const pinnedExercise = workouts
    ?.flatMap((item) => item.movements)
    .find((movement) => movement.machine_photos?.some((photo) => photo.id === machineId))
    ?.exercise.name;
  const bannerPhoto = machine?.thumbnail_url ?? pinnedMachine?.thumbnail_url ?? null;
  const bannerCaption = machine?.caption || pinnedMachine?.caption || caption || 'Machine';
  const bannerExercise = machine?.exercise_name || pinnedExercise || exerciseName;
  // The newest workout opens first, as on the web, until another is opened or closed.
  const [chosenOpen, setChosenOpen] = useState<string | null | undefined>(undefined);
  const openId = chosenOpen === undefined ? (workouts?.[0]?.id ?? null) : chosenOpen;
  // Ten to a page, as the web's pager shows them; only the current page is laid out.
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil((workouts?.length ?? 0) / LIST_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const shown =
    workouts?.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE) ?? [];
  const scroller = useRef<ScrollViewInstance>(null);
  const listTop = useRef(0);
  // The machine's exercise is outlined in each workout, as the web targets it.
  const exerciseId =
    machine?.exercise_id ?? pinned.find((photo) => photo.id === machineId)?.exercise_id ?? null;

  /** A workout in full, where it can be edited, resumed, shared or given photos. */
  function openWorkout(workout: TrackedWorkout) {
    client.setQueryData<TrackedWorkout>(trainingKeys.workout(workout.id), workout);
    router.push({
      pathname: '/training/session/[id]',
      params: { id: workout.id, ...(exerciseId && { exercise: exerciseId }) },
    });
  }

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
      ref={scroller}
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          // The machine list too, so a merge made elsewhere shows in the banner.
          onRefresh={() => void Promise.all([query.refetch(), catalogQuery.refetch()])}
        />
      }
    >
      <Card accessibilityLabel="Machine filter">
        <View style={styles.banner}>
          <BannerPhoto url={bannerPhoto} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
              {bannerCaption}
            </Text>
            {!!bannerExercise && (
              <Text style={[type.callout, { color: colors.secondary }]}>{bannerExercise}</Text>
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
        <View
          style={{ gap: 8 }}
          accessibilityLabel="Workouts on this machine"
          onLayout={(event) => {
            listTop.current = event.nativeEvent.layout.y;
          }}
        >
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
                    machineFilterId={machineId}
                  />
                  <View style={styles.cardActions}>
                    <Button
                      label="Open workout"
                      accessibilityLabel={`Open ${workoutDisplayName(item)}`}
                      icon="chevronRight"
                      variant="secondary"
                      onPress={() => openWorkout(item)}
                    />
                    <RepeatWorkoutButton workout={item} unit={context.unit} />
                  </View>
                </WorkoutCard>
              </View>
            ))}
          </Card>
          <ListPager
            currentPage={currentPage}
            totalPages={pages}
            label="machine workout"
            onPageChange={(next) => {
              setPage(next);
              setChosenOpen(null);
              scroller.current?.scrollTo({ y: Math.max(0, listTop.current - 12) });
            }}
          />
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
  cardActions: { paddingBottom: 16, gap: 10 },
});
