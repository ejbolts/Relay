import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatMemberSince } from '../../../../frontend/src/profileDisplay';
import {
  sharedFiltersDay,
  sharedFiltersForExercise,
  sharedFiltersOnDay,
} from '../../../../frontend/src/sharedHistoryFilters';
import {
  blockConfirmation,
  friendPill,
  friendsOnlyNotice,
  inviteMessage,
  inviteSendsRequest,
  profileStats,
  sharedGoalsSummary,
  SHARING_LOCKED,
  sinceMonthLabel,
  unavailableProfile,
  VISIBILITY_LABELS,
  type InviteResult,
} from '../../../../frontend/src/sharedProfileDisplay';
import type {
  FriendStatus,
  SharedProfile,
  SharedWorkoutFilters,
  User,
} from '../../../../frontend/src/types';
import { rememberAuthorisedImage } from '../../data/authorisedImage';
import { useWeightUnit } from '../../data/queries';
import { useOptionalSession } from '../../session/SessionProvider';
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  errorMessage,
  IconButton,
  Loading,
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { pendingActions, usePendingActions } from '../../ui/pendingActions';
import { isToastAccountCurrent, showToast, toastAccount } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { useReduceMotion } from '../settings/devicePreferences';
import { pushedScreenOptions } from '../../ui/navigation';
import { Avatar } from './Avatar';
import { PhotoViewer } from './PhotoViewer';
import { FriendQrSheet } from './FriendQrSheet';
import { FriendSplits } from './FriendSplits';
import { socialIcons } from './icons';
import type { MachineFilter } from '../training/MachinePhotos';
import { useLinkedScroll, type LinkedRow } from './linkedScroll';
import { useSocialNavigation, type LinkedWorkout } from './navigation';
import { ProfileHistory, useProfileHistoryState } from './ProfileHistory';
import { SharingLocked, SmallButton } from './parts';
import { ProfileAccountId } from './profile/ProfileAccountId';
import { ProfileEditor } from './profile/ProfileEditor';
import { ProfileStats } from './profile/ProfileStats';
import { notFound, sharingRequired, socialApi } from './socialApi';
import { refreshSocial, socialKeys, useMemberRefusal, useSharedProfile } from './socialQueries';

/**
 * A member's profile, or your own: who they are and how you're connected, then what they share
 * (their numbers, body weight, goals and workouts). Opened from an invite, it sends the friend
 * request first, with Undo, as the web's invite flow does. Opened at a linked workout, it shows
 * that workout in the history, scrolled into view.
 */
export function ProfileScreen({
  profileId,
  invite = false,
  targetWorkout,
  targetMachine,
}: {
  profileId: string;
  invite?: boolean;
  targetWorkout?: LinkedWorkout;
  /** Shared machine photo id to filter the history by on arrival. */
  targetMachine?: string;
}) {
  const { colors, space } = useTheme();
  const {
    scrollRef,
    targetRef,
    reveal,
    scrollToSection,
    sectionReady,
    onScrollBeginDrag,
    onContentSizeChange,
    onLayout,
  } = useLinkedScroll();
  const client = useQueryClient();
  const query = useSharedProfile(profileId);
  // A refusal of this member's data (a 403 or 404 on any of it) locks the profile until it is
  // confirmed viewable again, even if the cached profile or a later network error says otherwise.
  const refusal = useMemberRefusal(profileId);
  const error = refusal ?? query.error;
  const [blocked, setBlocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const profile = refusal && query.data ? { ...query.data, can_view: false } : query.data;
  const title = profile?.is_you ? 'Profile' : (profile?.display_name ?? '');
  useInvite(profileId, invite, profile);

  async function refresh() {
    setRefreshing(true);
    try {
      await refreshSocial(client);
    } finally {
      setRefreshing(false);
    }
  }

  let body;
  if (blocked && profile)
    body = <BlockedPanel profile={profile} onUnblocked={() => setBlocked(false)} />;
  else if (sharingRequired(error)) body = <LockedPanel invite={invite} />;
  else if (notFound(error)) body = <Unavailable state="missing" name="" invite={invite} />;
  else if (!profile)
    body = query.error ? (
      <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <Loading label="Loading profile" />
    );
  else
    body = (
      <ProfileBody
        profile={profile}
        onBlocked={() => setBlocked(true)}
        targetWorkout={targetWorkout}
        targetMachine={targetMachine}
        linkedRef={targetRef}
        onLinkedLayout={reveal}
        scrollToSection={scrollToSection}
        onHistorySettled={sectionReady}
      />
    );

  return (
    <>
      <Stack.Screen options={pushedScreenOptions(colors, title)} />
      <ScrollView
        ref={scrollRef}
        onScrollBeginDrag={onScrollBeginDrag}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        style={{ flex: 1, backgroundColor: colors.page }}
        contentContainerStyle={{
          padding: space.gutter,
          gap: space.stack,
          paddingBottom: space.xxl * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.muted}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface2}
          />
        }
      >
        {body}
      </ScrollView>
    </>
  );
}

/** Scanning or opening an invite sends the request once, then says so with Undo. */
function useInvite(profileId: string, invite: boolean, profile: SharedProfile | undefined) {
  const client = useQueryClient();
  const router = useRouter();
  const sent = useRef(false);
  useEffect(() => {
    if (!invite || !profile || sent.current) return;
    sent.current = true;
    // The invite is used up: going back and forth must not send it again.
    router.setParams({ invite: undefined });
    if (!inviteSendsRequest(profile)) return;
    // The account sending the request: a result that arrives after a switch to another account
    // says nothing there and offers no Undo.
    const account = toastAccount();
    const notify = (result: Omit<InviteResult, 'serial'>) => {
      const message = inviteMessage({ ...result, serial: Date.now() });
      if (result.kind !== 'sent') return showToast(message, undefined, { account });
      showToast(
        message,
        {
          label: 'Undo',
          run: () =>
            void socialApi
              .removeFriend(profileId)
              .catch(() =>
                showToast(inviteMessage({ ...result, kind: 'undo-failed', serial: 0 }), undefined, {
                  account,
                }),
              )
              .finally(() => {
                if (isToastAccountCurrent(account)) void refreshSocial(client);
              }),
        },
        { account },
      );
    };
    void socialApi
      .addFriend(profileId)
      .then(async (answer) => {
        if (!isToastAccountCurrent(account)) return;
        await refreshSocial(client);
        const updated = client.getQueryData<SharedProfile>(['social', 'profile', profileId]);
        notify({
          kind: answer.status === 'friends' ? 'friends' : 'sent',
          name: updated?.display_name ?? profile.display_name,
        });
      })
      .catch(() => notify({ kind: 'failed', name: profile.display_name }));
  }, [client, invite, profile, profileId, router]);
}

function ProfileBody({
  profile,
  onBlocked,
  targetWorkout,
  targetMachine,
  linkedRef,
  onLinkedLayout,
  scrollToSection,
  onHistorySettled,
}: {
  profile: SharedProfile;
  onBlocked: () => void;
  targetWorkout?: LinkedWorkout;
  targetMachine?: string;
  linkedRef: LinkedRow['targetRef'];
  onLinkedLayout: () => void;
  scrollToSection: ReturnType<typeof useLinkedScroll>['scrollToSection'];
  onHistorySettled: () => void;
}) {
  const history = useProfileHistoryState(targetWorkout, targetMachine);
  const historyRef = useRef<ComponentRef<typeof View>>(null);
  // Whether the history has settled since it was last shown, for a jump asked for as it appears.
  const historySettledRef = useRef(false);
  // Opened from a shared workout's machine photo: jump to the filtered history once, when it is
  // first shown. A cached friends-only profile can grant access only after a refresh.
  const machineJumpRef = useRef(Boolean(targetMachine && !targetWorkout));
  const reduceMotion = useReduceMotion();
  const handleHistorySettled = useCallback(() => {
    historySettledRef.current = true;
    onHistorySettled();
  }, [onHistorySettled]);
  const historyShown = profile.can_view;
  useEffect(() => {
    if (!historyShown) {
      historySettledRef.current = false;
      return;
    }
    if (!machineJumpRef.current || !historyRef.current) return;
    machineJumpRef.current = false;
    // The history's own settle effect has run by now when its results were already loaded;
    // otherwise `onHistorySettled` finishes the jump once they load.
    scrollToSection(historyRef.current, false, historySettledRef.current);
  }, [historyShown, scrollToSection]);
  // As on the web, a calendar day or a lift filters the history below and brings it into view.
  const showMatching = (filters: SharedWorkoutFilters) => {
    // Nothing to load when it already shows them; otherwise the jump finishes once they load.
    const changed = history.showMatching(filters);
    scrollToSection(historyRef.current, !reduceMotion, !changed);
  };
  // A machine photo adds its machine to the filters. The workout it was in closes and the list
  // shrinks, so the history is brought back into view rather than left scrolled past its end.
  const showMachine = ({ photo }: MachineFilter) => {
    const changed = history.showMachine(photo.id);
    scrollToSection(historyRef.current, !reduceMotion, !changed);
  };
  return (
    <>
      <ProfileHeader profile={profile} onBlocked={onBlocked} />
      {!profile.can_view ? (
        <FriendsOnly profile={profile} />
      ) : (
        <>
          {!profile.is_you && <FriendSplits key={profile.id} ownerId={profile.id} />}
          <ProfileStats
            profile={profile}
            selectedDate={sharedFiltersDay(history.filters)}
            onOpenDay={(date) => showMatching(sharedFiltersOnDay(date))}
            onOpenLift={(exerciseId) => showMatching(sharedFiltersForExercise(exerciseId))}
          />
          {profile.goals && <GoalsCard profile={profile} />}
          <View ref={historyRef} collapsable={false}>
            <ProfileHistory
              profile={profile}
              state={history}
              targetWorkout={targetWorkout}
              linkedRef={linkedRef}
              onLinkedLayout={onLinkedLayout}
              onSettled={handleHistorySettled}
              onFilterMachine={showMachine}
            />
          </View>
        </>
      )}
    </>
  );
}

function ProfileHeader({ profile, onBlocked }: { profile: SharedProfile; onBlocked: () => void }) {
  const { colors, type, radius } = useTheme();
  const client = useQueryClient();
  const session = useOptionalSession();
  const nav = useSocialNavigation();
  const [qrOpen, setQrOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  // The editor belongs to the account that opened it: another account signing in closes it and
  // drops its draft, rather than showing it to (or saving it as) the new account.
  const signedInId = session?.status.kind === 'signed-in' ? session.status.user.id : null;
  const [editingFor, setEditingFor] = useState<string | null>(null);
  if (editingFor !== null && editingFor !== signedInId) setEditingFor(null);
  const editing = editingFor !== null;
  const memberSince = formatMemberSince(profile.member_since);
  const photo = profile.profile_photo_url;

  async function handleSaved(saved: User, options?: { refresh?: boolean; photoUri?: string }) {
    session?.updateUser(saved);
    // Cancel any in-flight profile fetch started before the save so a stale reply cannot revert
    // the header to the old name or photo right after edit mode closes.
    await client.cancelQueries({ queryKey: socialKeys.profile(profile.id), exact: true });
    let nextPhotoUrl: string | null = saved.profile_photo_url ?? null;
    client.setQueryData<SharedProfile>(socialKeys.profile(profile.id), (cached) => {
      if (!cached) return cached;
      // Keep the shared profile photo URL when the photo version did not change, so renaming
      // does not switch URLs and flash initials while re-fetching the same image.
      if (saved.profile_photo_url && cached.profile_photo_url) {
        const cachedVersion = cached.profile_photo_url.split('?')[1];
        const savedVersion = saved.profile_photo_url.split('?')[1];
        if (cachedVersion && cachedVersion === savedVersion) {
          nextPhotoUrl = cached.profile_photo_url;
        }
      }
      return {
        ...cached,
        display_name: saved.display_name,
        profile_photo_url: nextPhotoUrl,
        sex: saved.sex ?? cached.sex,
      };
    });
    if (options?.photoUri && nextPhotoUrl) {
      rememberAuthorisedImage(nextPhotoUrl, options.photoUri);
      const query = nextPhotoUrl.split('?')[1];
      if (query) {
        rememberAuthorisedImage(
          `/api/sharing/profiles/${encodeURIComponent(profile.id)}/photo?${query}`,
          options.photoUri,
        );
      }
    }
    if (options?.refresh !== false) void refreshSocial(client);
  }

  return (
    <Card>
      {profile.is_you && editing ? (
        <ProfileEditor onSaved={handleSaved} onClose={() => setEditingFor(null)} />
      ) : (
        <>
          <View style={styles.headerRow}>
            {photo ? (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel={`View ${profile.display_name}'s profile photo`}
                onPress={() => setViewing(true)}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Avatar person={profile} size={72} />
              </Pressable>
            ) : (
              <Avatar person={profile} size={72} />
            )}
            {viewing && photo && (
              <PhotoViewer
                photos={[
                  { id: photo, url: photo, label: `${profile.display_name}'s profile photo` },
                ]}
                title={() => 'Profile photo'}
                onClose={() => setViewing(false)}
              />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.nameRow}>
                <Text
                  accessibilityRole="header"
                  style={[type.title, { color: colors.text, flexShrink: 1 }]}
                  numberOfLines={2}
                >
                  {profile.display_name}
                </Text>
                {profile.is_you && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: colors.accentSoft, borderRadius: radius.pill },
                    ]}
                  >
                    <Text style={[type.caption, { color: colors.accentText, fontWeight: '700' }]}>
                      You
                    </Text>
                  </View>
                )}
              </View>
              {!!memberSince && (
                <Text style={[type.footnote, { color: colors.secondary }]}>
                  Joined {memberSince}
                </Text>
              )}
            </View>
            {profile.is_you && (
              <View style={styles.ownActions}>
                <IconButton
                  icon={socialIcons.qr}
                  accessibilityLabel="QR code"
                  onPress={() => setQrOpen(true)}
                  style={{ borderColor: colors.lineStrong }}
                />
                <IconButton
                  icon={socialIcons.edit}
                  accessibilityLabel="Edit profile"
                  onPress={() => setEditingFor(signedInId)}
                  style={{ borderColor: colors.lineStrong }}
                />
              </View>
            )}
          </View>
          {profile.is_you ? (
            <View style={styles.controls}>
              <SmallButton
                label={`Sharing: ${VISIBILITY_LABELS[profile.visibility]}`}
                icon={socialIcons.people}
                onPress={nav.openSharing}
              />
            </View>
          ) : (
            <FriendControl profile={profile} onBlocked={onBlocked} />
          )}
          <ProfileAccountId accountId={profile.id} />
        </>
      )}
      {profile.can_view && <StatRow boxed stats={profileStats(profile)} />}
      {profile.is_you && (
        <FriendQrSheet
          visible={qrOpen}
          onClose={() => setQrOpen(false)}
          onChooseSharing={nav.openSharing}
          onScanned={nav.openInvite}
        />
      )}
    </Card>
  );
}

function StatRow({
  stats,
  boxed = false,
}: {
  stats: { label: string; value: string }[];
  boxed?: boolean;
}) {
  const { colors, radius, type } = useTheme();
  return (
    <View style={styles.stats}>
      {stats.map((stat) => (
        <View
          key={stat.label}
          style={[
            styles.statTile,
            boxed && {
              backgroundColor: colors.surface2,
              borderRadius: radius.md,
              padding: 12,
            },
          ]}
        >
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {stat.label}
          </Text>
          <Text
            style={[styles.statValue, type.number, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Add friend, Accept or Decline, or a Requested or Friends pill. Its menu cancels a request,
 * removes a friend (with Undo before it is sent) or blocks the member.
 */
function FriendControl({ profile, onBlocked }: { profile: SharedProfile; onBlocked: () => void }) {
  const { colors, radius, type } = useTheme();
  const client = useQueryClient();
  // Shared across mounts: reopening the profile while the Undo still shows keeps it removed.
  const removing = usePendingActions('friend').includes(profile.id);
  const change = useMutation({
    mutationFn: async (action: 'add' | 'accept' | 'remove'): Promise<FriendStatus> => {
      if (action === 'add') return (await socialApi.addFriend(profile.id)).status;
      if (action === 'accept') return (await socialApi.acceptFriend(profile.id)).status;
      await socialApi.removeFriend(profile.id);
      return 'none';
    },
    onSettled: () => refreshSocial(client),
  });
  const block = useMutation({
    mutationFn: () => socialApi.block(profile.id),
    onSuccess: () => {
      onBlocked();
      void refreshSocial(client);
    },
  });

  function remove() {
    const id = profile.id;
    const account = toastAccount();
    // Already waiting on an Undo (from this screen or an earlier visit): don't remove twice.
    const token = pendingActions.add('friend', id, account);
    if (!token) return;
    const done = () => pendingActions.remove(token);
    showToast(
      `Removed ${profile.display_name}`,
      {
        label: 'Undo',
        run: done,
        // Sent once the Undo is gone (timed out, dismissed, replaced or the app left), as on the
        // web, so the friend is never removed while Undo is still on screen.
        onDismiss: () =>
          void socialApi.removeFriend(id).then(
            () => {
              // A session that has ended keeps nothing of this; its cache is already gone.
              if (isToastAccountCurrent(account)) {
                // Removed for certain: the cached profile says so before the pending mark goes,
                // so a refresh that fails can't bring back Remove friend.
                client.setQueryData<SharedProfile>(socialKeys.profile(id), (cached) =>
                  cached ? { ...cached, friend_status: 'none' } : cached,
                );
              }
              done();
              if (isToastAccountCurrent(account)) void refreshSocial(client);
            },
            () => {
              done();
              showToast('Could not remove this friend. You are still friends.', undefined, {
                account,
              });
            },
          ),
      },
      { account },
    );
  }

  function confirmBlock() {
    const { title, body } = blockConfirmation(profile.display_name);
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => block.mutate() },
    ]);
  }

  const status: FriendStatus = removing ? 'none' : profile.friend_status;
  const pill = friendPill(status);
  const busy = change.isPending || block.isPending;
  const items: MenuItem[] = [
    ...(status === 'friends'
      ? [{ label: 'Remove friend', destructive: true, onPress: remove }]
      : []),
    ...(status === 'outgoing'
      ? [{ label: 'Cancel request', onPress: () => change.mutate('remove') }]
      : []),
    { label: 'Block', destructive: true, onPress: confirmBlock },
  ];
  const since = status === 'friends' ? sinceMonthLabel(profile.friends_since) : null;
  const pillWidth = pill === 'Requested' ? 132 : 114;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.controls}>
        {status === 'none' && (
          <SmallButton
            label="Add friend"
            variant="primary"
            icon={socialIcons.personAdd}
            busy={change.isPending}
            onPress={() => change.mutate('add')}
          />
        )}
        {status === 'incoming' && (
          <>
            <SmallButton
              label="Accept"
              variant="primary"
              busy={change.isPending && change.variables === 'accept'}
              disabled={busy}
              onPress={() => change.mutate('accept')}
            />
            <SmallButton
              label="Decline"
              busy={change.isPending && change.variables === 'remove'}
              disabled={busy}
              onPress={() => change.mutate('remove')}
            />
          </>
        )}
        {pill ? (
          <MenuButton
            accessibilityLabel={`${pill}, options for ${profile.display_name}`}
            title={since ?? undefined}
            items={items}
            trigger={{ text: `${pill} ▾`, color: colors.text }}
            width={pillWidth}
            height={44}
            fill={colors.surface2}
            cornerRadius={radius.md}
          >
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.lineStrong,
                  borderRadius: radius.md,
                },
              ]}
            >
              {status === 'friends' && <Icon name="check" size={14} color={colors.good} />}
              <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>{pill}</Text>
              <Icon name="chevronDown" size={13} color={colors.secondary} />
            </View>
          </MenuButton>
        ) : (
          <MenuButton
            accessibilityLabel={`More options for ${profile.display_name}`}
            items={items}
            trigger={{ sf: 'ellipsis', color: colors.text, size: 16 }}
            width={44}
            height={44}
            fill={colors.surface2}
            cornerRadius={radius.md}
          >
            <View
              style={[
                styles.more,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.lineStrong,
                  borderRadius: radius.md,
                },
              ]}
            >
              <Icon name="more" size={18} color={colors.text} />
            </View>
          </MenuButton>
        )}
      </View>
      {(change.error || block.error) && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(change.error ?? block.error)}
        </Text>
      )}
    </View>
  );
}

function FriendsOnly({ profile }: { profile: SharedProfile }) {
  const { colors, type } = useTheme();
  const notice = friendsOnlyNotice(profile);
  return (
    <Card>
      <View style={styles.headerRow}>
        <Icon name={socialIcons.lock} size={16} color={colors.accentText} />
        <Text style={[type.eyebrow, { color: colors.accentText }]}>FRIENDS ONLY</Text>
      </View>
      <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
        {notice.title}
      </Text>
      <Text style={[type.callout, { color: colors.secondary }]}>{notice.body}</Text>
    </Card>
  );
}

function LockedPanel({ invite }: { invite: boolean }) {
  const nav = useSocialNavigation();
  return (
    <SharingLocked
      onChooseSharing={nav.openSharing}
      title={invite ? SHARING_LOCKED.inviteTitle : undefined}
    />
  );
}

function Unavailable({
  state,
  name,
  invite,
  children,
}: {
  state: 'blocked' | 'missing';
  name: string;
  invite: boolean;
  children?: ReactNode;
}) {
  const { colors, type } = useTheme();
  const copy = unavailableProfile(state, name, invite);
  return (
    <Card>
      <Text style={[type.eyebrow, { color: colors.accentText }]}>{copy.kicker}</Text>
      <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
        {copy.title}
      </Text>
      <Text style={[type.callout, { color: colors.secondary }]}>{copy.body}</Text>
      {children}
    </Card>
  );
}

function BlockedPanel({
  profile,
  onUnblocked,
}: {
  profile: SharedProfile;
  onUnblocked: () => void;
}) {
  const client = useQueryClient();
  const unblock = useMutation({
    mutationFn: () => socialApi.unblock(profile.id),
    onSuccess: async () => {
      await refreshSocial(client);
      onUnblocked();
    },
  });
  const { colors, type } = useTheme();
  return (
    <Unavailable state="blocked" name={profile.display_name} invite={false}>
      {unblock.error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(unblock.error)}
        </Text>
      )}
      <Button
        label={unblock.isPending ? 'Unblocking…' : 'Unblock'}
        variant="secondary"
        disabled={unblock.isPending}
        onPress={() => unblock.mutate()}
      />
    </Unavailable>
  );
}

function GoalsCard({ profile }: { profile: SharedProfile }) {
  const { colors, type, radius } = useTheme();
  const unit = useWeightUnit();
  const summary = sharedGoalsSummary(
    profile.goals!,
    profile.body_weight?.[0]?.weight_kg ?? null,
    unit,
  );
  const goal = summary.bodyWeight;
  return (
    <Card>
      <CardHeader title="Goals" />
      <View style={{ gap: 4 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>Body weight</Text>
        <Text style={[type.callout, { color: colors.secondary }]}>
          {goal ? goal.text : 'No body-weight goal set.'}
        </Text>
        {goal?.status && (
          <Text style={[type.footnote, { color: colors.muted }]}>{goal.status}</Text>
        )}
        {goal && goal.progress !== null && (
          <>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Body-weight goal progress"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(Math.min(Math.max(goal.progress, 0), 1) * 100),
              }}
              style={[
                styles.track,
                { backgroundColor: colors.surface3, borderRadius: radius.pill },
              ]}
            >
              <View
                style={{
                  width: `${Math.round(Math.min(Math.max(goal.progress, 0), 1) * 100)}%`,
                  height: '100%',
                  backgroundColor: colors.accent,
                  borderRadius: radius.pill,
                }}
              />
            </View>
            <Text style={[type.footnote, { color: colors.muted }]}>{goal.progressText}</Text>
          </>
        )}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
          Weekly cardio zone goals
        </Text>
        {summary.cardio.map((item) => (
          <Text key={item.zone} style={[type.callout, { color: colors.secondary }]}>
            {item.text}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ownActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  more: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, gap: 4 },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  track: { height: 8, overflow: 'hidden', marginTop: 4 },
});
