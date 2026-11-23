import { useRef, useState, type ComponentRef, type Ref } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  authErrorText,
  MIN_PASSWORD_LENGTH,
  passwordChangeError,
  passwordChangeFailureText,
} from '../../../../frontend/src/authRules';
import { ApiError } from '../../data/api';
import { Button, errorMessage } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { settingsIcons } from './icons';
import { changePassword } from './settingsData';

type Field = 'current' | 'next' | 'confirm';

/**
 * Current (or temporary) password, new password and its confirmation, checked with the web's
 * rules and saved to the same endpoint. The server signs out the account's other devices.
 */
export function PasswordForm({
  temporary = false,
  submitLabel,
  busyLabel,
  onChanged,
}: {
  /** After an admin reset: the current password is the temporary one. */
  temporary?: boolean;
  submitLabel: string;
  busyLabel: string;
  onChanged: () => Promise<void> | void;
}) {
  const { colors, type } = useTheme();
  const [values, setValues] = useState<Record<Field, string>>({
    current: '',
    next: '',
    confirm: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextInput = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmInput = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    if (saving) return;
    setError(null);
    const fields = { current: values.current, next: values.next, confirm: values.confirm };
    const invalid = passwordChangeError(fields, { temporary });
    if (invalid) {
      setError(invalid);
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      await changePassword(values.current, values.next);
    } catch (reason) {
      setSaving(false);
      setError(
        reason instanceof ApiError
          ? temporary
            ? authErrorText(reason)
            : passwordChangeFailureText(reason)
          : errorMessage(reason),
      );
      return;
    }
    setValues({ current: '', next: '', confirm: '' });
    await onChanged();
    setSaving(false);
  }

  const set = (field: Field) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  return (
    <View style={{ gap: 14 }}>
      <PasswordField
        label={temporary ? 'Temporary password' : 'Current password'}
        value={values.current}
        onChange={set('current')}
        autoFocus={temporary}
        autoComplete="current-password"
        editable={!saving}
        onSubmit={() => nextInput.current?.focus()}
      />
      <PasswordField
        ref={nextInput}
        label="New password"
        value={values.next}
        onChange={set('next')}
        autoComplete="new-password"
        editable={!saving}
        onSubmit={() => confirmInput.current?.focus()}
      />
      <Text style={[type.footnote, { color: colors.muted, marginTop: -8 }]}>
        At least {MIN_PASSWORD_LENGTH} characters.
      </Text>
      <PasswordField
        ref={confirmInput}
        label="Confirm new password"
        value={values.confirm}
        onChange={set('confirm')}
        autoComplete="new-password"
        editable={!saving}
        returnKeyType="go"
        onSubmit={() => void submit()}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <Button
        label={saving ? busyLabel : submitLabel}
        size="large"
        block
        loading={saving}
        disabled={saving || (!temporary && (!values.current || !values.next || !values.confirm))}
        onPress={() => void submit()}
      />
    </View>
  );
}

function PasswordField({
  ref,
  label,
  value,
  onChange,
  onSubmit,
  autoFocus,
  autoComplete,
  editable,
  returnKeyType = 'next',
}: {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
  autoComplete: 'current-password' | 'new-password';
  editable: boolean;
  returnKeyType?: 'next' | 'go';
}) {
  const { colors, type, radius, scheme } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface2,
            borderColor: focused ? colors.accent : colors.lineStrong,
            borderRadius: radius.md,
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          style={[type.body, styles.input, { color: colors.text }]}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          keyboardAppearance={scheme}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
          autoFocus={autoFocus}
          editable={editable}
          returnKeyType={returnKeyType}
          submitBehavior={returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={onSubmit}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          hitSlop={4}
          onPress={() => {
            haptics.tap();
            setRevealed((shown) => !shown);
          }}
          style={styles.reveal}
        >
          <Icon
            name={revealed ? settingsIcons.hide : settingsIcons.show}
            size={19}
            color={colors.accentText}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 46 },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, minHeight: 46 },
  reveal: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
