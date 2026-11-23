import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  youtubeAvailable,
  youtubeConnectLabel,
  youtubePrivacyCopy,
  youtubeStatusLabel,
} from '../../../../frontend/src/videoSessions';
import type { YouTubeConnection } from '../../../../frontend/src/types';
import { serverOrigin } from '../../data/api';
import { Button, Card, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { videoApi, videoKeys, useYouTubeConnection } from './videoData';
import { videoIcons } from './icons';

/**
 * The web's YouTube channel panel. Connecting happens on the web: Google returns to the server's
 * web page in the browser session that started it, which an app session can't continue, so the
 * button hands off to the web's Videos page and the card checks again when the app returns.
 */
export function YouTubeCard({ disabled = false }: { disabled?: boolean }) {
  const client = useQueryClient();
  const connection = useYouTubeConnection();
  const { colors, type, radius } = useTheme();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = connection.data ?? null;

  useEffect(() => {
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.invalidateQueries({ queryKey: videoKeys.youtube });
    });
    return () => app.remove();
  }, [client]);

  function connectOnWeb() {
    setError(null);
    try {
      void Linking.openURL(`${serverOrigin()}/#videos`);
    } catch (reason) {
      setError(errorMessage(reason));
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
    try {
      const next = await videoApi.disconnect();
      client.setQueryData<YouTubeConnection>(videoKeys.youtube, next);
      showToast(next.message);
    } catch (reason) {
      setError(errorMessage(reason));
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
        {available && (
          <Button
            label={`${youtubeConnectLabel(data)} on the web`}
            icon={videoIcons.web}
            variant={connected ? 'secondary' : 'primary'}
            disabled={disabled || working}
            onPress={connectOnWeb}
          />
        )}
        {data?.channel_id && (
          <Button
            label={working ? 'Disconnecting…' : 'Disconnect'}
            variant="secondary"
            disabled={disabled || working || !data.can_disconnect}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 32, height: 24, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
