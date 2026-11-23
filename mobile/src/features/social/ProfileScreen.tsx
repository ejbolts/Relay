import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  averagePerWeek,
  consistencyWeeks,
  firstTrainingDay,
} from '../../../../frontend/src/consistencyWeeks';
import { formatMemberSince } from '../../../../frontend/src/profileDisplay';
import {
  blockConfirmation,
  friendPill,
  friendsOnlyNotice,
  inviteMessage,
  inviteSendsRequest,
  profileStats,
  SHARED_HISTORY_KIND,
  SHARED_HISTORY_TABS,
  sharedBodyWeight,
  sharedGoalsSummary,
  sharedHistoryEmpty,
  SHARING_LOCKED,
  signedWeightChange,
  sinceMonthLabel,
  unavailableProfile,
  VISIBILITY_LABELS,
  BODY_WEIGHT_CHART_DAYS,
  type InviteResult,
  type SharedHistoryTab,
} from '../../../../frontend/src/sharedProfileDisplay';
import { dayMonth, recordCountsByWorkout } from '../../../../frontend/src/trainingSummary';
import type {
  FriendStatus,
  SharedConsistency,
  SharedProfile,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { formatWeight } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Button, Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { Segmented } from '../training/parts';
import { workoutColor } from '../training/useTrainingContext';
import { WorkoutCard, WorkoutDetails } from '../training/WorkoutCard';
import { Avatar } from './Avatar';
import { PhotoViewer } from './PhotoViewer';
import { FriendQrSheet } from './FriendQrSheet';
import { socialIcons } from './icons';
import { useSocialNavigation } from './navigation';
import { SharingLocked, SmallButton } from './parts';
import { notFound, sharingRequired, socialApi } from './socialApi';
import {
  refreshSocial,
  sharedWorkoutList,
  useSharedProfile,
  useSharedWorkouts,
} from './socialQueries';
import { socialHeader } from './screenOptions';

/** How long a removed friend can be restored before the removal is sent, as the toast's Undo. */
const REMOVE_UNDO_MS = 5000;

/**
 * A member's profile, or your own: who they are and how you're connected, then what they share
 * (their numbers, body weight, goals and workouts). Opened from an invite, it sends the friend
 * request first, with Undo, as the web's invite flow does.
 */
export function ProfileScreen({
  profileId,
  invite = false,
}: {
  profileId: string;
  invite?: boolean;
}) {
  const { colors, space } = useTheme();
  const client = useQueryClient();
  const query = useSharedProfile(profileId);
  const [blocked, setBlocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const profile = query.data;
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
  else if (sharingRequired(query.error)) body = <LockedPanel invite={invite} />;
  else if (notFound(query.error)) body = <Unavailable state="missing" name="" invite={invite} />;
  else if (!profile)
    body = query.error ? (
      <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <Loading label="Loading profile" />
    );
  else body = <ProfileBody profile={profile} onBlocked={() => setBlocked(true)} />;

  return (
    <>
      <Stack.Screen options={socialHeader(colors, title)} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
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
    const notify = (result: Omit<InviteResult, 'serial'>) => {
      const message = inviteMessage({ ...result, serial: Date.now() });
      if (result.kind !== 'sent') return showToast(message);
      showToast(message, {
        label: 'Undo',
        run: () =>
          void socialApi
            .removeFriend(profileId)
            .catch(() => showToast(inviteMessage({ ...result, kind: 'undo-failed', serial: 0 })))
            .finally(() => void refreshSocial(client)),
      });
    };
    void socialApi
      .addFriend(profileId)
      .then(async (answer) => {
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

function ProfileBody({ profile, onBlocked }: { profile: SharedProfile; onBlocked: () => void }) {
  return (
    <>
      <ProfileHeader profile={profile} onBlocked={onBlocked} />
      {!profile.can_view ? (
        <FriendsOnly profile={profile} />
      ) : (
        <>
          {profile.consistency && <ConsistencySummary consistency={profile.consistency} />}
          {profile.body_weight && <BodyWeightCard profile={profile} />}
          {profile.goals && <GoalsCard profile={profile} />}
          <ProfileWorkouts profile={profile} />
        </>
      )}
    </>
  );
}

/** The web's Consistency numbers for the last 12 weeks; the calendar is still web-only. */
function ConsistencySummary({ consistency }: { consistency: SharedConsistency }) {
  const { colors, type } = useTheme();
  const streak = consistency.current_streak;
  const weeks = consistencyWeeks(firstTrainingDay(consistency.heatmap), localDate());
  return (
    <Card>
      <CardHeader
        title="Consistency"
        action={<Text style={[type.footnote, { color: colors.muted }]}>Last 12 weeks</Text>}
      />
      <StatRow
        stats={[
          { label: 'Streak', value: `${streak} ${streak === 1 ? 'day' : 'days'}` },
          { label: 'Training days', value: String(consistency.training_days) },
          { label: 'Avg / week', value: averagePerWeek(consistency.training_days, weeks) },
        ]}
      />
    </Card>
  );
}

function ProfileHeader({ profile, onBlocked }: { profile: SharedProfile; onBlocked: () => void }) {
  const { colors, type, radius } = useTheme();
  const router = useRouter();
  const nav = useSocialNavigation();
  const [qrOpen, setQrOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const memberSince = formatMemberSince(profile.member_since);
  const photo = profile.profile_photo_url;
  return (
    <Card>
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
            photos={[{ id: photo, url: photo, label: `${profile.display_name}'s profile photo` }]}
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
            <Text style={[type.footnote, { color: colors.secondary }]}>Joined {memberSince}</Text>
          )}
        </View>
      </View>
      {profile.is_you ? (
        <View style={styles.controls}>
          <SmallButton
            label="Edit profile"
            icon={socialIcons.edit}
            onPress={() => router.push('/settings/profile')}
          />
          <SmallButton
            label={`Sharing: ${VISIBILITY_LABELS[profile.visibility]}`}
            icon={socialIcons.people}
            onPress={nav.openSharing}
          />
          <SmallButton label="QR code" icon={socialIcons.qr} onPress={() => setQrOpen(true)} />
        </View>
      ) : (
        <FriendControl profile={profile} onBlocked={onBlocked} />
      )}
      {profile.can_view && <StatRow stats={profileStats(profile)} />}
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

function StatRow({ stats }: { stats: { label: string; value: string }[] }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.stats}>
      {stats.map((stat) => (
        <View key={stat.label} style={{ flex: 1, gap: 2 }}>
          <Text style={[type.caption, { color: colors.muted }]}>{stat.label}</Text>
          <Text style={[type.headline, type.number, { color: colors.text }]}>{stat.value}</Text>
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
  const removal = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removing, setRemoving] = useState(false);
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

  // Leaving the profile sends a removal that is still waiting for its Undo.
  useEffect(() => {
    const id = profile.id;
    return () => {
      if (!removal.current) return;
      clearTimeout(removal.current);
      removal.current = null;
      void socialApi.removeFriend(id).finally(() => void refreshSocial(client));
    };
  }, [client, profile.id]);

  function remove() {
    setRemoving(true);
    const send = () => {
      removal.current = null;
      socialApi
        .removeFriend(profile.id)
        .then(() => refreshSocial(client))
        .catch(() => {
          setRemoving(false);
          showToast('Could not remove this friend. You are still friends.');
        });
    };
    removal.current = setTimeout(send, REMOVE_UNDO_MS);
    showToast(`Removed ${profile.display_name}`, {
      label: 'Undo',
      run: () => {
        if (removal.current) clearTimeout(removal.current);
        removal.current = null;
        setRemoving(false);
      },
    });
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
  const pillWidth = pill === 'Requested' ? 116 : 100;
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
            height={32}
            fill={colors.surface2}
            cornerRadius={16}
          >
            <View
              style={[styles.pill, { backgroundColor: colors.surface2, borderRadius: radius.pill }]}
            >
              {status === 'friends' && <Icon name="check" size={14} color={colors.good} />}
              <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]}>{pill}</Text>
              <Icon name="chevronDown" size={12} color={colors.secondary} />
            </View>
          </MenuButton>
        ) : (
          <MenuButton
            accessibilityLabel={`More options for ${profile.display_name}`}
            items={items}
            trigger={{ sf: 'ellipsis', color: colors.text, size: 15 }}
            width={32}
            height={32}
            fill={colors.surface2}
          >
            <View style={[styles.more, { backgroundColor: colors.surface2 }]}>
              <Icon name="more" size={16} color={colors.text} />
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

function BodyWeightCard({ profile }: { profile: SharedProfile }) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  const summary = sharedBodyWeight(profile.body_weight ?? []);
  return (
    <Card>
      <CardHeader
        title="Body weight"
        action={
          summary && (
            <Text style={[type.footnote, { color: colors.muted }]}>
              {dayMonth(summary.latest.measurement_date)}
            </Text>
          )
        }
      />
      {!summary ? (
        <Text style={[type.callout, { color: colors.secondary }]}>No weigh-ins yet.</Text>
      ) : (
        <StatRow
          stats={[
            { label: 'Latest', value: formatWeight(summary.latest.weight_kg, unit, 1) },
            ...(summary.change !== null
              ? [
                  {
                    label: `${BODY_WEIGHT_CHART_DAYS} days`,
                    value: signedWeightChange(summary.change, unit),
                  },
                ]
              : []),
            ...(summary.latestFat !== null
              ? [{ label: 'Body fat', value: `${summary.latestFat}%` }]
              : []),
          ]}
        />
      )}
    </Card>
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

/** The shared history, in the web's tabs when the member logs cardio, opening like Training's. */
function ProfileWorkouts({ profile }: { profile: SharedProfile }) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  const [tab, setTab] = useState<SharedHistoryTab>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const cardioTab = !!profile.cardio_sessions;
  const kind = cardioTab ? SHARED_HISTORY_KIND[tab] : undefined;
  const query = useSharedWorkouts(profile.id, { kind, enabled: profile.can_view });
  const { workouts, records } = sharedWorkoutList(query.data);
  const recordCounts = recordCountsByWorkout(records);
  const types = profile.consistency?.workout_types ?? [];
  const thisYear = new Date().getFullYear().toString();
  return (
    <Card>
      {cardioTab ? (
        <Segmented
          accessibilityLabel="Training history"
          values={SHARED_HISTORY_TABS.map(([, label]) => label)}
          selectedIndex={SHARED_HISTORY_TABS.findIndex(([value]) => value === tab)}
          onChange={(index) => setTab(SHARED_HISTORY_TABS[index][0])}
        />
      ) : (
        <CardHeader title="Workouts" />
      )}
      {query.isPending ? (
        <Loading label="Loading workouts" />
      ) : query.error && !workouts.length ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : workouts.length === 0 ? (
        <Text style={[type.callout, { color: colors.secondary }]}>
          {sharedHistoryEmpty(kind, false)}
        </Text>
      ) : (
        <View>
          {workouts.map((workout, index) => (
            <View
              key={workout.id}
              style={
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line,
                }
              }
            >
              <WorkoutCard
                workout={workout}
                color={workoutColor(workout, types)}
                records={recordCounts.get(workout.id) ?? 0}
                open={openId === workout.id}
                showYear={workout.workout_date.slice(0, 4) !== thisYear}
                onToggle={() => setOpenId(openId === workout.id ? null : workout.id)}
              >
                <WorkoutDetails
                  workout={workout}
                  personalRecords={records}
                  bodyweight={null}
                  unit={unit}
                />
              </WorkoutCard>
            </View>
          ))}
        </View>
      )}
      {query.error && workouts.length > 0 && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(query.error)}
        </Text>
      )}
      {query.hasNextPage && (
        <Button
          label={query.isFetchingNextPage ? 'Loading…' : 'Show older workouts'}
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: {
    minHeight: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 12 },
  track: { height: 8, overflow: 'hidden', marginTop: 4 },
});
