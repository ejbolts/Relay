import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { searchWords, typoMatch } from '../../../../frontend/src/fuzzyText';
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
import { cardSurface, errorMessage, ErrorState, Loading } from '../../ui/components';
import { Icon, type IconName, type IconPair } from '../../ui/Icon';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { HelpSettings } from '../guides/HelpSettings';
// B5 (data): imports, exports and backups.
import { DataSection } from '../data';
import { socialRoutes, useSharingChoices } from '../social';
import { useWorkout } from '../workout/WorkoutProvider';
import { restTimerPreference, restTimesPreference } from './devicePreferences';
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

interface SearchEntry {
  id: string;
  title: string;
  group: string;
  keywords: string;
  icon: IconName | IconPair;
  route?: string;
  /** Renders an inline interactive row directly in search results when present. */
  render?: () => ReactNode;
}

function matchesSearch(query: string, entry: Pick<SearchEntry, 'title' | 'group' | 'keywords'>) {
  const words = searchWords(query);
  if (!words.length) return false;
  const haystack = searchWords(`${entry.title} ${entry.group} ${entry.keywords}`);
  return words.every((word) =>
    haystack.some((token) => token.startsWith(word) || typoMatch(word, token) !== null),
  );
}

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
  const [query, setQuery] = useState('');
  // While a change is on its way, show it rather than the saved value.
  const shown = (save.isPending && save.variables) || preferences;
  const restTimer = restTimerPreference.use();
  // Stream B1 (logger): rest times between sets.
  const restTimes = restTimesPreference.use();

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

  const weightUnitRow = (
    <ChoiceRow
      key="weight-unit"
      label="Weight unit"
      icon={settingsIcons.unit}
      value={shown.preferred_weight_unit}
      choices={WEIGHT_UNIT_CHOICES}
      onChange={(unit) => change({ ...preferences, preferred_weight_unit: unit })}
    />
  );
  const weekStartsRow = (
    <ChoiceRow
      key="week-starts"
      label="Week starts"
      icon={settingsIcons.week}
      value={shown.week_start}
      choices={WEEK_START_CHOICES}
      onChange={(weekStart) => change({ ...preferences, week_start: weekStart })}
    />
  );
  const weeklyGoalRow = (
    <WeeklyGoalRow
      key="weekly-goal"
      goal={shown.weekly_muscle_set_goal}
      onSave={(goal) => change({ ...preferences, weekly_muscle_set_goal: goal })}
      onInvalid={() => setTrainingError(WEEKLY_GOAL_ERROR)}
    />
  );
  const restTimerRow = (
    <SwitchRow
      key="rest-timer"
      label="Rest timer"
      icon={settingsIcons.rest}
      value={restTimer}
      onChange={restTimerPreference.set}
    />
  );
  const restTimesRow = (
    <SwitchRow
      key="rest-times"
      label="Show rest times"
      icon={settingsIcons.show}
      value={restTimes}
      onChange={restTimesPreference.set}
    />
  );
  const defaultRestRow = (
    <ChoiceRow
      key="default-rest"
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
  );

  const searchEntries: SearchEntry[] = [
    {
      id: 'profile',
      title: 'Edit profile',
      group: 'Profile',
      keywords: 'username display name photo picture avatar sex male female',
      icon: settingsIcons.people,
      route: '/settings/profile',
    },
    {
      id: 'split',
      title: 'Your split',
      group: 'Training',
      keywords: 'schedule rotation routine routines upper lower push pull legs ppl templates cycle',
      icon: settingsIcons.split,
      route: '/split',
    },
    {
      id: 'weight-unit',
      title: 'Weight unit',
      group: 'Training',
      keywords: 'kg lb kilograms pounds units',
      icon: settingsIcons.unit,
      render: () => weightUnitRow,
    },
    {
      id: 'week-starts',
      title: 'Week starts',
      group: 'Training',
      keywords: 'monday sunday schedule calendar',
      icon: settingsIcons.week,
      render: () => weekStartsRow,
    },
    {
      id: 'weekly-goal',
      title: 'Weekly sets per muscle',
      group: 'Training',
      keywords: 'muscle sets goal targets volume default',
      icon: settingsIcons.goal,
      render: () => weeklyGoalRow,
    },
    {
      id: 'muscle-goals',
      title: 'Muscle goals',
      group: 'Training',
      keywords: 'per muscle targets volume chest back legs',
      icon: settingsIcons.goal,
      route: '/muscle-goals',
    },
    {
      id: 'workout-types',
      title: 'Workout types',
      group: 'Training',
      keywords: 'colour color category calendar legend custom add remove',
      icon: settingsIcons.types,
      route: '/settings/workout-types',
    },
    {
      id: 'fresh-starts',
      title: 'Fresh starts',
      group: 'Training',
      keywords: 'personal records pr prs reset baseline restart',
      icon: settingsIcons.freshStart,
      route: '/settings/fresh-starts',
    },
    {
      id: 'bodyweight',
      title: 'Bodyweight chart',
      group: 'Training',
      keywords: 'body weight average median duration trend measurements',
      icon: settingsIcons.unit,
      route: '/settings/bodyweight',
    },
    {
      id: 'heart-rate',
      title: 'Heart-rate zones',
      group: 'Training',
      keywords: 'cardio zone zones hr bpm zone 2 weekly goal minutes',
      icon: settingsIcons.heartRate,
      route: '/cardio/zones',
    },
    {
      id: 'rest-timer',
      title: 'Rest timer',
      group: 'Between sets',
      keywords: 'automatic countdown between sets timer',
      icon: settingsIcons.rest,
      render: () => restTimerRow,
    },
    {
      id: 'rest-times',
      title: 'Show rest times',
      group: 'Between sets',
      keywords: 'hide display between sets rest duration',
      icon: settingsIcons.show,
      render: () => restTimesRow,
    },
    {
      id: 'default-rest',
      title: 'Default rest',
      group: 'Between sets',
      keywords: 'between sets new set standard length duration timer',
      icon: settingsIcons.rest,
      render: () => defaultRestRow,
    },
    {
      id: 'appearance',
      title: 'Theme and motion',
      group: 'Appearance',
      keywords:
        'appearance light dark mode automatic system colour color palette accent blue emerald plum coral amber neutral stained oled animations reduce motion',
      icon: settingsIcons.appearance,
      route: '/settings/appearance',
    },
    {
      id: 'guides',
      title: 'Guides',
      group: 'Help',
      keywords: 'setup walkthrough tour how to normalise machine weights blocks',
      icon: settingsIcons.guides,
      route: '/settings/guides',
    },
    {
      id: 'import',
      title: 'Import workouts',
      group: 'Data',
      keywords: 'csv import history upload backup',
      icon: settingsIcons.data,
      route: '/data/import',
    },
    {
      id: 'export',
      title: 'Export data',
      group: 'Data',
      keywords: 'csv export download backup archive',
      icon: settingsIcons.data,
      route: '/data/export',
    },
    {
      id: 'sharing',
      title: 'Profile sharing',
      group: 'Account',
      keywords: 'privacy private public friends visibility live activity',
      icon: settingsIcons.people,
      route: socialRoutes.sharing,
    },
    {
      id: 'password',
      title: 'Change password',
      group: 'Account',
      keywords: 'security login account password',
      icon: settingsIcons.password,
      route: '/settings/password',
    },
    {
      id: 'delete-account',
      title: 'Delete account',
      group: 'Account',
      keywords: 'remove permanently danger account',
      icon: 'trash',
      route: '/settings/delete-account',
    },
    {
      id: 'whats-new',
      title: "What's new",
      group: 'About',
      keywords: 'version updates release changelog changes',
      icon: settingsIcons.whatsNew,
      route: '/settings/whats-new',
    },
    {
      id: 'tips',
      title: 'Tips',
      group: 'About',
      keywords: 'hints learn disable suggestions',
      icon: settingsIcons.tips,
      route: '/settings/tips',
    },
    {
      id: 'feedback',
      title: 'Send feedback',
      group: 'About',
      keywords: 'suggestion bug report feature request ideas support',
      icon: settingsIcons.feedback,
      route: '/settings/feedback',
    },
  ];

  const searching = query.trim().length > 0;
  const matches = searching ? searchEntries.filter((entry) => matchesSearch(query, entry)) : [];

  return (
    <SettingsPage>
      <ProfileHeader />
      <SettingsSearchBar value={query} onChange={setQuery} />
      {searching ? (
        <SearchResults
          matches={matches}
          onNavigate={(route) => {
            setQuery('');
            router.push(route as never);
          }}
        />
      ) : (
        <>
          <Section title="Training">
            <Row
              label="Your split"
              icon={settingsIcons.split}
              value={split.isPending ? null : splitName}
              onPress={() => router.push('/split')}
            />
            {weightUnitRow}
            {weekStartsRow}
            {weeklyGoalRow}
            <Row
              label="Muscle goals"
              icon={settingsIcons.goal}
              onPress={() => router.push('/muscle-goals')}
            />
            <Row
              label="Workout types"
              icon={settingsIcons.types}
              value={types.data ? String(activeTypes) : null}
              onPress={() => router.push('/settings/workout-types')}
            />
            <Row
              label="Fresh starts"
              icon={settingsIcons.freshStart}
              onPress={() => router.push('/settings/fresh-starts')}
            />
            <Row
              label="Bodyweight chart"
              icon={settingsIcons.unit}
              onPress={() => router.push('/settings/bodyweight')}
            />
            <Row
              label="Heart-rate zones"
              icon={settingsIcons.heartRate}
              onPress={() => router.push('/cardio/zones')}
            />
          </Section>
          <Section title="Between sets">
            {restTimerRow}
            {restTimesRow}
            {defaultRestRow}
          </Section>
          <SectionError message={trainingError} />
          <Section title="Appearance">
            <Row
              label="Theme and motion"
              icon={settingsIcons.appearance}
              onPress={() => router.push('/settings/appearance')}
            />
          </Section>
          {/* B4 (guides): Help and Workout sharing. */}
          <HelpSettings />
          <AutoSaveSection />
          <NotificationsSection />
          <DataSection />
          <AccountSection />
          <AboutSection />
        </>
      )}
    </SettingsPage>
  );
}

function SettingsSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.searchBar,
        {
          backgroundColor: colors.surface,
          borderColor: focused ? colors.accent : colors.lineStrong,
          borderRadius: radius.md,
        },
      ]}
    >
      <Icon name="search" size={18} color={colors.muted} />
      <TextInput
        accessibilityLabel="Search settings and profile"
        placeholder="Rest timer, username, theme…"
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        style={[type.body, styles.searchInput, { color: colors.text }]}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChange('')}
          style={styles.clearButton}
        >
          <Icon name="close" size={16} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

function SearchResults({
  matches,
  onNavigate,
}: {
  matches: SearchEntry[];
  onNavigate: (route: string) => void;
}) {
  const { colors, type } = useTheme();
  if (!matches.length) {
    return (
      <Text style={[type.callout, { color: colors.muted, paddingHorizontal: 16 }]}>
        No settings found. Try “timer” or “username”.
      </Text>
    );
  }
  return (
    <Section title={`${matches.length} ${matches.length === 1 ? 'result' : 'results'}`}>
      {matches.map((entry) =>
        entry.render ? (
          entry.render()
        ) : (
          <Row
            key={entry.id}
            label={entry.title}
            subtitle={entry.group}
            icon={entry.icon}
            destructive={entry.id === 'delete-account'}
            onPress={() => entry.route && onNavigate(entry.route)}
          />
        ),
      )}
    </Section>
  );
}

function ProfileHeader() {
  const user = useUser();
  const router = useRouter();
  const { colors, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit profile, ${user.display_name}`}
      onPress={() => router.push('/settings/profile')}
      style={({ pressed }) => [
        cardSurface(colors),
        styles.profile,
        pressed && { backgroundColor: colors.surface2 },
      ]}
    >
      <ProfilePhoto user={user} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: colors.text }]} numberOfLines={1}>
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
  const [focused, setFocused] = useState(false);
  function commit() {
    setFocused(false);
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
      accessory={
        <TextInput
          accessibilityLabel="Default weekly sets per muscle"
          value={draft ?? String(goal)}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
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
            {
              color: colors.text,
              backgroundColor: colors.surface2,
              borderColor: focused ? colors.accent : colors.lineStrong,
              borderRadius: radius.sm,
            },
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
          value={sharing ? VISIBILITY_LABELS[sharing.visibility] : undefined}
          onPress={() => router.push(socialRoutes.sharing)}
        />
        <Row
          label="Change password"
          icon={settingsIcons.password}
          onPress={() => router.push('/settings/password')}
        />
        <Row
          label="Account UUID"
          icon={settingsIcons.copy}
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
          chevron={false}
          busy={busy === 'device'}
          disabled={busy !== null}
          onPress={() => start('device')}
        />
        <Row
          label={busy === 'everywhere' ? 'Signing out everywhere…' : 'Sign out everywhere'}
          icon={settingsIcons.everywhere}
          destructive
          chevron={false}
          busy={busy === 'everywhere'}
          disabled={busy !== null}
          onPress={() => start('everywhere')}
        />
        <Row
          label="Delete account"
          icon="trash"
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
        value={version}
        onPress={() => router.push('/settings/whats-new')}
      />
      <Row
        label="App version"
        icon={settingsIcons.version}
        value={Constants.expoConfig?.version ?? null}
      />
      <Row label="Tips" icon={settingsIcons.tips} onPress={() => router.push('/settings/tips')} />
      <Row
        label="Send feedback"
        icon={settingsIcons.feedback}
        onPress={() => router.push('/settings/feedback')}
      />
      {!!apiOrigin && (
        <Row
          label="Relay on the web"
          icon={settingsIcons.web}
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
  },
  searchBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
  },
  clearButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    minWidth: 56,
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
});
