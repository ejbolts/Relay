import { useRef, useState, type ComponentRef } from 'react';
import {
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
import { apiOrigin } from '../data/api';
import { Button, errorMessage, ErrorState, Loading } from '../ui/components';
import { useTheme } from '../ui/theme';
import { useSession } from './SessionProvider';

/** Shown instead of the app until the account is signed in. */
export function SignInScreen() {
  const { status, signIn, retry } = useSession();
  const { colors, type, radius } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
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
                Sign in
              </Text>
              <Text style={[type.callout, { color: colors.secondary }]}>Username</Text>
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
              <Text style={[type.callout, { color: colors.secondary }]}>Password</Text>
              <TextInput
                ref={passwordInput}
                style={input}
                accessibilityLabel="Password"
                autoComplete="current-password"
                textContentType="password"
                secureTextEntry
                editable={!busy}
                value={password}
                onChangeText={setPassword}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
              {!!error && (
                <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
                  {error}
                </Text>
              )}
              <Button
                label={busy ? 'Signing in…' : 'Sign in'}
                disabled={busy || !username.trim() || !password}
                onPress={() => void submit()}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 20, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 26 },
  logo: { width: 35, height: 35, borderRadius: 9 },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, fontSize: 18 },
});
