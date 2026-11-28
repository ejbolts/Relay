import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, View } from 'react-native';
import {
  inviteCountdownLabel,
  inviteSecondsLeft,
  memberName,
  partners,
  TRAIN_INVITE_SECONDS,
  TRAIN_TOGETHER_LABEL,
  trainInviteLink,
} from '../../../../frontend/src/trainTogether';
import { apiOrigin } from '../../data/api';
import { useUser } from '../../session/SessionProvider';
import { Button } from '../../ui/components';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { Avatar } from '../social/Avatar';
import { QrScanner } from '../social/FriendQrSheet';
import { socialRoutes } from '../social/navigation';
import { QrCode } from '../social/QrCode';
import { trainIcons, usePartnerColours } from './partnerColours';
import { PartnerAvatar } from './PartnerAvatar';
import { trainActions, useTrainState, type TrainJoinFailure } from './trainStore';
import { useLater } from './useLater';

/** This server's address, which every train-together link starts with, as on the web. */
function serverOrigin() {
  return apiOrigin ? new URL(apiOrigin).origin : '';
}

/**
 * Train together: your code to show or share (a QR of a five-minute link), and a camera to scan
 * a friend's. While in a session it lists who you're with and offers Leave session.
 */
export function TrainSheet() {
  const sheet = useTrainState((state) => state.sheet);
  const actions = trainActions();
  return (
    <Sheet visible={sheet.open} onClose={actions.closeSheet} title={TRAIN_TOGETHER_LABEL}>
      <Segmented
        accessibilityLabel="Train together view"
        values={['My code', 'Scan']}
        selectedIndex={sheet.tab === 'code' ? 0 : 1}
        onChange={(index) => actions.openSheet(index === 0 ? 'code' : 'scan')}
      />
      {sheet.open && (sheet.tab === 'code' ? <MyCode /> : <Scan />)}
    </Sheet>
  );
}

function MyCode() {
  const { colors, type, radius } = useTheme();
  const user = useUser();
  const now = useNow(1000);
  const invite = useTrainState((state) => state.invite);
  const inviteError = useTrainState((state) => state.inviteError);
  const session = useTrainState((state) => state.read?.session ?? null);
  const tones = usePartnerColours();
  const seconds = // A phone clock a little behind the server's never shows more than five minutes.
    invite ? Math.min(TRAIN_INVITE_SECONDS, inviteSecondsLeft(invite.expires_at, now)) : 0;
  const live = !!invite && seconds > 0;
  // A new code when there is none, or this one expired or was used, while the sheet is open.
  const asked = useRef<string | null>(null);
  const want = live ? null : (invite?.token ?? 'none');
  useEffect(() => {
    if (want === null) {
      asked.current = null;
      return;
    }
    if (inviteError || asked.current === want) return;
    asked.current = want;
    void trainActions().newInvite();
  }, [want, inviteError]);
  const url = invite ? trainInviteLink(invite.token, serverOrigin()) : '';
  const list = partners(session);

  async function share() {
    const title = `Train together on Relay`;
    await Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title }).catch(
      () => undefined,
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {inviteError ? (
        <View style={styles.problem}>
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.text }]}>
            {inviteError}
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              asked.current = null;
              void trainActions().newInvite();
            }}
          />
        </View>
      ) : (
        <>
          <View style={[styles.card, { borderColor: colors.line, borderRadius: radius.card }]}>
            <View style={styles.code}>
              {live ? (
                <QrCode value={url} label="QR code to train together" size={212} />
              ) : (
                <ActivityIndicator color="#1f5fb0" />
              )}
            </View>
            <View style={styles.track}>
              <View
                testID="invite-countdown-bar"
                style={[
                  styles.bar,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.min(100, (seconds / TRAIN_INVITE_SECONDS) * 100)}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.person}>
              <Avatar person={user} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.headline, { color: '#14181c' }]} numberOfLines={1}>
                  {user.display_name}
                </Text>
                <Text style={[type.footnote, { color: '#48515a' }]} numberOfLines={1}>
                  @{user.username}
                </Text>
              </View>
              <View
                accessibilityLabel={`Code expires in ${inviteCountdownLabel(seconds)}`}
                style={[styles.countdown, { backgroundColor: `${colors.accent}26` }]}
              >
                <Icon name="timer" size={14} color={colors.accent} />
                <Text
                  style={[
                    type.footnote,
                    type.number,
                    styles.countdownText,
                    { color: colors.accent },
                  ]}
                >
                  {inviteCountdownLabel(seconds)}
                </Text>
              </View>
            </View>
          </View>
          <Button
            label="Share link"
            icon={trainIcons.share}
            variant="secondary"
            block
            size="large"
            disabled={!live}
            onPress={() => void share()}
          />
        </>
      )}
      {list.length > 0 && (
        <View style={{ gap: 10 }}>
          {list.map((member) => (
            <View key={member.user_id} style={styles.partner}>
              <PartnerAvatar
                member={member}
                size={36}
                ring={tones[member.user_id]?.accent}
                live={!!member.workout}
              />
              <Text style={[type.callout, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {memberName(member)}
              </Text>
            </View>
          ))}
          <Button
            label="Leave session"
            variant="danger-soft"
            block
            size="large"
            onPress={() => {
              trainActions().leave();
              trainActions().closeSheet();
            }}
          />
        </View>
      )}
    </View>
  );
}

function Scan() {
  const later = useLater();
  const { colors, type } = useTheme();
  const user = useUser();
  const router = useRouter();
  const [failure, setFailure] = useState<TrainJoinFailure | null>(null);
  // The scanner ignores a code it has handed over; Scan again starts it afresh.
  const [attempt, setAttempt] = useState(0);
  return (
    <QrScanner
      key={attempt}
      userId={user.id}
      onScanned={(id) => {
        // A friend's code: their invite, as Social's scanner opens it, below the logger.
        trainActions().closeSheet();
        router.back();
        later(() => router.navigate(socialRoutes.profile(id, true)), 350);
      }}
      onTrainInvite={async (token) => {
        setFailure(null);
        setFailure(await trainActions().join(token, 'scan'));
      }}
      footer={
        failure && (
          <View style={styles.failure}>
            <Text
              accessibilityRole="alert"
              style={[type.callout, { color: colors.danger, textAlign: 'center' }]}
            >
              {failure.message}
            </Text>
            <View style={styles.failureActions}>
              {failure.member && (
                <Button
                  label="Add friend"
                  variant="secondary"
                  onPress={() => trainActions().addFriend(failure.member!)}
                />
              )}
              <Button
                label="Scan again"
                variant="secondary"
                onPress={() => {
                  setFailure(null);
                  setAttempt((value) => value + 1);
                }}
              />
            </View>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    gap: 14,
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  code: { width: 212, height: 212, alignItems: 'center', justifyContent: 'center' },
  track: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e4e8eb',
    overflow: 'hidden',
  },
  bar: { height: 4, borderRadius: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    minHeight: 28,
    borderRadius: 999,
  },
  countdownText: { fontWeight: '700' },
  problem: { alignItems: 'center', gap: 14, paddingVertical: 24 },
  partner: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  failure: { alignItems: 'center', gap: 10 },
  failureActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
});
