import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  authErrorText,
  MIN_PASSWORD_LENGTH,
  registrationFields,
  sampleProfileIdentity,
  SIGNUP_NAME_HELP,
  SIGNUP_USERNAME_HELP,
  registrationFieldErrors,
  validateAuthForm,
  type AuthFieldErrors,
} from '../../../frontend/src/authRules';
import {
  PASSWORD_RESET_REQUEST,
  USERNAME_REMINDER_REQUEST,
  type AccountHelpRequest,
} from '../../../frontend/src/accountHelpRequests';
import { ApiError, apiOrigin } from '../data/api';
import { closeAppTour, queueAppTour } from '../features/guides/tourProgress';
import { settingsIcons } from '../features/settings/icons';
import { Button, Card, errorMessage, ErrorState, Loading } from '../ui/components';
import { Segmented, TextField } from '../ui/controls';
import { haptics } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { ProfilePhoto } from '../ui/ProfilePhoto';
import { Sheet } from '../ui/Sheet';
import { showToast, ToastHost } from '../ui/Toast';
import { useTheme } from '../ui/theme';
import { AccountHelpSheet } from './AccountHelpSheet';
import { AuthBackdrop, AuthBrand } from './AuthChrome';
import { queueImportPrompt } from '../features/data/importPrompt';
import { registerAccount, useRegistrationConfig } from './registration';
import { useSession } from './SessionProvider';
import { useRegistrationInvite } from './friendInvite';

/** Shown instead of the app until the account is signed in. */
export function SignInScreen() {
  const { status, signIn, retry } = useSession();
  const { colors, type, radius, scheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [displayName, setDisplayName] = useState('');
  // A friend's link for a closed server carries its registration code, as on the web. A new
  // link replaces the field, even while the form is open; typing is kept until then.
  const linkInvite = useRegistrationInvite();
  const [inviteCode, setInviteCode] = useState(() => linkInvite.code ?? '');
  const [appliedInvite, setAppliedInvite] = useState(linkInvite.version);
  if (linkInvite.version !== appliedInvite) {
    setAppliedInvite(linkInvite.version);
    setInviteCode(linkInvite.code ?? '');
  }
  const [needsInviteCode, setNeedsInviteCode] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [sampleOpen, setSampleOpen] = useState(false);
  const [help, setHelp] = useState<AccountHelpRequest | null>(null);
  const config = useRegistrationConfig(status.kind === 'signed-out');
  const inviteRequired = needsInviteCode || !!config.data?.invite_code_required;
  const registrationOpen = creating || !!config.data?.registration_open;
  // A session ended (signed out or expired): a tour left open belongs to that account.
  useEffect(() => closeAppTour(), []);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const inviteInput = useRef<ComponentRef<typeof TextInput>>(null);

  function switchForm(nextCreating: boolean) {
    if (nextCreating === creating) return;
    setCreating(nextCreating);
    setPassword('');
    setPasswordRevealed(false);
    setError('');
    setFieldErrors({});
  }

  async function submit() {
    if (busy || (!creating && (!username.trim() || !password))) return;
    const values = { displayName, username, password, inviteCode };
    if (creating) {
      const problems = validateAuthForm('create-account', values, {
        invite_code_required: inviteRequired,
      });
      setFieldErrors(problems);
      setError('');
      if (Object.keys(problems).length) return;
    }
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      if (creating) {
        const fields = registrationFields(values);
        const created = await registerAccount(fields);
        // A new account takes the quick tour on its first Home, then is asked whether to import
        // its history, as on the web.
        if (created?.id) {
          queueAppTour(created.id);
          queueImportPrompt(created.id);
        }
        try {
          await signIn(fields.username, password);
        } catch {
          setUsername(fields.username);
          setPassword('');
          setPasswordRevealed(false);
          setCreating(false);
          showToast('Account created. Sign in with your password.');
        }
      } else {
        await signIn(username.trim(), password);
      }
    } catch (e) {
      setError(creating && e instanceof ApiError ? authErrorText(e) : errorMessage(e));
      if (creating && e instanceof ApiError) {
        setFieldErrors(registrationFieldErrors(e.code));
        if (e.code === 'invalid_invite_code') setNeedsInviteCode(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const labelStyle = [type.footnote, { color: colors.secondary, fontWeight: '600' as const }];
  const errorStyle = [type.footnote, { color: colors.danger }];
  const title = creating ? 'Create account' : 'Sign in';
  const sample = sampleProfileIdentity(displayName, username);

  return (
    <View style={{ flex: 1 }}>
      <AuthBackdrop />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <AuthBrand />
            {!apiOrigin ? (
              <Card>
                <Text style={[type.callout, { color: colors.secondary }]}>
                  Set EXPO_PUBLIC_RELAY_API_ORIGIN in mobile/.env.local to your Relay server, then
                  restart Expo.
                </Text>
              </Card>
            ) : status.kind === 'loading' ? (
              <Loading label="Loading account" />
            ) : status.kind === 'error' ? (
              <Card>
                <ErrorState message={status.message || errorMessage(null)} onRetry={retry} />
              </Card>
            ) : (
              <Card style={styles.card}>
                {registrationOpen && (
                  <Segmented
                    accessibilityLabel="Account access"
                    values={['Sign in', 'Create account']}
                    selectedIndex={creating ? 1 : 0}
                    enabled={!busy}
                    onChange={(index) => switchForm(index === 1)}
                  />
                )}

                {creating && (
                  <View style={styles.field}>
                    <View style={styles.fieldLabel}>
                      <Text style={labelStyle}>Display name</Text>
                      <Button
                        label="?"
                        accessibilityLabel="About display name"
                        variant="link"
                        size="small"
                        onPress={() => Alert.alert('Display name', SIGNUP_NAME_HELP)}
                      />
                    </View>
                    <TextField
                      accessibilityLabel="Display name"
                      autoComplete="name"
                      autoCapitalize="words"
                      maxLength={80}
                      editable={!busy}
                      placeholder="Sam Sample"
                      value={displayName}
                      error={fieldErrors.displayName}
                      onChangeText={setDisplayName}
                    />
                  </View>
                )}

                <View style={styles.field}>
                  <View style={creating ? styles.fieldLabel : styles.signInLabel}>
                    <Text style={labelStyle}>Username</Text>
                    {creating ? (
                      <Button
                        label="?"
                        accessibilityLabel="About username"
                        variant="link"
                        size="small"
                        onPress={() => Alert.alert('Username', SIGNUP_USERNAME_HELP)}
                      />
                    ) : (
                      <Button
                        label="Forgot username?"
                        variant="link"
                        size="small"
                        disabled={busy}
                        onPress={() => setHelp(USERNAME_REMINDER_REQUEST)}
                      />
                    )}
                  </View>
                  {!creating ? (
                    <TextField
                      accessibilityLabel="Username"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                      editable={!busy}
                      value={username}
                      onChangeText={setUsername}
                      returnKeyType="next"
                      onSubmitEditing={() => passwordInput.current?.focus()}
                    />
                  ) : (
                    <View
                      style={[
                        styles.inputBox,
                        {
                          backgroundColor: colors.surface2,
                          borderColor: fieldErrors.username
                            ? colors.danger
                            : usernameFocused
                              ? colors.accent
                              : colors.lineStrong,
                          borderRadius: radius.md,
                        },
                      ]}
                    >
                      <Text
                        aria-hidden
                        style={[
                          type.body,
                          { color: colors.accentText, fontWeight: '700', paddingLeft: 12 },
                        ]}
                      >
                        @
                      </Text>
                      <TextInput
                        style={[
                          type.body,
                          styles.inputInner,
                          { color: colors.text, paddingLeft: 6 },
                        ]}
                        accessibilityLabel="Username"
                        placeholderTextColor={colors.muted}
                        selectionColor={colors.accent}
                        cursorColor={colors.accent}
                        keyboardAppearance={scheme}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="username"
                        textContentType="username"
                        placeholder="sam.sample"
                        editable={!busy}
                        value={username}
                        onChangeText={setUsername}
                        onFocus={() => setUsernameFocused(true)}
                        onBlur={() => setUsernameFocused(false)}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordInput.current?.focus()}
                      />
                    </View>
                  )}
                  {!!fieldErrors.username && (
                    <Text accessibilityRole="alert" style={errorStyle}>
                      {fieldErrors.username}
                    </Text>
                  )}
                </View>

                <View style={styles.field}>
                  <View style={creating ? styles.fieldLabel : styles.signInLabel}>
                    <Text style={labelStyle}>Password</Text>
                    {!creating && (
                      <Button
                        label="Forgot password?"
                        variant="link"
                        size="small"
                        disabled={busy}
                        onPress={() => setHelp(PASSWORD_RESET_REQUEST)}
                      />
                    )}
                  </View>
                  <View
                    style={[
                      styles.inputBox,
                      {
                        backgroundColor: colors.surface2,
                        borderColor: fieldErrors.password
                          ? colors.danger
                          : passwordFocused
                            ? colors.accent
                            : colors.lineStrong,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <TextInput
                      ref={passwordInput}
                      style={[type.body, styles.inputInner, { color: colors.text }]}
                      accessibilityLabel="Password"
                      placeholderTextColor={colors.muted}
                      selectionColor={colors.accent}
                      cursorColor={colors.accent}
                      keyboardAppearance={scheme}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete={creating ? 'new-password' : 'current-password'}
                      textContentType={creating ? 'newPassword' : 'password'}
                      secureTextEntry={!passwordRevealed}
                      editable={!busy}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      returnKeyType={creating && inviteRequired ? 'next' : 'go'}
                      onSubmitEditing={() => {
                        if (creating && inviteRequired) inviteInput.current?.focus();
                        else void submit();
                      }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={passwordRevealed ? 'Hide password' : 'Show password'}
                      hitSlop={4}
                      onPress={() => {
                        haptics.tap();
                        setPasswordRevealed((shown) => !shown);
                      }}
                      style={styles.revealButton}
                    >
                      <Icon
                        name={passwordRevealed ? settingsIcons.hide : settingsIcons.show}
                        size={19}
                        color={colors.accentText}
                      />
                    </Pressable>
                  </View>
                  {creating && !fieldErrors.password && (
                    <Text style={[type.caption, { color: colors.muted }]}>
                      At least {MIN_PASSWORD_LENGTH} characters.
                    </Text>
                  )}
                  {!!fieldErrors.password && (
                    <Text accessibilityRole="alert" style={errorStyle}>
                      {fieldErrors.password}
                    </Text>
                  )}
                </View>

                {creating && inviteRequired && (
                  <View style={styles.field}>
                    <Text style={labelStyle}>Invite code</Text>
                    <TextField
                      ref={inviteInput}
                      accessibilityLabel="Invite code"
                      value={inviteCode}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={200}
                      editable={!busy}
                      error={fieldErrors.inviteCode}
                      onChangeText={setInviteCode}
                      returnKeyType="go"
                      onSubmitEditing={() => void submit()}
                    />
                  </View>
                )}

                {!!error && (
                  <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
                    {error}
                  </Text>
                )}

                <Button
                  label={busy ? (creating ? 'Creating account…' : 'Signing in…') : title}
                  size="large"
                  block
                  loading={busy}
                  disabled={busy || (!creating && (!username.trim() || !password))}
                  onPress={() => void submit()}
                  style={{ marginTop: 2 }}
                />

                {creating && (
                  <Button
                    label="See a sample profile"
                    variant="link"
                    align="center"
                    onPress={() => {
                      Keyboard.dismiss();
                      setSampleOpen(true);
                    }}
                  />
                )}
              </Card>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        {creating && (
          <Sheet visible={sampleOpen} title="Sample profile" onClose={() => setSampleOpen(false)}>
            <Card>
              <View style={styles.sample}>
                <ProfilePhoto user={sample} size={60} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[type.headline, { color: colors.text }]}>{sample.display_name}</Text>
                  <Text style={[type.callout, { color: colors.secondary }]}>
                    @{sample.username}
                  </Text>
                </View>
              </View>
            </Card>
          </Sheet>
        )}
        {!creating && (
          <AccountHelpSheet
            help={help}
            // A reset is for the username typed so far; a reminder starts empty.
            initialValue={help === PASSWORD_RESET_REQUEST ? username : ''}
            onClose={() => setHelp(null)}
          />
        )}
        <ToastHost />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 20,
  },
  card: { gap: 14 },
  field: { gap: 6 },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signInLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 46,
  },
  inputInner: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  revealButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
