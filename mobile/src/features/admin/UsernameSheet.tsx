import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { validateUsername } from '../../../../frontend/src/authRules';
import type { AdminUser } from '../../../../frontend/src/types';
import { ApiError } from '../../data/api';
import { Button, errorMessage } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';

/**
 * The web's Change username dialog. It stays open with the typed name when the name is invalid
 * or already taken, showing why beside the field, and closes only once the server saves it.
 */
export function UsernameSheet({
  account,
  visible,
  onClose,
  onSave,
}: {
  account: AdminUser;
  visible: boolean;
  onClose: () => void;
  /** Rejects with the server's error, shown beside the field. */
  onSave: (username: string) => Promise<void>;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`Change ${account.display_name}’s username`}>
      {/* Mounted only while open, so each opening starts from the saved username. */}
      {visible && <UsernameForm account={account} onClose={onClose} onSave={onSave} />}
    </Sheet>
  );
}

function UsernameForm({
  account,
  onClose,
  onSave,
}: {
  account: AdminUser;
  onClose: () => void;
  onSave: (username: string) => Promise<void>;
}) {
  const { colors, type, radius } = useTheme();
  const [value, setValue] = useState(account.username);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    const cleaned = value.trim().toLowerCase();
    const invalid = validateUsername(cleaned);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (cleaned === account.username) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(cleaned);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.code === 'username_taken'
          ? 'This username is already registered.'
          : errorMessage(reason),
      );
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={[type.footnote, { color: colors.secondary }]}>Username</Text>
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
            backgroundColor: colors.surface2,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? colors.danger : 'transparent',
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
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} />
        <Button
          label={saving ? 'Saving…' : 'Save'}
          disabled={saving}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}
