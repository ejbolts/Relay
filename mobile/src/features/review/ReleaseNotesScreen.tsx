import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { announcedRelease } from '../../../../frontend/src/releaseMetadata';
import { useUser } from '../../session/SessionProvider';
import { useTheme } from '../../ui/theme';
import { useServerRelease } from '../settings/settingsData';
import { WhatsNewScreen } from '../settings/WhatsNewScreen';
import { dismissRelease } from './useReleaseNotice';

/**
 * The release announcement: Settings' What's new (this release, then earlier versions), opened
 * by itself once per release or from the bell. Closing it, with Got it or Back, dismisses it for
 * the account, as the web's Got it does.
 */
export function ReleaseNotesScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const user = useUser();
  const server = useServerRelease().data;
  const version = server ? announcedRelease(server).version : null;
  useEffect(
    () => (version ? () => dismissRelease(client, user.id, version) : undefined),
    [client, user.id, version],
  );
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
              <Text style={[type.body, { color: colors.accentText, fontWeight: '600' }]}>
                Got it
              </Text>
            </Pressable>
          ),
        }}
      />
      <WhatsNewScreen />
    </>
  );
}
