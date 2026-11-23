import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { showToast } from '../../ui/Toast';
import { PasswordForm } from './PasswordForm';
import { SettingsPage } from './SettingsList';

export function ChangePasswordScreen() {
  const router = useRouter();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SettingsPage>
        <PasswordForm
          submitLabel="Update password"
          busyLabel="Updating…"
          onChanged={() => {
            showToast('Password updated. Other devices were signed out.');
            router.back();
          }}
        />
      </SettingsPage>
    </KeyboardAvoidingView>
  );
}
