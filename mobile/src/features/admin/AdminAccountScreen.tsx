import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  accountLiveWorkout,
  accountOnline,
  accountVersionsLabel,
  afterPasswordReset,
  dismissRequestsLabel,
  replaceAccount,
  userDisabledNotice,
  userSexNotice,
} from '../../../../frontend/src/adminAccounts';
import {
  formatBytes,
  formatJoined,
  formatLastActive,
  plural,
} from '../../../../frontend/src/adminDisplay';
import { workoutElapsed } from '../../../../frontend/src/presenceStatus';
import { SEX_LABELS } from '../../../../frontend/src/profileDisplay';
import type { AdminUser, Sex } from '../../../../frontend/src/types';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, errorMessage, ErrorState, Loading } from '../../ui/components';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { ChoiceRow, Row, Section, SettingsPage } from '../settings/SettingsList';
import { useAccountGuard, type AccountCheck } from './accountGuard';
import { AccountTags } from './AccountTags';
import { adminApi, adminKeys, patchAccount, useAdminActivity, useAdminUsers } from './adminData';
import { adminIcons } from './icons';
import { adminRoutes } from './routes';

const NOT_SET = 'none';

/**
 * Accounts with a password reset on its way to the server. Kept outside the screen so a reset
 * can't start twice for one account, even if its screen were opened again meanwhile.
 */
const resetsInFlight = new Set<string>();
type SexChoice = Sex | typeof NOT_SET;

/** One account in the admin console, opened from the list or from a request notice. */
export function AdminAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const users = useAdminUsers();
  useAdminActivity();
  if (users.isPending) return <Loading label="Loading account" />;
  if (users.error && !users.data)
    return <ErrorState message={errorMessage(users.error)} onRetry={() => void users.refetch()} />;
  const account = users.data?.find((row) => row.id === id);
  if (!account)
    return (
      <ErrorState message="This account no longer exists." onRetry={() => void users.refetch()} />
    );
  return <AccountDetails account={account} />;
}

function AccountDetails({ account }: { account: AdminUser }) {
  const me = useUser();
  const client = useQueryClient();
  const router = useRouter();
  const { colors, type } = useTheme();
  const now = useNow(60_000);
  const guard = useAccountGuard();
  const [busy, setBusy] = useState(false);
  // Set synchronously, so a second tap in the same frame can't start a second request.
  const working = useRef(false);
  const [resetting, setResetting] = useState(false);
  // The reset confirmation is open: its answer may still be on its way to the screen.
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown once while this screen is open, then discarded.
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  // The temporary password exists only here: leaving while the reset is on its way, or before
  // it has been dismissed, would lose its only copy. Leaving waits for the reset, then asks.
  usePreventRemove(confirmingReset || resetting || temporaryPassword !== null, ({ repeat }) => {
    // Back can reach the screen before the confirmation's answer does (Android delivers them
    // separately), so leaving waits from the moment the confirmation opens.
    if (confirmingReset) return;
    if (resetting) {
      showToast('Wait for the password reset to finish.');
      return;
    }
    Alert.alert(
      'Leave without the temporary password?',
      `It won’t be shown again. ${account.display_name} would need another reset.`,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            setTemporaryPassword(null);
            repeat();
          },
        },
      ],
    );
  });
  const isSelf = account.id === me.id;
  const disabled = account.disabled_at !== null;
  const online = accountOnline(account);
  const live = accountLiveWorkout(account);
  const resetAt = account.password_reset_requested_at ?? null;
  const usernameAt = account.username_reminder_requested_at ?? null;

  /**
   * Runs one action at a time. Its cache writes need `check.sameSession()`; toasts and this
   * screen's state need `check.open()`.
   */
  async function run(action: (check: AccountCheck) => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const check = guard();
    try {
      await action(check);
    } catch (reason) {
      if (check.open()) setError(errorMessage(reason));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const replace = (updated: AdminUser) =>
    client.setQueryData<AdminUser[]>(
      adminKeys.users,
      (current) => replaceAccount(current, updated) ?? undefined,
    );

  function confirmReset() {
    setConfirmingReset(true);
    Alert.alert(
      `Reset ${account.display_name}’s password?`,
      'Signs them out everywhere. They choose a new password at next sign-in.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setConfirmingReset(false) },
        {
          text: 'Reset and sign out',
          style: 'destructive',
          onPress: () => void reset(),
        },
      ],
      { cancelable: true, onDismiss: () => setConfirmingReset(false) },
    );
  }

  async function reset() {
    if (resetsInFlight.has(account.id)) {
      setConfirmingReset(false);
      return;
    }
    resetsInFlight.add(account.id);
    setResetting(true);
    setConfirmingReset(false);
    try {
      await run(async (check) => {
        setTemporaryPassword(null);
        const { temporary_password } = await adminApi.resetPassword(account.id);
        if (!check.sameSession()) return;
        patchAccount(client, account.id, afterPasswordReset);
        setTemporaryPassword(temporary_password);
      });
    } finally {
      resetsInFlight.delete(account.id);
      setResetting(false);
    }
  }

  function changeDisabled(next: boolean) {
    const apply = () =>
      void run(async (check) => {
        const updated = await adminApi.setDisabled(account.id, next);
        if (!check.sameSession()) return;
        replace(updated);
        if (check.open()) showToast(userDisabledNotice(updated, next));
      });
    if (!next) {
      apply();
      return;
    }
    Alert.alert(
      `Disable ${account.display_name}?`,
      'Signs them out everywhere and blocks sign-in. Their data is kept, so enabling the account restores everything.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disable and sign out', style: 'destructive', onPress: apply },
      ],
    );
  }

  function changeSex(choice: SexChoice) {
    const sex = choice === NOT_SET ? null : choice;
    void run(async (check) => {
      const updated = await adminApi.setSex(account.id, sex);
      if (!check.sameSession()) return;
      replace(updated);
      if (check.open()) showToast(userSexNotice(updated, sex));
    });
  }

  function dismissRequests() {
    void run(async (check) => {
      // The tags clear; the account keeps its place in the list until the next refresh.
      if (account.password_reset_requested_at) {
        await adminApi.dismissPasswordReset(account.id);
        if (!check.sameSession()) return;
        patchAccount(client, account.id, (row) => ({ ...row, password_reset_requested_at: null }));
      }
      if (account.username_reminder_requested_at) {
        await adminApi.dismissUsernameReminder(account.id);
        if (!check.sameSession()) return;
        patchAccount(client, account.id, (row) => ({
          ...row,
          username_reminder_requested_at: null,
        }));
      }
    });
  }

  async function copyPassword() {
    if (!temporaryPassword) return;
    await Clipboard.setStringAsync(temporaryPassword);
    showToast('Password copied');
  }

  return (
    <SettingsPage>
      <Stack.Screen options={{ title: account.display_name }} />
      <View style={{ gap: 6 }}>
        <Text style={[type.callout, { color: colors.muted }]}>@{account.username}</Text>
        <AccountTags account={account} isSelf={isSelf} />
      </View>
      {temporaryPassword && (
        <Card accessibilityLabel={`Temporary password for ${account.display_name}`}>
          <Text style={[type.headline, { color: colors.text }]}>Temporary password</Text>
          <Text selectable style={[type.title, styles.password, { color: colors.text }]}>
            {temporaryPassword}
          </Text>
          <Text style={[type.footnote, { color: colors.secondary }]}>
            Shown once. {account.display_name} must choose a new password after signing in.
          </Text>
          <View style={styles.buttons}>
            <Button
              label="Copy"
              icon={adminIcons.copy}
              variant="secondary"
              onPress={() => void copyPassword()}
            />
            <Button label="Done" onPress={() => setTemporaryPassword(null)} />
          </View>
        </Card>
      )}
      {(resetAt || usernameAt) && (
        <Section title="Waiting">
          {resetAt && (
            <Row label="Asked for a reset" value={formatLastActive(resetAt, new Date(now))} />
          )}
          {usernameAt && (
            <Row label="Asked for username" value={formatLastActive(usernameAt, new Date(now))} />
          )}
        </Section>
      )}
      <Section title="Activity">
        <Row label="Joined" value={formatJoined(account.created_at)} />
        <Row
          label="Last active"
          value={online ? 'Active now' : formatLastActive(account.last_active_at, new Date(now))}
        />
        {live && (
          <Row
            label="Live workout"
            value={`${live.name} · ${workoutElapsed(live.started_at, now)}`}
          />
        )}
        <Row label="Signed in on" value={plural(account.signed_in_devices, 'device')} />
        <Row label="App versions" value={accountVersionsLabel(account)} />
      </Section>
      <Section title="Data">
        <Row label="Workouts" value={String(account.workouts)} />
        <Row label="Photos" value={`${account.photos} · ${formatBytes(account.photo_bytes)}`} />
        <Row label="Video sessions" value={String(account.video_sessions)} />
        <ChoiceRow<SexChoice>
          label="Sex"
          value={account.sex ?? NOT_SET}
          disabled={busy}
          choices={[
            { value: NOT_SET, label: 'Not set' },
            { value: 'male', label: SEX_LABELS.male },
            { value: 'female', label: SEX_LABELS.female },
          ]}
          onChange={changeSex}
        />
      </Section>
      {!!error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <Section title="Actions">
        {!isSelf && (
          <Row
            label="Reset password"
            disabled={busy || resetting}
            busy={resetting}
            onPress={confirmReset}
            chevron={false}
          />
        )}
        <Row
          label="Change username"
          disabled={busy}
          onPress={() => router.push(adminRoutes.username(account.id))}
          chevron={false}
        />
        {(resetAt || usernameAt) && (
          <Row
            label={dismissRequestsLabel(account)}
            disabled={busy}
            onPress={dismissRequests}
            chevron={false}
          />
        )}
        {!isSelf && (
          <Row
            label={disabled ? 'Enable account' : 'Disable account'}
            destructive={!disabled}
            disabled={busy}
            onPress={() => changeDisabled(!disabled)}
            chevron={false}
          />
        )}
      </Section>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  password: { fontFamily: 'monospace', letterSpacing: 1 },
  buttons: { flexDirection: 'row', gap: 10 },
});
