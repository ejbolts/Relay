import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { authErrorText } from '../../../../frontend/src/authRules';
import { ApiError, apiSend } from '../../data/api';
import { newId } from '../../data/deviceStorage';
import { useSession } from '../../session/SessionProvider';
import { Button, Card, errorMessage } from '../../ui/components';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { SectionError, SettingsPage, SwitchRow } from './SettingsList';

export function FeedbackScreen() {
  const { colors, radius, type } = useTheme();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submission = useRef<string | null>(null);

  async function send() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    submission.current ??= newId();
    try {
      await apiSend('/api/feedback', 'POST', {
        message: trimmed,
        submission_id: submission.current,
      });
      setMessage('');
      submission.current = null;
      showToast('Thanks! Your feedback has been sent.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <SettingsPage>
      <Card>
        <Text style={[type.callout, { color: colors.text }]}>Your feedback or feature request</Text>
        <TextInput
          accessibilityLabel="Your feedback or feature request"
          value={message}
          onChangeText={(next) => {
            setMessage(next);
            setError(null);
            submission.current = null;
          }}
          editable={!sending}
          maxLength={2000}
          multiline
          textAlignVertical="top"
          style={[
            type.body,
            {
              minHeight: 112,
              padding: 12,
              color: colors.text,
              backgroundColor: colors.surface2,
              borderRadius: radius.md,
            },
          ]}
        />
        <Text style={[type.footnote, { color: colors.secondary }]}>
          Please leave out passwords and sensitive information.
        </Text>
        <SectionError message={error} />
        <Button
          label={sending ? 'Sending…' : 'Send feedback'}
          disabled={sending || !message.trim()}
          onPress={() => void send()}
        />
      </Card>
    </SettingsPage>
  );
}

export function DeleteAccountScreen() {
  const { colors, radius, type } = useTheme();
  const { accountDeleted } = useSession();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (deleting || !password || !confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await apiSend('/api/profile', 'DELETE', { password });
    } catch (reason) {
      setError(reason instanceof ApiError ? authErrorText(reason) : errorMessage(reason));
      setDeleting(false);
      return;
    }
    await accountDeleted();
  }

  return (
    <SettingsPage>
      <Card>
        <Text style={[type.body, { color: colors.text }]}>
          Permanently deletes your account and all of its workouts, measurements, photos and videos.
        </Text>
        <Text style={[type.callout, { color: colors.secondary }]}>Confirm with your password</Text>
        <TextInput
          accessibilityLabel="Confirm with your password"
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!deleting}
          style={[
            type.body,
            {
              minHeight: 48,
              paddingHorizontal: 12,
              color: colors.text,
              backgroundColor: colors.surface2,
              borderRadius: radius.md,
            },
          ]}
        />
        <View style={{ marginHorizontal: -12 }}>
          <SwitchRow
            label="I understand this is permanent"
            value={confirmed}
            onChange={setConfirmed}
            disabled={deleting}
          />
        </View>
        <SectionError message={error} />
        <Button
          label={deleting ? 'Deleting…' : 'Permanently delete account'}
          variant="danger"
          disabled={deleting || !password || !confirmed}
          onPress={() => void remove()}
        />
      </Card>
    </SettingsPage>
  );
}
