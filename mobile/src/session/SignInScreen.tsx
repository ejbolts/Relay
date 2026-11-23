import { useRef, useState, type ComponentRef } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  authErrorText,
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
import { queueAppTour } from '../features/guides/tourProgress';
import { Button, Card, errorMessage, ErrorState, Loading } from '../ui/components';
import { ProfilePhoto } from '../ui/ProfilePhoto';
import { Sheet } from '../ui/Sheet';
import { showToast, ToastHost } from '../ui/Toast';
import { useTheme } from '../ui/theme';
import { AccountHelpSheet } from './AccountHelpSheet';
import { registerAccount, useRegistrationConfig } from './registration';
import { useSession } from './SessionProvider';

/** Shown instead of the app until the account is signed in. */
export function SignInScreen() {
  const { status, signIn, retry } = useSession();
  const { colors, type, radius } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [needsInviteCode, setNeedsInviteCode] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [sampleOpen, setSampleOpen] = useState(false);
  const [help, setHelp] = useState<AccountHelpRequest | null>(null);
  const config = useRegistrationConfig(status.kind === 'signed-out');
  const inviteRequired = needsInviteCode || !!config.data?.invite_code_required;
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const inviteInput = useRef<ComponentRef<typeof TextInput>>(null);

  function switchForm() {
    setCreating(!creating);
    setPassword('');
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
        // A new account takes the quick tour on its first Home, as on the web.
        queueAppTour(created.id);
        try {
          await signIn(fields.username, password);
        } catch {
          setUsername(fields.username);
          setPassword('');
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

  const input = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.surface,
      borderColor: colors.lineStrong,
      borderRadius: radius.md,
    },
  ];
  const label = [type.callout, { color: colors.secondary }];
  const errorStyle = [type.callout, { color: colors.danger }];
  const title = creating ? 'Create account' : 'Sign in';
  const sample = sampleProfileIdentity(displayName, username);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.brand}>
            <Image style={styles.logo} source={require('../../assets/icon.png')} />
            <Text style={[type.title, { color: colors.text }]}>Relay</Text>
          </View>
          {!apiOrigin ? (
            <Text style={[type.callout, { color: colors.secondary }]}>
              Set EXPO_PUBLIC_RELAY_API_ORIGIN in mobile/.env.local to your Relay server, then
              restart Expo.
            </Text>
          ) : status.kind === 'loading' ? (
            <Loading label="Loading account" />
          ) : status.kind === 'error' ? (
            <ErrorState message={status.message || errorMessage(null)} onRetry={retry} />
          ) : (
            <>
              <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.text }]}>
                {title}
              </Text>
              {creating && (
                <>
                  <View style={styles.fieldLabel}>
                    <Text style={label}>Display name</Text>
                    <Button
                      label="?"
                      accessibilityLabel="About display name"
                      variant="link"
                      onPress={() => Alert.alert('Display name', SIGNUP_NAME_HELP)}
                    />
                  </View>
                  <TextInput
                    style={input}
                    accessibilityLabel="Display name"
                    autoComplete="name"
                    maxLength={80}
                    editable={!busy}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                  {!!fieldErrors.displayName && (
                    <Text accessibilityRole="alert" style={errorStyle}>
                      {fieldErrors.displayName}
                    </Text>
                  )}
                </>
              )}
              <View style={creating ? styles.fieldLabel : styles.signInLabel}>
                <Text style={label}>Username</Text>
                {creating ? (
                  <Button
                    label="?"
                    accessibilityLabel="About username"
                    variant="link"
                    onPress={() => Alert.alert('Username', SIGNUP_USERNAME_HELP)}
                  />
                ) : (
                  <Button
                    label="Forgot username?"
                    variant="link"
                    disabled={busy}
                    onPress={() => setHelp(USERNAME_REMINDER_REQUEST)}
                  />
                )}
              </View>
              <TextInput
                style={input}
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
              {!!fieldErrors.username && (
                <Text accessibilityRole="alert" style={errorStyle}>
                  {fieldErrors.username}
                </Text>
              )}
              <View style={creating ? undefined : styles.signInLabel}>
                <Text style={label}>Password</Text>
                {!creating && (
                  <Button
                    label="Forgot password?"
                    variant="link"
                    disabled={busy}
                    onPress={() => setHelp(PASSWORD_RESET_REQUEST)}
                  />
                )}
              </View>
              <TextInput
                ref={passwordInput}
                style={input}
                accessibilityLabel="Password"
                autoComplete={creating ? 'new-password' : 'current-password'}
                textContentType={creating ? 'newPassword' : 'password'}
                secureTextEntry
                editable={!busy}
                value={password}
                onChangeText={setPassword}
                returnKeyType={creating && inviteRequired ? 'next' : 'go'}
                onSubmitEditing={() => {
                  if (creating && inviteRequired) inviteInput.current?.focus();
                  else void submit();
                }}
              />
              {!!fieldErrors.password && (
                <Text accessibilityRole="alert" style={errorStyle}>
                  {fieldErrors.password}
                </Text>
              )}
              {creating && inviteRequired && (
                <>
                  <Text style={label}>Invite code</Text>
                  <TextInput
                    ref={inviteInput}
                    style={input}
                    accessibilityLabel="Invite code"
                    value={inviteCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={200}
                    editable={!busy}
                    onChangeText={setInviteCode}
                    returnKeyType="go"
                    onSubmitEditing={() => void submit()}
                  />
                  {!!fieldErrors.inviteCode && (
                    <Text accessibilityRole="alert" style={errorStyle}>
                      {fieldErrors.inviteCode}
                    </Text>
                  )}
                </>
              )}
              {!!error && (
                <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
                  {error}
                </Text>
              )}
              <Button
                label={busy ? (creating ? 'Creating account…' : 'Signing in…') : title}
                disabled={busy || (!creating && (!username.trim() || !password))}
                onPress={() => void submit()}
              />
              {(creating || config.data?.registration_open) && (
                <Button
                  label={creating ? 'Back to sign in' : 'Create account'}
                  variant="secondary"
                  disabled={busy}
                  onPress={switchForm}
                />
              )}
              {creating && (
                <Button
                  label="See a sample profile"
                  variant="link"
                  onPress={() => {
                    Keyboard.dismiss();
                    setSampleOpen(true);
                  }}
                />
              )}
            </>
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
                <Text style={[type.callout, { color: colors.secondary }]}>@{sample.username}</Text>
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
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 20, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 26 },
  logo: { width: 35, height: 35, borderRadius: 9 },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, fontSize: 18 },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signInLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
