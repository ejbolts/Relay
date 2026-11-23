import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  CARDIO_DURATION,
  cardioMetricDraft,
  cardioMetricErrors,
  cardioSessionEditInput,
  cardioSessionPayload,
  emptyCardioSession,
  parseCardioMetrics,
} from '../../../../frontend/src/cardioForm';
import { savedCardioRecordsToast } from '../../../../frontend/src/cardioRecords';
import { cardioSessionUpdateFromScan } from '../../../../frontend/src/cardioScreenshot';
import { validCardioInteger } from '../../../../frontend/src/cardioZones';
import type { CardioSession, Exercise } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useExercises } from '../../data/queries';
import { Button, Card, CardHeader, ErrorState, Loading, errorMessage } from '../../ui/components';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { DateField } from '../body/DateField';
import { useCardioOverview } from '../training/trainingQueries';
import {
  cardioWorkoutRecords,
  createCardioSession,
  scanCardioPhoto,
  updateCardioSession,
} from './cardioData';
import {
  CardioChoice,
  CardioError,
  CardioField,
  CardioMetricFields,
  CardioPage,
} from './CardioFields';
import { useCardioWrite } from './useCardioWrite';

export function CardioLogScreen() {
  const exerciseQuery = useExercises();
  return (
    <CardioPage title="Log cardio session">
      {exerciseQuery.data ? (
        <CardioLogForm
          exercises={exerciseQuery.data.filter((exercise) => exercise.kind === 'cardio')}
        />
      ) : exerciseQuery.isError ? (
        <ErrorState
          message={errorMessage(exerciseQuery.error)}
          onRetry={() => void exerciseQuery.refetch()}
        />
      ) : (
        <Loading label="Loading cardio activities" />
      )}
    </CardioPage>
  );
}

/**
 * Edits a session logged on its own, as the web's Edit does for sessions without a workout: its
 * date, activity, minutes, metrics and notes.
 */
export function CardioEditScreen({ sessionId }: { sessionId: string }) {
  const exerciseQuery = useExercises();
  const overview = useCardioOverview();
  const session = overview.data?.sessions.find((item) => item.id === sessionId);
  const failed = exerciseQuery.isError ? exerciseQuery : overview.isError ? overview : null;
  return (
    <CardioPage title="Edit cardio session">
      {exerciseQuery.data && session ? (
        <CardioLogForm
          exercises={exerciseQuery.data.filter((exercise) => exercise.kind === 'cardio')}
          session={session}
        />
      ) : failed ? (
        <ErrorState message={errorMessage(failed.error)} onRetry={() => void failed.refetch()} />
      ) : exerciseQuery.data && overview.data ? (
        <ErrorState
          message="This session no longer exists."
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <Loading label="Loading cardio session" />
      )}
    </CardioPage>
  );
}

function CardioLogForm({ exercises, session }: { exercises: Exercise[]; session?: CardioSession }) {
  const { colors, type } = useTheme();
  const [initial] = useState(() =>
    session
      ? cardioSessionEditInput(session, exercises)
      : emptyCardioSession(exercises, localDate()),
  );
  const [activityId, setActivityId] = useState(initial.exercise_id);
  const [date, setDate] = useState(initial.session_date);
  const [duration, setDuration] = useState(String(initial.duration_minutes));
  const [metrics, setMetrics] = useState(() => cardioMetricDraft(initial));
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState('');
  const [checked, setChecked] = useState(false);
  const { write, saving, saveError } = useCardioWrite();
  const activity = exercises.find((exercise) => exercise.id === activityId);
  // An edited session keeps an activity that no longer matches a cardio exercise.
  const activityName = activity?.name ?? (session ? initial.activity_type : '');
  const minutes = Number(duration);
  const invalidDuration = !validCardioInteger(minutes, CARDIO_DURATION);
  const metricErrors = checked ? cardioMetricErrors(metrics, activityName) : {};
  const busy = picking || scanning || saving;

  async function importScreenshot(source: 'camera' | 'library') {
    if (busy) return;
    setPicking(true);
    setScanError(null);
    try {
      if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setScanError('Allow camera access in your phone’s settings to take a photo.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      setScanning(true);
      const scan = await scanCardioPhoto(result.assets[0]);
      const { update, warning } = cardioSessionUpdateFromScan(scan, exercises);
      if (update.session_date != null) setDate(update.session_date);
      if (update.exercise_id != null) setActivityId(update.exercise_id);
      if (update.duration_minutes != null) setDuration(String(update.duration_minutes));
      setMetrics(cardioMetricDraft(update));
      setScanWarning(warning);
      showToast('Screenshot scanned. Review the fields before saving.');
    } catch (reason) {
      setScanError(errorMessage(reason));
    } finally {
      setScanning(false);
      setPicking(false);
    }
  }

  function save() {
    setChecked(true);
    if (
      busy ||
      (!activity && !session) ||
      invalidDuration ||
      Object.keys(cardioMetricErrors(metrics, activityName)).length
    )
      return;
    if (session) {
      void write(
        () =>
          updateCardioSession(
            session.id,
            cardioSessionPayload({
              ...initial,
              ...parseCardioMetrics(metrics),
              session_date: date,
              exercise_id: activity?.id ?? initial.exercise_id,
              activity_type: activityName,
              duration_minutes: minutes,
              notes: notes.trim() || null,
            }),
          ),
        'Cardio saved',
      );
      return;
    }
    if (!activity) return;
    void write(
      () =>
        createCardioSession({
          ...initial,
          ...parseCardioMetrics(metrics),
          session_date: date,
          exercise_id: activity.id,
          activity_type: activity.name,
          duration_minutes: minutes,
          notes: notes.trim() || null,
        }),
      async (session) => {
        if (!session.source_workout_id) return 'Cardio saved';
        const records = await cardioWorkoutRecords(session.source_workout_id).catch(() => []);
        return savedCardioRecordsToast(records)?.message ?? 'Cardio saved';
      },
    );
  }

  return (
    <>
      <Card>
        <Button
          label={scanning ? 'Scanning…' : 'Import screenshot'}
          variant="secondary"
          icon={{ sf: 'camera', md: 'photo-camera' }}
          disabled={busy}
          onPress={() =>
            showMenu('Import screenshot', [
              { label: 'Choose screenshot', onPress: () => void importScreenshot('library') },
              { label: 'Take photo', onPress: () => void importScreenshot('camera') },
            ])
          }
        />
        {scanError && <CardioError message={scanError} />}
        {!!scanWarning && (
          <Text role="alert" style={[type.footnote, { color: colors.secondary }]}>
            {scanWarning}
          </Text>
        )}
        <View pointerEvents={busy ? 'none' : 'auto'}>
          <DateField label="Date" value={date} onChange={setDate} disabled={busy} />
        </View>
        <View style={{ gap: 5 }}>
          <Text style={[type.footnote, { color: colors.secondary }]}>Activity</Text>
          <CardioChoice
            label="Choose cardio activity"
            value={activityName || (exercises.length ? 'Choose activity' : 'No cardio exercises')}
            disabled={busy || !exercises.length}
            onPress={() =>
              showMenu(
                'Activity',
                exercises.map((exercise) => ({
                  label: exercise.name,
                  onPress: () => setActivityId(exercise.id),
                })),
              )
            }
          />
          {checked && !activity && !session && <CardioError message="Choose a cardio exercise." />}
        </View>
        <CardioField
          label="Minutes"
          keyboardType="number-pad"
          value={duration}
          onChangeText={setDuration}
          editable={!busy}
          error={checked && invalidDuration ? 'Enter whole minutes from 1 to 1,440.' : undefined}
        />
      </Card>
      <Card>
        <CardHeader title="Metrics" />
        <CardioMetricFields
          activity={activityName}
          draft={metrics}
          onChange={(key, value) => setMetrics((current) => ({ ...current, [key]: value }))}
          errors={metricErrors}
          disabled={busy}
        />
        <CardioField
          label="Notes"
          multiline
          value={notes}
          onChangeText={setNotes}
          maxLength={2000}
          editable={!busy}
        />
      </Card>
      {saveError && <CardioError message={saveError} />}
      <Button
        label={saving ? 'Saving…' : session ? 'Save changes' : 'Add cardio session'}
        disabled={busy}
        onPress={save}
      />
    </>
  );
}
