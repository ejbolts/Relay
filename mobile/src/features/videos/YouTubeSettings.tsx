import { useLocalSearchParams, useRouter } from 'expo-router';
import { canUploadVideos } from '../../../../frontend/src/videoAccess';
import { youtubeStatusLabel } from '../../../../frontend/src/videoSessions';
import { useUser } from '../../session/SessionProvider';
import { Row, Section, SettingsPage } from '../settings/SettingsList';
import { useYouTubeConnection } from './videoData';
import { YouTubeCard } from './YouTubeCard';
import { YOUTUBE_INTERRUPTED } from './youtubeConnect';

const youtubeIcon = { sf: 'play.rectangle', md: 'smart-display' } as const;

/** Settings' YouTube row: the web shows its channel panel in Settings too. */
export function YouTubeSettingsRow() {
  const router = useRouter();
  const connection = useYouTubeConnection();
  return (
    <Section title="YouTube">
      <Row
        label="Channel"
        icon={youtubeIcon}
        value={connection.data ? youtubeStatusLabel(connection.data) : null}
        onPress={() => router.push('/settings/youtube')}
      />
    </Section>
  );
}

/**
 * The channel panel, opened from Settings; connecting needs video access, as on the web. Relay
 * opens it with `?attempt=lost` when the sign-in browser returns after Relay was closed, because
 * the attempt's secret went with it.
 */
export function YouTubeSettingsScreen() {
  const user = useUser();
  const { attempt } = useLocalSearchParams<{ attempt?: string }>();
  return (
    <SettingsPage>
      <YouTubeCard
        canConnect={canUploadVideos(user)}
        notice={attempt === 'lost' ? YOUTUBE_INTERRUPTED : null}
      />
    </SettingsPage>
  );
}
