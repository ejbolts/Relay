import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackdrop, AuthBrand } from '../../session/AuthChrome';
import { useSession, useUser } from '../../session/SessionProvider';
import { Button, Card } from '../../ui/components';
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
    <View style={{ flex: 1 }}>
      <AuthBackdrop />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <AuthBrand showTagline={false} />
            <Card style={{ gap: 16 }}>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
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
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
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
});
