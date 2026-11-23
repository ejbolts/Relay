import { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AccountHelpRequest } from '../../../frontend/src/accountHelpRequests';
import { authErrorText } from '../../../frontend/src/authRules';
import { ApiError, request } from '../data/api';
import { Button, errorMessage } from '../ui/components';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { useTheme } from '../ui/theme';

/** Sends one account-help request; the server answers the same way whatever was typed. */
export function sendAccountHelpRequest(help: AccountHelpRequest, value: string) {
  return request<void>(
    help.path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(help.body(value)),
    },
    null,
  );
}

/**
 * The web's Forgot password and Forgot username dialogs: asks the server's admins for help
 * signing in, then repeats what was sent so a typo can be spotted.
 */
export function AccountHelpSheet({
  help,
  initialValue = '',
  onClose,
}: {
  /** The request to make, or null while the sheet is closed. */
  help: AccountHelpRequest | null;
  initialValue?: string;
  onClose: () => void;
}) {
  return (
    <Sheet visible={!!help} title={help?.title ?? ''} onClose={onClose}>
      {help && (
        <AccountHelpForm
          key={help.path}
          help={help}
          initialValue={initialValue}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function AccountHelpForm({
  help,
  initialValue,
  onClose,
}: {
  help: AccountHelpRequest;
  initialValue: string;
  onClose: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [value, setValue] = useState(initialValue.trim());
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (sending) return;
    const cleaned = help.clean(value);
    setError(null);
    if (!cleaned) {
      setFieldError(help.emptyError);
      return;
    }
    setFieldError(null);
    setSending(true);
    Keyboard.dismiss();
    try {
      await sendAccountHelpRequest(help, cleaned);
      setSentFor(cleaned);
    } catch (reason) {
      setError(reason instanceof ApiError ? authErrorText(reason) : errorMessage(reason));
    } finally {
      setSending(false);
    }
  }

  if (sentFor) {
    return (
      <>
        <View accessibilityRole="summary" style={styles.sent}>
          <View style={[styles.sentIcon, { backgroundColor: colors.surface2 }]}>
            <Icon name="check" size={18} color={colors.good} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.headline, { color: colors.text }]}>{help.sentTitle(sentFor)}</Text>
            <Text style={[type.callout, { color: colors.secondary }]}>{help.sentMessage}</Text>
          </View>
        </View>
        <Button label="Done" onPress={onClose} />
      </>
    );
  }
  return (
    <>
      <View style={{ gap: 8 }}>
        <Text style={[type.callout, { color: colors.secondary }]}>{help.label}</Text>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface2,
              borderColor: fieldError ? colors.danger : colors.lineStrong,
              borderRadius: radius.md,
            },
          ]}
          accessibilityLabel={help.label}
          autoFocus
          autoCapitalize={help.autoCapitalize}
          autoCorrect={false}
          autoComplete={help.autoComplete}
          textContentType={help.autoComplete === 'username' ? 'username' : 'name'}
          maxLength={help.maxLength}
          editable={!sending}
          value={value}
          onChangeText={(text) => {
            setValue(text);
            // The empty-field error no longer applies once something is typed.
            setFieldError(null);
          }}
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
        />
        {!!fieldError && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {fieldError}
          </Text>
        )}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <Button
        label={sending ? 'Sending…' : help.submitLabel}
        disabled={sending}
        onPress={() => void submit()}
      />
      <Button label="Cancel" variant="secondary" disabled={sending} onPress={onClose} />
    </>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, fontSize: 18 },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
