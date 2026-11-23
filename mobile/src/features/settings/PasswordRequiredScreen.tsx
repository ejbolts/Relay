import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession, useUser } from '../../session/SessionProvider';
import { Button } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { PasswordForm } from './PasswordForm';
import { currentAccount } from './settingsData';

/**
 * Shown instead of the app after an admin resets the account's password, as on the web: the
 * temporary password is the current one, and nothing else works until a new one replaces it.
 */
export function PasswordRequiredScreen() {
  const user = useUser();
  const { updateUser, signOut } = useSession();
  const { colors, type } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.brand}>
            <Image style={styles.logo} source={require('../../../assets/icon.png')} />
            <Text style={[type.title, { color: colors.text }]}>Relay</Text>
          </View>
          <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.text }]}>
            Choose a new password
          </Text>
          <PasswordForm
            temporary
            submitLabel="Save password"
            busyLabel="Saving…"
            onChanged={async () => {
              // The password is saved; a failed refresh only means the next check confirms it.
              const refreshed = await currentAccount().catch(() => null);
              updateUser(refreshed ?? { ...user, must_change_password: false });
            }}
          />
          <Button
            label={signingOut ? 'Signing out…' : 'Sign out'}
            variant="link"
            disabled={signingOut}
            onPress={() => {
              setSigningOut(true);
              void signOut().catch(() => setSigningOut(false));
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 20, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  logo: { width: 35, height: 35, borderRadius: 9 },
});
