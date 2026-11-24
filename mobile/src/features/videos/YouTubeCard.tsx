import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  youtubeAvailable,
  youtubeCallbackResult,
  youtubeConnectLabel,
  youtubePrivacyCopy,
  youtubeStatusLabel,
} from '../../../../frontend/src/videoSessions';
import type { YouTubeConnection } from '../../../../frontend/src/types';
import { serverOrigin } from '../../data/api';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast, toastAccount } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { videoApi, videoKeys, useYouTubeConnection } from './videoData';
import { useAccountGuard } from '../admin/accountGuard';
import { connectYouTubeInApp } from './youtubeConnect';

/**
 * The web's YouTube channel panel. Connecting opens Google in a sign-in browser over the app,
 * which returns to the app with the same results the web shows after Google. A server from before
 * the app's sign-in can only connect on the web, so the card hands off there instead.
 * `canConnect` is false in Settings for an account that can't upload videos, as on the web.
 */
export function YouTubeCard({
  disabled = false,
  canConnect = true,
}: {
  disabled?: boolean;
  canConnect?: boolean;
}) {
  const client = useQueryClient();
  const connection = useYouTubeConnection();
  const { colors, type, radius } = useTheme();
  const user = useUser();
  const guard = useAccountGuard();
  const [working, setWorking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = connection.data ?? null;

  useEffect(() => {
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.invalidateQueries({ queryKey: videoKeys.youtube });
    });
    return () => app.remove();
  }, [client]);

  /**
   * The web connects whichever Relay account is signed in there, which may not be this one, so
   * the hand-off names the account to use before it opens the browser.
   */
  function confirmConnectOnWeb() {
    Alert.alert(
      `${youtubeConnectLabel(data)} on the web`,
      `Sign in to the web as @${user.username} to connect YouTube.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => void connectOnWeb() },
      ],
    );
  }

  async function connect() {
    setConnecting(true);
    setError(null);
    // The result belongs to the account that started; after a switch it is dropped.
    const check = guard();
    const account = toastAccount();
    try {
      const outcome = await connectYouTubeInApp();
      if (!check.sameSession()) return;
      void client.invalidateQueries({ queryKey: videoKeys.youtube });
      if (outcome.kind === 'web') {
        if (check.open()) confirmConnectOnWeb();
        return;
      }
      // Closing the sign-in browser leaves the connection as it was, like declining on Google.
      const result = youtubeCallbackResult(
        outcome.kind === 'result' ? outcome.result : 'cancelled',
      );
      if (result.confirmation) showToast(result.message, undefined, { account });
      // A failed return stays until the next attempt, as on the web.
      else if (check.open()) setError(result.message);
    } catch (reason) {
      if (check.open()) setError(errorMessage(reason));
    } finally {
      setConnecting(false);
    }
  }

  async function connectOnWeb() {
    setError(null);
    try {
      // Opening the browser can fail after the call returns, so wait for it.
      await Linking.openURL(`${serverOrigin()}/#videos`);
    } catch {
      setError('Could not open the browser. Open Relay on the web and connect YouTube there.');
    }
  }

  function confirmDisconnect() {
    Alert.alert('Disconnect YouTube?', 'Your videos stay on your channel when you disconnect.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect YouTube',
        style: 'destructive',
        onPress: () => void disconnect(),
      },
    ]);
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    // A reply that arrives after this account signed out mustn't recreate its connection for
    // the next account.
    const check = guard();
    try {
      const next = await videoApi.disconnect();
      if (!check.sameSession()) return;
      client.setQueryData<YouTubeConnection>(videoKeys.youtube, next);
      if (check.open()) showToast(next.message);
    } catch (reason) {
      if (check.open()) setError(errorMessage(reason));
    } finally {
      setWorking(false);
    }
  }

  const connected = data?.status === 'connected';
  const available = youtubeAvailable(data);
  const privacy = data ? youtubePrivacyCopy(data.privacy_status) : null;
  const failed = connection.error && !data ? errorMessage(connection.error) : null;
  return (
    <Card accessibilityLabel="Your YouTube channel">
      <View style={styles.heading}>
        <View style={[styles.logo, { backgroundColor: '#ff0033', borderRadius: radius.sm }]}>
          <Icon name="play" size={14} color="#ffffff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
            Your YouTube channel
          </Text>
          <Text style={[type.footnote, { color: connected ? colors.good : colors.muted }]}>
            {youtubeStatusLabel(data)}
          </Text>
        </View>
      </View>
      {data?.channel_title && (
        <Pressable
          accessibilityRole="link"
          disabled={!data.channel_url}
          onPress={() => data.channel_url && void Linking.openURL(data.channel_url)}
        >
          <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
            {data.channel_title}
          </Text>
        </Pressable>
      )}
      {data && <Text style={[type.callout, { color: colors.secondary }]}>{data.message}</Text>}
      {available && privacy && (
        <View style={{ gap: 2 }}>
          <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
            {privacy.title}
          </Text>
          <Text style={[type.footnote, { color: colors.secondary }]}>{privacy.detail}</Text>
        </View>
      )}
      {!!(error ?? failed) && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error ?? failed}
        </Text>
      )}
      <View style={styles.actions}>
        {available && canConnect && (
          <Button
            label={connecting ? 'Working…' : youtubeConnectLabel(data)}
            variant={connected ? 'secondary' : 'primary'}
            disabled={disabled || working || connecting}
            onPress={() => void connect()}
          />
        )}
        {data?.channel_id && (
          <Button
            label={working ? 'Disconnecting…' : 'Disconnect'}
            variant="secondary"
            disabled={disabled || working || connecting || !data.can_disconnect}
            onPress={confirmDisconnect}
          />
        )}
        {!data && failed && (
          <Button label="Try again" variant="secondary" onPress={() => void connection.refetch()} />
        )}
      </View>
      {data && !data.can_disconnect && (
        <Text style={[type.footnote, { color: colors.muted }]}>
          Disconnect is available after video processing finishes.
        </Text>
      )}
      {available && !canConnect && (
        <Text style={[type.footnote, { color: colors.muted }]}>
          Video uploads are disabled for this account. Ask the administrator to enable them.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 32, height: 24, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
