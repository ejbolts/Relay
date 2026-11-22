import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
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
import { colors } from '../../theme';
import type { RoutineView } from '../training/accountRoutine';
import { TrainingScreen } from '../training/TrainingScreen';
import { ApiError, currentUser, loadRoutine, signIn, signOut } from './api';

type Screen =
  | { kind: 'loading' | 'login' }
  | { kind: 'error'; message: string; signedIn: boolean }
  | { kind: 'routine'; routine: RoutineView };

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Could not reach Relay. Try again.';
}

function Action({
  label,
  onPress,
  disabled,
  subtle,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        subtle && styles.subtle,
        (pressed || disabled) && styles.dim,
      ]}
    >
      <Text style={[styles.actionLabel, subtle && styles.subtleLabel]}>{label}</Text>
    </Pressable>
  );
}

export function AccountScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const action = useRef(false);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    let controller: AbortController | undefined;
    // A quiet refresh keeps the routine on screen: returning from another app mid-workout
    // must not blank it, and a dropped connection must not replace it with an error.
    function refresh(quiet: boolean) {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      if (!quiet) {
        setScreen({ kind: 'loading' });
        setError('');
      }
      let signedIn = false;
      async function read() {
        try {
          const user = await currentUser(signal);
          signedIn = true;
          if (user.must_change_password)
            throw new Error('Change your password in Relay on the web, then try again.');
          const routine = await loadRoutine(signal);
          if (!signal.aborted) setScreen({ kind: 'routine', routine });
        } catch (e) {
          if (signal.aborted) return;
          if (e instanceof ApiError && e.status === 401) setScreen({ kind: 'login' });
          else
            setScreen((current) =>
              quiet && current.kind === 'routine'
                ? current
                : { kind: 'error', message: message(e), signedIn },
            );
        }
      }
      void read();
    }
    refresh(false);
    const sub = AppState.addEventListener('change', (state) => {
      if (action.current) return;
      if (state === 'active') refresh(true);
      if (state === 'background') setPassword('');
    });
    return () => {
      controller?.abort();
      sub.remove();
    };
  }, [revision]);

  async function authenticate(logout: boolean) {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      if (logout) await signOut();
      else await signIn(username.trim(), password);
      setPassword('');
      setUsername('');
      setScreen({ kind: 'loading' });
      setRevision((v) => v + 1);
    } catch (e) {
      if (logout)
        setScreen({
          kind: 'error',
          message: 'Sign-out was not confirmed. Reconnect to Relay and try again.',
          signedIn: true,
        });
      else setError(message(e));
    } finally {
      action.current = false;
      setBusy(false);
    }
  }
  const logout = (
    <Action subtle label="Sign out" disabled={busy} onPress={() => void authenticate(true)} />
  );
  if (screen.kind === 'routine')
    return <TrainingScreen routine={screen.routine} accountAction={logout} />;
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.brand}>
            <Image style={styles.logo} source={require('../../../assets/icon.png')} />
            <Text style={styles.wordmark}>Relay</Text>
          </View>
          {screen.kind === 'loading' ? (
            <ActivityIndicator accessibilityLabel="Loading account" color={colors.accentText} />
          ) : screen.kind === 'error' ? (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                Account
              </Text>
              <Text accessibilityRole="alert" style={styles.text}>
                {screen.message}
              </Text>
              <Action label="Try again" disabled={busy} onPress={() => setRevision((v) => v + 1)} />
              {screen.signedIn && logout}
            </>
          ) : (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                Sign in
              </Text>
              <Text style={styles.text}>Username</Text>
              <TextInput
                style={styles.input}
                accessibilityLabel="Username"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                editable={!busy}
                value={username}
                onChangeText={setUsername}
                returnKeyType="next"
                onSubmitEditing={() => passwordInput.current?.focus()}
              />
              <Text style={styles.text}>Password</Text>
              <TextInput
                ref={passwordInput}
                style={styles.input}
                accessibilityLabel="Password"
                autoComplete="current-password"
                secureTextEntry
                editable={!busy}
                value={password}
                onChangeText={setPassword}
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (username.trim() && password) void authenticate(false);
                }}
              />
              {!!error && (
                <Text accessibilityRole="alert" style={styles.text}>
                  {error}
                </Text>
              )}
              <Action
                label={busy ? 'Signing in…' : 'Sign in'}
                disabled={busy || !username.trim() || !password}
                onPress={() => void authenticate(false)}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 20, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 26 },
  logo: { width: 35, height: 35, borderRadius: 9 },
  wordmark: { color: colors.text, fontSize: 23, fontWeight: '700' },
  title: { color: colors.text, fontSize: 38, fontWeight: '700', marginBottom: 8 },
  text: { color: colors.secondary, fontSize: 16 },
  input: {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    fontSize: 18,
  },
  action: {
    minHeight: 48,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  subtle: { backgroundColor: 'transparent', marginLeft: 'auto' },
  dim: { opacity: 0.6 },
  actionLabel: { color: 'white', fontSize: 16, fontWeight: '600' },
  subtleLabel: { color: colors.accentText },
});
