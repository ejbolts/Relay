import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { replaceAccount, usernameChangedNotice } from '../../../../frontend/src/adminAccounts';
import { validateUsername } from '../../../../frontend/src/authRules';
import type { AdminUser } from '../../../../frontend/src/types';
import { ApiError } from '../../data/api';
import { Button, errorMessage, ErrorState, Loading } from '../../ui/components';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { SettingsPage } from '../settings/SettingsList';
import { useAccountGuard } from './accountGuard';
import { adminApi, adminKeys, useAdminUsers } from './adminData';

/**
 * The web's Change username dialog, as its own screen so the keyboard never covers the field
 * (an Android sheet sits under it). The typed name and any error beside it stay until the server
 * saves the name, and leaving waits while a save is on its way.
 */
export function AdminUsernameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const users = useAdminUsers();
  if (users.isPending) return <Loading label="Loading account" />;
  const account = users.data?.find((row) => row.id === id);
  if (!account)
    return (
      <ErrorState
        message={users.error ? errorMessage(users.error) : 'This account no longer exists.'}
        onRetry={() => void users.refetch()}
      />
    );
  return <UsernameForm account={account} />;
}

function UsernameForm({ account }: { account: AdminUser }) {
  const router = useRouter();
  const client = useQueryClient();
  const guard = useAccountGuard();
  const { colors, type, radius } = useTheme();
  const [value, setValue] = useState(account.username);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set synchronously, so a second press in the same frame can't send the name twice.
  const sending = useRef(false);

  const [saved, setSaved] = useState(false);

  usePreventRemove(saving, ({ repeat }) => {
    // The hold lifts a render after the save settles; leaving in between goes ahead.
    if (!sending.current) {
      repeat();
      return;
    }
    showToast('Wait for the username to save.', undefined, { variant: 'warning' });
  });
  // Goes back once the save has settled and leaving is no longer held.
  useEffect(() => {
    if (saved && !saving) router.back();
  }, [saved, saving, router]);

  async function submit() {
    if (sending.current) return;
    const cleaned = value.trim().toLowerCase();
    const invalid = validateUsername(cleaned);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (cleaned === account.username) {
      router.back();
      return;
    }
    sending.current = true;
    setSaving(true);
    setError(null);
    const check = guard();
    try {
      const updated = await adminApi.setUsername(account.id, cleaned);
      if (!check.sameSession()) return;
      client.setQueryData<AdminUser[]>(
        adminKeys.users,
        (current) => replaceAccount(current, updated) ?? undefined,
      );
      if (!check.open()) return;
      showToast(usernameChangedNotice(updated));
      setSaved(true);
    } catch (reason) {
      if (!check.open()) return;
      setError(
        reason instanceof ApiError && reason.code === 'username_taken'
          ? 'This username is already registered.'
          : errorMessage(reason),
      );
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  return (
    <SettingsPage>
      <View style={{ gap: 8 }}>
        <Text style={[type.footnote, { color: colors.secondary }]}>
          {account.display_name}’s username
        </Text>
        <TextInput
          accessibilityLabel="Username"
          value={value}
          onChangeText={(next) => {
            setValue(next);
            setError(null);
          }}
          onSubmitEditing={() => void submit()}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          editable={!saving}
          maxLength={32}
          returnKeyType="done"
          style={[
            type.body,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: error ? colors.danger : colors.line,
              paddingHorizontal: 12,
              paddingVertical: 10,
            },
          ]}
        />
        {error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        <Button
          label={saving ? 'Saving…' : 'Save'}
          disabled={saving}
          onPress={() => void submit()}
          style={{ marginTop: 8 }}
        />
      </View>
    </SettingsPage>
  );
}
