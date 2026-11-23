import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
  usernameChangedNotice,
} from '../../../../frontend/src/adminAccounts';
import {
  formatBytes,
  formatJoined,
  formatLastActive,
  plural,
} from '../../../../frontend/src/adminDisplay';
import { validateUsername } from '../../../../frontend/src/authRules';
import { workoutElapsed } from '../../../../frontend/src/presenceStatus';
import { SEX_LABELS } from '../../../../frontend/src/profileDisplay';
import type { AdminUser, Sex } from '../../../../frontend/src/types';
import { ApiError } from '../../data/api';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, errorMessage, ErrorState, Loading } from '../../ui/components';
import { promptText } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { ChoiceRow, Row, Section, SettingsPage } from '../settings/SettingsList';
import { AccountTags } from './AccountTags';
import { adminApi, adminKeys, patchAccount, useAdminActivity, useAdminUsers } from './adminData';
import { adminIcons } from './icons';

const NOT_SET = 'none';
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
  const { colors, type } = useTheme();
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown once while this screen is open, then discarded.
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const isSelf = account.id === me.id;
  const disabled = account.disabled_at !== null;
  const online = accountOnline(account);
  const live = accountLiveWorkout(account);
  const resetAt = account.password_reset_requested_at ?? null;
  const usernameAt = account.username_reminder_requested_at ?? null;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const replace = (updated: AdminUser) =>
    client.setQueryData<AdminUser[]>(
      adminKeys.users,
      (current) => replaceAccount(current, updated) ?? undefined,
    );

  function confirmReset() {
    Alert.alert(
      `Reset ${account.display_name}’s password?`,
      'Signs them out everywhere. They choose a new password at next sign-in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset and sign out',
          style: 'destructive',
          onPress: () =>
            void run(async () => {
              setTemporaryPassword(null);
              const { temporary_password } = await adminApi.resetPassword(account.id);
              patchAccount(client, account.id, afterPasswordReset);
              setTemporaryPassword(temporary_password);
            }),
        },
      ],
    );
  }

  function changeDisabled(next: boolean) {
    const apply = () =>
      void run(async () => {
        const updated = await adminApi.setDisabled(account.id, next);
        replace(updated);
        showToast(userDisabledNotice(updated, next));
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
    void run(async () => {
      const updated = await adminApi.setSex(account.id, sex);
      replace(updated);
      showToast(userSexNotice(updated, sex));
    });
  }

  function changeUsername(typed = account.username) {
    promptText({
      title: `Change ${account.display_name}’s username`,
      value: typed,
      submitLabel: 'Save',
      onSubmit: (value) => {
        const cleaned = value.trim().toLowerCase();
        const invalid = validateUsername(cleaned);
        if (invalid) {
          setError(invalid);
          return;
        }
        if (cleaned === account.username) return;
        void run(async () => {
          try {
            const updated = await adminApi.setUsername(account.id, cleaned);
            replace(updated);
            showToast(usernameChangedNotice(updated));
          } catch (reason) {
            if (reason instanceof ApiError && reason.code === 'username_taken')
              throw new Error('This username is already registered.');
            throw reason;
          }
        });
      },
    });
  }

  function dismissRequests() {
    void run(async () => {
      // The tags clear; the account keeps its place in the list until the next refresh.
      if (account.password_reset_requested_at) {
        await adminApi.dismissPasswordReset(account.id);
        patchAccount(client, account.id, (row) => ({ ...row, password_reset_requested_at: null }));
      }
      if (account.username_reminder_requested_at) {
        await adminApi.dismissUsernameReminder(account.id);
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
          <Row label="Reset password" disabled={busy} onPress={confirmReset} chevron={false} />
        )}
        <Row
          label="Change username"
          disabled={busy}
          onPress={() => changeUsername()}
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
            busy={busy}
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
