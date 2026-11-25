import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { isToastAccountCurrent, showToast, toastAccount } from '../../ui/Toast';
import { DateField } from '../body/DateField';
import { useWorkoutShareReminder } from '../guides/shareReminder';
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
import {
  CLIPBOARD_EMPTY_MESSAGE,
  CLIPBOARD_READ_ERROR,
  openCardioImportMenu,
  readClipboardScreenshot,
  type CardioImportSource,
} from './cardioScreenshotImport';
import { openCardioShareSheet } from './CardioShareSheet';
import { useCardioWrite } from './useCardioWrite';

export type { CardioImportSource } from './cardioScreenshotImport';

/** The native stack's transition event, which expo-router's navigation type leaves out. */
type TransitionEvents = {
  addListener: (
    type: 'transitionEnd',
    listener: (event: { data?: { closing?: boolean } }) => void,
  ) => () => void;
};

export function CardioLogScreen() {
  const exerciseQuery = useExercises();
  const { import: source } = useLocalSearchParams<{ import?: string }>();
  // The picker is presented only once this screen has finished sliding in: UIKit can drop a
  // presentation asked for during a navigation transition.
  const navigation = useNavigation();
  const [arrived, setArrived] = useState(false);
  useEffect(
    () =>
      (navigation as unknown as TransitionEvents).addListener('transitionEnd', (event) => {
        if (!event.data?.closing) setArrived(true);
      }),
    [navigation],
  );
  return (
    <CardioPage title="Log cardio session">
      {exerciseQuery.data ? (
        <CardioLogForm
          exercises={exerciseQuery.data.filter((exercise) => exercise.kind === 'cardio')}
          startImport={
            source === 'camera' || source === 'library' || source === 'clipboard'
              ? source
              : undefined
          }
          ready={arrived}
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

function CardioLogForm({
  exercises,
  session,
  startImport,
  ready = false,
}: {
  exercises: Exercise[];
  session?: CardioSession;
  startImport?: CardioImportSource;
  /** The screen has finished its opening transition, so a picker can be presented. */
  ready?: boolean;
}) {
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
  const [scanPhase, setScanPhase] = useState<'paste' | 'scan' | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState('');
  const [checked, setChecked] = useState(false);
  const [shareReminder] = useWorkoutShareReminder();
  const { write, saving, saveError } = useCardioWrite();
  const openingMenu = useRef(false);
  const importingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const activity = exercises.find((exercise) => exercise.id === activityId);
  // An edited session keeps an activity that no longer matches a cardio exercise.
  const activityName = activity?.name ?? (session ? initial.activity_type : '');
  const minutes = Number(duration);
  const invalidDuration = !validCardioInteger(minutes, CARDIO_DURATION);
  const metricErrors = checked ? cardioMetricErrors(metrics, activityName) : {};
  const busy = picking || scanPhase !== null || saving;

  async function importScreenshot(source: CardioImportSource, { lockForm = true } = {}) {
    if (busy || importingRef.current) return;
    importingRef.current = true;
    const account = toastAccount();
    if (lockForm) setPicking(true);
    setScanError(null);
    let cleanup: (() => void) | undefined;
    try {
      let file: { uri: string; fileName?: string | null; mimeType?: string | null };
      if (source === 'clipboard') {
        setScanPhase('paste');
        let pasted: Awaited<ReturnType<typeof readClipboardScreenshot>>;
        try {
          pasted = await readClipboardScreenshot();
        } catch {
          if (mounted.current && isToastAccountCurrent(account)) setScanError(CLIPBOARD_READ_ERROR);
          return;
        }
        if (!pasted) {
          if (mounted.current && isToastAccountCurrent(account))
            setScanError(CLIPBOARD_EMPTY_MESSAGE);
          return;
        }
        file = pasted;
        cleanup = pasted.cleanup;
      } else {
        if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
          if (mounted.current && isToastAccountCurrent(account))
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
        file = result.assets[0];
      }
      if (!mounted.current || !isToastAccountCurrent(account)) return;
      setScanPhase('scan');
      const scan = await scanCardioPhoto(file);
      if (!mounted.current || !isToastAccountCurrent(account)) return;
      const { update, warning } = cardioSessionUpdateFromScan(scan, exercises);
      if (update.session_date != null) setDate(update.session_date);
      if (update.exercise_id != null) setActivityId(update.exercise_id);
      if (update.duration_minutes != null) setDuration(String(update.duration_minutes));
      setMetrics(cardioMetricDraft(update));
      setScanWarning(warning);
      showToast('Screenshot scanned. Review the fields before saving.', undefined, { account });
    } catch (reason) {
      if (mounted.current && isToastAccountCurrent(account)) setScanError(errorMessage(reason));
    } finally {
      cleanup?.();
      importingRef.current = false;
      if (mounted.current) {
        setScanPhase(null);
        setPicking(false);
      }
    }
  }

  // Opened from Cardio's Import screenshot: go straight to the picker, once, after the screen has
  // arrived. That pick doesn't lock the form, so if the system never shows the picker, Import
  // screenshot and every field still work.
  const [autoImport] = useState(startImport);
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoImport || !ready || autoStarted.current) return;
    autoStarted.current = true;
    void importScreenshot(autoImport, { lockForm: false });
    // Only on arriving: the picker is not offered again when the form changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoImport, ready]);

  async function openImport() {
    if (busy || openingMenu.current) return;
    openingMenu.current = true;
    try {
      await openCardioImportMenu(
        (source) => void importScreenshot(source),
        () => mounted.current,
      );
    } finally {
      openingMenu.current = false;
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
    const reminderOn = shareReminder;
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
      async (created, account) => {
        const records = created.source_workout_id
          ? await cardioWorkoutRecords(created.source_workout_id).catch(() => [])
          : [];
        const celebration = savedCardioRecordsToast(records);
        const action = reminderOn
          ? {
              label: 'Share card',
              run: () => openCardioShareSheet(created, account),
            }
          : undefined;
        return {
          message: celebration?.message ?? (reminderOn ? 'Workout saved' : 'Cardio saved'),
          action,
        };
      },
    );
  }

  return (
    <>
      <Card>
        <Button
          label={
            scanPhase === 'paste'
              ? 'Reading clipboard…'
              : scanPhase === 'scan'
                ? 'Scanning…'
                : 'Import screenshot'
          }
          variant="secondary"
          icon={{ sf: 'camera', md: 'photo-camera' }}
          disabled={busy}
          onPress={() => void openImport()}
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
