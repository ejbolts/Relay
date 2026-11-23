import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { byLiveActivity, presenceStatus } from '../../../../frontend/src/presenceStatus';
import {
  connectionDate,
  friendAction,
  friendListDetail,
  searchResultDetail,
} from '../../../../frontend/src/sharedProfileDisplay';
import type {
  FriendConnections,
  SharedProfileSummary,
  SharingConnection,
} from '../../../../frontend/src/types';
import { Button, Card, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { useSocialNavigation } from './navigation';
import { EmptyLine, GroupTitle, PersonRow, SmallButton } from './parts';
import { socialApi } from './socialApi';
import { refreshSocial, usePeopleSearch, useSuggestions } from './socialQueries';

type Action = 'add' | 'accept' | 'cancel' | 'decline' | 'unblock';

/** Sends one friend action and refreshes everything Social shows. */
export function useFriendAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, id }: { action: Action; id: string }) => {
      if (action === 'add') await socialApi.addFriend(id);
      else if (action === 'accept') await socialApi.acceptFriend(id);
      else if (action === 'unblock') await socialApi.unblock(id);
      // Cancelling your request and declining theirs both remove the request.
      else await socialApi.removeFriend(id);
    },
    onSettled: () => refreshSocial(client),
  });
}

/**
 * Social's Friends tab: requests, people search, your friends, suggestions, sent requests and
 * blocks, as the web's.
 */
export function FriendsSection({ connections }: { connections: FriendConnections }) {
  const { colors, type } = useTheme();
  const nav = useSocialNavigation();
  const now = useNow(30_000);
  const friend = useFriendAction();
  const busyId = friend.isPending ? friend.variables?.id : undefined;
  const act = (action: Action, person: { id: string }) => friend.mutate({ action, id: person.id });
  const open = (person: { id: string }) => () => nav.openProfile(person);
  const button = (
    action: Action,
    label: string,
    person: SharingConnection,
    variant: 'primary' | 'secondary' = 'secondary',
    accessibilityLabel?: string,
  ) => (
    <SmallButton
      label={label}
      variant={variant}
      busy={busyId === person.id && friend.variables?.action === action}
      disabled={busyId !== undefined}
      accessibilityLabel={accessibilityLabel ?? `${label} ${person.display_name}`}
      onPress={() => act(action, person)}
    />
  );
  return (
    <View style={{ gap: 16 }}>
      {friend.error && (
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
          {errorMessage(friend.error)}
        </Text>
      )}
      {connections.requests.length > 0 && (
        <Card style={{ borderColor: colors.accent, borderWidth: 1 }}>
          <GroupTitle title="Friend requests" count={connections.requests.length} />
          {connections.requests.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              detail={connectionDate('request', person.since)}
              onOpen={open(person)}
              actions={
                <>
                  {button('accept', 'Accept', person, 'primary')}
                  {button('decline', 'Decline', person)}
                </>
              }
            />
          ))}
        </Card>
      )}
      <PeopleSearch />
      {connections.friends.length > 0 && (
        <Card>
          <GroupTitle title="Friends" count={connections.friends.length} />
          {byLiveActivity(connections.friends, (item) => item.presence).map((item) => (
            <PersonRow
              key={item.id}
              person={item}
              status={presenceStatus(item.presence)}
              detail={friendListDetail(item, now)}
              onOpen={open(item)}
            />
          ))}
        </Card>
      )}
      <SuggestedFriends />
      {connections.sent.length > 0 && (
        <Card>
          <GroupTitle title="Sent requests" count={connections.sent.length} />
          {connections.sent.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              detail={connectionDate('sent', person.since)}
              onOpen={open(person)}
              actions={button(
                'cancel',
                'Cancel',
                person,
                'secondary',
                `Cancel request to ${person.display_name}`,
              )}
            />
          ))}
        </Card>
      )}
      {connections.blocked.length > 0 && <BlockedGroup blocked={connections.blocked} />}
    </View>
  );
}

/** Members you blocked, each with Unblock. A private profile still sees this. */
export function BlockedGroup({ blocked }: { blocked: SharingConnection[] }) {
  const friend = useFriendAction();
  const busyId = friend.isPending ? friend.variables?.id : undefined;
  return (
    <Card>
      <GroupTitle title="Blocked" count={blocked.length} />
      {blocked.map((person) => (
        <PersonRow
          key={person.id}
          person={person}
          detail={connectionDate('blocked', person.since)}
          actions={
            <SmallButton
              label="Unblock"
              busy={busyId === person.id}
              disabled={busyId !== undefined}
              accessibilityLabel={`Unblock ${person.display_name}`}
              onPress={() => friend.mutate({ action: 'unblock', id: person.id })}
            />
          }
        />
      ))}
    </Card>
  );
}

/** A search result's or suggestion's friend action, or a Friends label. */
function ProfileAction({ profile }: { profile: SharedProfileSummary }) {
  const { colors, type } = useTheme();
  const friend = useFriendAction();
  const choice = friendAction(profile);
  if (profile.is_you) return null;
  if (!choice)
    return (
      <View style={styles.friendsLabel}>
        <Icon name="check" size={14} color={colors.good} />
        <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>Friends</Text>
      </View>
    );
  return (
    <SmallButton
      label={choice.label}
      variant={choice.primary ? 'primary' : 'secondary'}
      busy={friend.isPending}
      accessibilityLabel={`${choice.label}: ${profile.display_name}`}
      onPress={() => friend.mutate({ action: choice.kind, id: profile.id })}
    />
  );
}

function PeopleSearch() {
  const { colors, type, radius } = useTheme();
  const nav = useSocialNavigation();
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const search = usePeopleSearch(term);
  const submit = () => setTerm(input.trim());
  return (
    <Card>
      <GroupTitle title="Search people" />
      <View style={styles.searchRow}>
        <View
          style={[styles.searchBox, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
        >
          <Icon name="search" size={16} color={colors.muted} />
          <TextInput
            accessibilityLabel="Account name or UUID"
            placeholder="Account name or UUID"
            placeholderTextColor={colors.muted}
            value={input}
            maxLength={100}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            onChangeText={(next) => {
              setInput(next);
              if (!next.trim()) setTerm('');
            }}
            onSubmitEditing={submit}
            style={[type.body, { color: colors.text, flex: 1, paddingVertical: 10 }]}
          />
        </View>
        <SmallButton
          label="Search"
          variant="primary"
          disabled={!input.trim()}
          busy={search.isFetching && input.trim() === term}
          onPress={submit}
        />
      </View>
      {term.length > 0 &&
        (search.isPending ? (
          <ActivityIndicator accessibilityLabel="Searching" color={colors.accentText} />
        ) : search.error ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
              {errorMessage(search.error)}
            </Text>
            <Button label="Try again" variant="secondary" onPress={() => void search.refetch()} />
          </View>
        ) : (
          <View>
            <Text accessibilityLiveRegion="polite" style={[type.footnote, { color: colors.muted }]}>
              {`${search.data.length} ${search.data.length === 1 ? 'account' : 'accounts'} found for “${term}”.`}
            </Text>
            {search.data.length === 0 ? (
              <EmptyLine>No shared accounts found. Check the name or UUID.</EmptyLine>
            ) : (
              search.data.map((profile) => (
                <PersonRow
                  key={profile.id}
                  person={profile}
                  detail={searchResultDetail(profile)}
                  onOpen={() => nav.openProfile(profile)}
                  actions={<ProfileAction profile={profile} />}
                />
              ))
            )}
          </View>
        ))}
    </Card>
  );
}

function SuggestedFriends() {
  const { colors, type } = useTheme();
  const nav = useSocialNavigation();
  const [page, setPage] = useState(1);
  const query = useSuggestions(page);
  const result = query.data;
  const pages = result ? Math.ceil(result.total / result.page_size) : 0;
  return (
    <Card>
      <GroupTitle title="Suggested friends" />
      {query.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading suggestions" color={colors.accentText} />
      ) : query.error && !result ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {errorMessage(query.error)}
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      ) : result && result.profiles.length === 0 ? (
        <EmptyLine>No suggested friends right now.</EmptyLine>
      ) : (
        result && (
          <>
            {result.profiles.map((profile) => (
              <PersonRow
                key={profile.id}
                person={profile}
                detail={`@${profile.username}`}
                onOpen={() => nav.openProfile(profile)}
                actions={<ProfileAction profile={profile} />}
              />
            ))}
            {pages > 1 && (
              <View style={styles.pager}>
                <Pager
                  label="Previous"
                  icon="chevronLeft"
                  disabled={result.page <= 1 || query.isFetching}
                  onPress={() => setPage(result.page - 1)}
                />
                <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
                  {`Page ${result.page} of ${pages}`}
                </Text>
                <Pager
                  label="Next"
                  icon="chevronRight"
                  disabled={result.page >= pages || query.isFetching}
                  onPress={() => setPage(result.page + 1)}
                />
              </View>
            )}
          </>
        )
      )}
    </Card>
  );
}

function Pager({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'chevronLeft' | 'chevronRight';
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} page of suggested friends`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.pagerButton,
        { backgroundColor: colors.surface2 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={14} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  friendsLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  pagerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
