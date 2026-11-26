import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Linking from 'expo-linking';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, View } from 'react-native';
import {
  friendInviteIdFromScan,
  friendInviteLink,
} from '../../../../frontend/src/friendInviteLink';
import { apiOrigin } from '../../data/api';
import { useUser } from '../../session/SessionProvider';
import { Button } from '../../ui/components';
import { Segmented } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { socialIcons } from './icons';
import { QrCode } from './QrCode';
import { socialApi } from './socialApi';
import { useSharingChoices } from './socialQueries';

type Mode = 'code' | 'scan';

/** This server's address, which every friend link starts with, as on the web. */
function serverOrigin() {
  return apiOrigin ? new URL(apiOrigin).origin : '';
}

/**
 * Your friend QR code, to show or share, and a camera to scan a friend's. The code holds the
 * same `https://<server>/#friend=<account id>` link as the web's, so codes work in both.
 */
export function FriendQrSheet({
  visible,
  onClose,
  onChooseSharing,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onChooseSharing: () => void;
  /** A friend's code was scanned: open their invite. */
  onScanned: (accountId: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  const user = useUser();
  const [mode, setMode] = useState<Mode>('code');
  const choices = useSharingChoices();
  // Older servers have no registration code to add to the link.
  const invite = useQuery({
    queryKey: ['social', 'friend-invite'],
    queryFn: () => socialApi.friendInvite().catch(() => ({ invite_code: null })),
    enabled: visible,
  });
  const url = friendInviteLink(user.id, serverOrigin(), invite.data?.invite_code);
  // Offline, the link still works once the other person is connected.
  const shareable = choices.isPending
    ? 'checking'
    : choices.data?.visibility === 'private'
      ? 'private'
      : 'shared';

  async function share() {
    const title = `Add ${user.display_name} on Relay`;
    await Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title }).catch(
      () => undefined,
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="QR code">
      <Segmented
        accessibilityLabel="QR code view"
        values={['My code', 'Scan']}
        selectedIndex={mode === 'code' ? 0 : 1}
        onChange={(index) => setMode(index === 0 ? 'code' : 'scan')}
      />
      {mode === 'scan' ? (
        visible && (
          <QrScanner
            userId={user.id}
            onScanned={(id) => {
              onClose();
              onScanned(id);
            }}
          />
        )
      ) : shareable === 'private' ? (
        <View style={styles.private}>
          <Icon name={socialIcons.eye} size={28} color={colors.muted} />
          <Text
            accessibilityRole="header"
            style={[type.headline, { color: colors.text, textAlign: 'center' }]}
          >
            Share your profile to use your QR code
          </Text>
          <Button
            label="Choose who can see your profile"
            onPress={() => {
              onClose();
              onChooseSharing();
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: '#fff',
                borderColor: colors.line,
                borderRadius: radius.card,
              },
            ]}
          >
            <View style={styles.code}>
              {shareable === 'shared' ? (
                <QrCode
                  value={url}
                  label={`QR code to add ${user.display_name} as a friend`}
                  size={232}
                />
              ) : (
                <ActivityIndicator color="#1f5fb0" />
              )}
            </View>
            <View style={styles.person}>
              <Avatar person={user} size={40} />
              <View style={{ flexShrink: 1 }}>
                <Text style={[type.headline, { color: '#14181c' }]} numberOfLines={1}>
                  {user.display_name}
                </Text>
                <Text style={[type.footnote, { color: '#48515a' }]} numberOfLines={1}>
                  {user.username}
                </Text>
              </View>
            </View>
          </View>
          <Button
            label="Share link"
            icon={socialIcons.share}
            variant="secondary"
            block
            disabled={shareable !== 'shared'}
            onPress={() => void share()}
          />
        </View>
      )}
    </Sheet>
  );
}

type Notice = 'not-friend-code' | 'own-code' | null;

/** Scans a friend's code with the camera without leaving Relay. */
function QrScanner({ userId, onScanned }: { userId: string; onScanned: (id: string) => void }) {
  const { colors, type, radius } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [notice, setNotice] = useState<Notice>(null);
  const done = useRef(false);
  const lastNotice = useRef('');

  function scanned({ data }: BarcodeScanningResult) {
    if (done.current) return;
    const id = friendInviteIdFromScan(data);
    const next: Notice = !id ? 'not-friend-code' : id === userId ? 'own-code' : null;
    if (id && !next) {
      done.current = true;
      haptics.success();
      onScanned(id);
      return;
    }
    // The camera reports the same code many times a second; say so once.
    if (lastNotice.current === data) return;
    lastNotice.current = data;
    haptics.warning();
    setNotice(next);
  }

  const frame = [styles.frame, { backgroundColor: colors.surface2, borderRadius: radius.card }];
  if (!permission) return <View style={frame} />;
  if (!permission.granted) {
    return (
      <View style={[frame, styles.problem]}>
        <Icon name={socialIcons.camera} size={28} color={colors.muted} />
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.text }]}>
          Allow camera access to scan a code.
        </Text>
        {permission.canAskAgain ? (
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <Button
            label="Open Settings"
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        )}
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={[frame, { overflow: 'hidden' }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned}
          accessibilityLabel="Camera view for scanning a QR code"
        />
        <View pointerEvents="none" style={styles.guide} />
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[type.callout, { color: colors.secondary, textAlign: 'center', minHeight: 20 }]}
      >
        {notice === 'not-friend-code'
          ? 'That isn’t a Relay friend code.'
          : notice === 'own-code'
            ? 'That’s your own code.'
            : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  private: { alignItems: 'center', gap: 14, paddingVertical: 24 },
  card: { padding: 20, gap: 16, alignItems: 'center', borderWidth: 1 },
  code: { width: 232, height: 232, alignItems: 'center', justifyContent: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: '100%' },
  frame: { aspectRatio: 1, width: '100%' },
  problem: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  guide: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
  },
});
