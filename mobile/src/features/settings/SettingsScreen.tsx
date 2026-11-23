import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatReleaseVersion, announcedVersion } from '../../../../frontend/src/releaseMetadata';
import {
  autoSaveChoiceLabel,
  autoSaveChoices,
  DEFAULT_WORKOUT_AUTO_SAVE_MINUTES,
  defaultRestChoices,
  validWeeklySetGoal,
  WEEK_START_CHOICES,
  WEEKLY_GOAL_ERROR,
  WEIGHT_UNIT_CHOICES,
} from '../../../../frontend/src/trainingSettings';
import { VISIBILITY_LABELS } from '../../../../frontend/src/sharedProfileDisplay';
import type { TrainingPreferences } from '../../../../frontend/src/types';
import { formatSeconds } from '../../../../frontend/src/utils';
import { apiOrigin, ApiError } from '../../data/api';
import { useTrainingPreferences, useWorkoutTypes } from '../../data/queries';
import { useSession, useUser } from '../../session/SessionProvider';
import { errorMessage, ErrorState, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { socialRoutes, useSharingChoices } from '../social';
import { useWorkout } from '../workout/WorkoutProvider';
import { restTimerPreference } from './devicePreferences';
import { settingsIcons } from './icons';
import {
  useAutoSave,
  useSaveAutoSave,
  useSavePreferences,
  useServerRelease,
  useTrainingSplit,
  signOutEverywhere,
} from './settingsData';
import {
  ChoiceRow,
  Row,
  Section,
  SectionError,
  SettingsPage,
  SwitchRow,
  type Choice,
} from './SettingsList';

const NO_REST = -1;

/** Settings, as on the web: training, unfinished workouts, notifications, account and about. */
export function SettingsScreen() {
  const preferences = useTrainingPreferences();
  if (preferences.isPending) return <Loading label="Loading settings" />;
  if (preferences.error && !preferences.data)
    return (
      <ErrorState
        message={errorMessage(preferences.error)}
        onRetry={() => void preferences.refetch()}
      />
    );
  return <SettingsList preferences={preferences.data!} />;
}

function SettingsList({ preferences }: { preferences: TrainingPreferences }) {
  const router = useRouter();
  const types = useWorkoutTypes();
  const split = useTrainingSplit();
  const save = useSavePreferences();
  const [trainingError, setTrainingError] = useState<string | null>(null);
  // While a change is on its way, show it rather than the saved value.
  const shown = (save.isPending && save.variables) || preferences;
  const restTimer = restTimerPreference.use();

  function change(next: TrainingPreferences, confirmation = 'Training preferences saved.') {
    setTrainingError(null);
    save.mutate(next, {
      onSuccess: () => showToast(confirmation),
      onError: (error) => setTrainingError(errorMessage(error)),
    });
  }

  const activeTypes = (types.data ?? []).filter((type) => !type.archived).length;
  const splitName = split.data?.enabled ? split.data.name : 'Automatic';
  const restChoices: Choice<number>[] = [
    { value: NO_REST, label: 'None' },
    ...defaultRestChoices(shown.default_rest_seconds).map((seconds) => ({
      value: seconds,
      label: formatSeconds(seconds),
    })),
  ];

  return (
    <SettingsPage>
      <ProfileHeader />
      <Section title="Training">
        <Row
          label="Your split"
          icon={settingsIcons.split}
          iconTint="#8b5cf6"
          value={split.isPending ? null : splitName}
          onPress={() => router.push('/split')}
        />
        <ChoiceRow
          label="Weight unit"
          icon={settingsIcons.unit}
          iconTint="#14b8a6"
          value={shown.preferred_weight_unit}
          choices={WEIGHT_UNIT_CHOICES}
          onChange={(unit) => change({ ...preferences, preferred_weight_unit: unit })}
        />
        <ChoiceRow
          label="Week starts"
          icon={settingsIcons.week}
          iconTint="#ef476f"
          value={shown.week_start}
          choices={WEEK_START_CHOICES}
          onChange={(weekStart) => change({ ...preferences, week_start: weekStart })}
        />
        <WeeklyGoalRow
          goal={shown.weekly_muscle_set_goal}
          onSave={(goal) => change({ ...preferences, weekly_muscle_set_goal: goal })}
          onInvalid={() => setTrainingError(WEEKLY_GOAL_ERROR)}
        />
        <Row
          label="Muscle goals"
          icon={settingsIcons.goal}
          iconTint="#16a34a"
          onPress={() => router.push('/muscle-goals')}
        />
        <Row
          label="Workout types"
          icon={settingsIcons.types}
          iconTint="#3b82f6"
          value={types.data ? String(activeTypes) : null}
          onPress={() => router.push('/settings/workout-types')}
        />
        <Row
          label="Fresh starts"
          icon={settingsIcons.freshStart}
          iconTint="#159487"
          onPress={() => router.push('/settings/fresh-starts')}
        />
        <Row
          label="Bodyweight chart"
          icon={settingsIcons.unit}
          iconTint="#0e8996"
          onPress={() => router.push('/settings/bodyweight')}
        />
        <Row
          label="Heart-rate zones"
          icon={settingsIcons.heartRate}
          iconTint="#e11d48"
          onPress={() => router.push('/cardio/zones')}
        />
      </Section>
      <Section title="Between sets">
        <SwitchRow
          label="Rest timer"
          icon={settingsIcons.rest}
          iconTint="#f59e0b"
          value={restTimer}
          onChange={restTimerPreference.set}
        />
        {/* Show rest times returns once the logger draws rest times between sets (PARITY.md). */}
        <ChoiceRow
          label="Default rest"
          disabled={save.isPending}
          value={shown.default_rest_seconds ?? NO_REST}
          choices={restChoices}
          onChange={(seconds) =>
            change(
              { ...preferences, default_rest_seconds: seconds === NO_REST ? null : seconds },
              'Default rest saved.',
            )
          }
        />
      </Section>
      <SectionError message={trainingError} />
      <Section title="Appearance">
        <Row
          label="Theme and motion"
          icon={settingsIcons.appearance}
          iconTint="#8057ba"
          onPress={() => router.push('/settings/appearance')}
        />
      </Section>
      <AutoSaveSection />
      <NotificationsSection />
      <AccountSection />
      <AboutSection />
    </SettingsPage>
  );
}

function ProfileHeader() {
  const user = useUser();
  const router = useRouter();
  const { colors, type, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit profile, ${user.display_name}`}
      onPress={() => router.push('/settings/profile')}
      style={({ pressed }) => [
        styles.profile,
        {
          backgroundColor: pressed ? colors.surface2 : colors.surface,
          borderRadius: radius.lg,
          borderColor: colors.line,
        },
      ]}
    >
      <ProfilePhoto user={user} size={60} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.title, { color: colors.text }]} numberOfLines={1}>
          {user.display_name || user.username}
        </Text>
        <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>
      <Icon name="chevronRight" size={14} color={colors.muted} />
    </Pressable>
  );
}

/** Typed like the web's field: saved when the keyboard closes, if it is a whole 1 to 1,000. */
function WeeklyGoalRow({
  goal,
  onSave,
  onInvalid,
}: {
  goal: number;
  onSave: (goal: number) => void;
  onInvalid: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft === null) return;
    const next = Number(draft.trim());
    setDraft(null);
    if (next === goal) return;
    if (!draft.trim() || !validWeeklySetGoal(next)) {
      onInvalid();
      return;
    }
    onSave(next);
  }
  return (
    <Row
      label="Weekly sets per muscle"
      icon={settingsIcons.goal}
      iconTint="#22c55e"
      accessory={
        <TextInput
          accessibilityLabel="Default weekly sets per muscle"
          value={draft ?? String(goal)}
          onChangeText={setDraft}
          onEndEditing={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={4}
          selectTextOnFocus
          style={[
            type.body,
            type.number,
            styles.number,
            { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.sm },
          ]}
        />
      }
    />
  );
}

function AutoSaveSection() {
  const autoSave = useAutoSave();
  const save = useSaveAutoSave();
  const [error, setError] = useState<string | null>(null);
  const saved = autoSave.data?.after_minutes ?? null;
  const minutes = save.isPending ? (save.variables ?? null) : saved;
  const enabled = minutes !== null;
  const change = (value: number | null) => {
    setError(null);
    save.mutate(value, {
      onError: (reason) => setError(`Could not change auto-save. ${errorMessage(reason)}`),
    });
  };
  return (
    <>
      <Section title="Unfinished workouts">
        <SwitchRow
          label="Auto-save"
          icon={settingsIcons.autoSave}
          iconTint="#0ea5e9"
          value={enabled}
          disabled={!autoSave.data || save.isPending}
          onChange={(on) => change(on ? DEFAULT_WORKOUT_AUTO_SAVE_MINUTES : null)}
        />
        {enabled && (
          <ChoiceRow
            label="Save after"
            value={minutes}
            disabled={save.isPending}
            choices={autoSaveChoices(minutes).map((value) => ({
              value,
              label: autoSaveChoiceLabel(value),
            }))}
            onChange={(value) => change(value)}
          />
        )}
      </Section>
      <SectionError message={error ?? (autoSave.error ? errorMessage(autoSave.error) : null)} />
    </>
  );
}

type Permission = 'checking' | 'granted' | 'denied' | 'undetermined';

/** Whether Relay may show notifications on this phone, as the phone's settings say. */
function useNotificationPermission() {
  const [permission, setPermission] = useState<Permission>('checking');
  const check = useCallback(() => {
    Notifications.getPermissionsAsync().then(
      (status) =>
        setPermission(status.granted ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied'),
      () => setPermission('undetermined'),
    );
  }, []);
  useEffect(() => {
    check();
    // Coming back from the phone's settings may have changed it.
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => app.remove();
  }, [check]);
  return { permission, setPermission };
}

function NotificationsSection() {
  const { permission, setPermission } = useNotificationPermission();
  async function press() {
    if (permission !== 'undetermined') {
      void Linking.openSettings();
      return;
    }
    const status = await Notifications.requestPermissionsAsync().catch(() => null);
    if (!status) return;
    setPermission(status.granted ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied');
    if (status.granted) showToast('Notifications on');
  }
  return (
    <Section title="Notifications">
      <Row
        label="Notifications"
        icon={settingsIcons.bell}
        iconTint="#ef4444"
        value={
          permission === 'checking'
            ? null
            : permission === 'granted'
              ? 'On'
              : permission === 'denied'
                ? 'Off'
                : 'Allow'
        }
        external={permission === 'granted' || permission === 'denied'}
        disabled={permission === 'checking'}
        onPress={() => void press()}
      />
    </Section>
  );
}

function AccountSection() {
  const router = useRouter();
  const user = useUser();
  const { signOut } = useSession();
  const workout = useWorkout();
  const sharing = useSharingChoices().data;
  const [busy, setBusy] = useState<'device' | 'everywhere' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsynced = !!workout.live || workout.queue.waiting > 0;
  const unsyncedNote =
    'Workouts not yet saved to Relay stay on this phone and send when you sign back in to this account.';

  async function run(scope: 'device' | 'everywhere') {
    setBusy(scope);
    setError(null);
    try {
      if (scope === 'everywhere') {
        try {
          await signOutEverywhere();
        } catch (reason) {
          // A 401 means this session had already ended, so signing out here finishes it.
          if (!(reason instanceof ApiError && reason.status === 401)) throw reason;
        }
      }
      await signOut();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(null);
    }
  }

  function start(scope: 'device' | 'everywhere') {
    if (busy) return;
    // Signing out of this phone asks first only when a workout hasn't reached Relay yet.
    if (scope === 'device' && !unsynced) {
      void run(scope);
      return;
    }
    const everywhere = scope === 'everywhere';
    Alert.alert(
      everywhere ? 'Sign out everywhere?' : 'Sign out?',
      [
        everywhere && 'Every device signed in to this account will need to sign in again.',
        unsynced && unsyncedNote,
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: everywhere ? 'Sign out everywhere' : 'Sign out',
          style: 'destructive',
          onPress: () => void run(scope),
        },
      ],
    );
  }

  return (
    <>
      <Section title="Account">
        <Row
          label="Profile sharing"
          icon={settingsIcons.people}
          iconTint="#6366f1"
          value={sharing ? VISIBILITY_LABELS[sharing.visibility] : undefined}
          onPress={() => router.push(socialRoutes.sharing)}
        />
        <Row
          label="Change password"
          icon={settingsIcons.password}
          iconTint="#64748b"
          onPress={() => router.push('/settings/password')}
        />
        <Row
          label="Account UUID"
          icon={settingsIcons.copy}
          iconTint="#64748b"
          value={user.id}
          chevron={false}
          accessibilityLabel="Copy account UUID"
          onPress={() => {
            void Clipboard.setStringAsync(user.id).then(
              () => showToast('UUID copied.'),
              () => showToast('Could not copy the UUID.'),
            );
          }}
        />
        <Row
          label={busy === 'device' ? 'Signing out…' : 'Sign out'}
          icon={settingsIcons.signOut}
          iconTint="#64748b"
          chevron={false}
          busy={busy === 'device'}
          disabled={busy !== null}
          onPress={() => start('device')}
        />
        <Row
          label={busy === 'everywhere' ? 'Signing out everywhere…' : 'Sign out everywhere'}
          icon={settingsIcons.everywhere}
          iconTint="#c53b3b"
          destructive
          chevron={false}
          busy={busy === 'everywhere'}
          disabled={busy !== null}
          onPress={() => start('everywhere')}
        />
        <Row
          label="Delete account"
          icon="trash"
          iconTint="#c53b3b"
          destructive
          disabled={busy !== null}
          onPress={() => router.push('/settings/delete-account')}
        />
      </Section>
      <SectionError message={error} />
    </>
  );
}

function AboutSection() {
  const router = useRouter();
  const release = useServerRelease();
  const version = release.data ? formatReleaseVersion(announcedVersion(release.data)) : null;
  return (
    <Section title="About">
      <Row
        label="What's new"
        icon={settingsIcons.whatsNew}
        iconTint="#a855f7"
        value={version}
        onPress={() => router.push('/settings/whats-new')}
      />
      <Row
        label="App version"
        icon={settingsIcons.version}
        iconTint="#64748b"
        value={Constants.expoConfig?.version ?? null}
      />
      <Row
        label="Tips"
        icon={settingsIcons.tips}
        iconTint="#986414"
        onPress={() => router.push('/settings/tips')}
      />
      <Row
        label="Send feedback"
        icon={settingsIcons.feedback}
        iconTint="#316ba8"
        onPress={() => router.push('/settings/feedback')}
      />
      {!!apiOrigin && (
        <Row
          label="Relay on the web"
          icon={settingsIcons.web}
          iconTint="#2c74d0"
          external
          onPress={() => void Linking.openURL(`${apiOrigin!.replace(/\/$/, '')}/#settings`)}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  number: { minWidth: 56, textAlign: 'center', paddingHorizontal: 10, paddingVertical: 6 },
});
