import type { Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  searchSettings,
  SETTINGS_GROUP_LABELS,
  type SettingsDestination,
} from '../../../../frontend/src/settingsSearchIndex';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { adminRoutes } from '../admin';
import { socialRoutes } from '../social';
import { Row, Section } from './SettingsList';

/** Settings sections a search result can scroll to. */
export type SettingsAnchor =
  'training' | 'between-sets' | 'help' | 'auto-save' | 'notifications' | 'data' | 'account';

export type SearchTarget = { route: Href } | { section: SettingsAnchor };

/**
 * Where each of the web's search destinations lives in the app. Destinations the app doesn't have
 * (Add to Home Screen, the YouTube connection) are left out of its results.
 */
export function searchTarget(entry: SettingsDestination, userId: string): SearchTarget | null {
  switch (entry.id) {
    case 'tips':
      return { route: '/settings/tips' };
    case 'setup-guides':
    case 'guide':
      return { route: '/settings/guides' };
    case 'workout-sharing':
      return { section: 'help' };
    case 'training-split':
      return { route: '/split' };
    case 'workout-auto-save':
      return { section: 'auto-save' };
    case 'pr-fresh-start':
      return { route: '/settings/fresh-starts' };
    case 'rest':
    case 'rest-times':
    case 'default-rest':
      return { section: 'between-sets' };
    case 'alerts':
      return { section: 'notifications' };
    case 'appearance':
    case 'motion':
      return { route: '/settings/appearance' };
    case 'training':
      return { section: 'training' };
    case 'colours':
      return { route: '/settings/workout-types' };
    case 'trend':
      return { route: '/settings/bodyweight' };
    case 'workouts':
    case 'archive':
      return { section: 'data' };
    case 'release':
      return { route: '/settings/whats-new' };
    case 'feedback':
      return { route: '/settings/feedback' };
    case 'username':
    case 'name':
    case 'photo':
    case 'profile-sex':
      return { route: '/settings/profile' };
    case 'training-time':
      return { route: socialRoutes.profile(userId) };
    case 'sharing':
    case 'shared-fields':
    case 'live-activity':
      return { route: socialRoutes.sharing };
    case 'password':
      return { route: '/settings/password' };
    case 'uuid':
    case 'signout':
      return { section: 'account' };
    case 'cardio-zones':
      return { route: '/cardio/zones' };
    case 'home-check-in':
      return { route: '/home-layout' };
    case 'admin':
      return { route: adminRoutes.console };
    case 'delete':
      return { route: '/settings/delete-account' };
    default:
      return null;
  }
}

const PAGE_LABELS: Record<SettingsDestination['page'], string> = {
  settings: 'Settings',
  profile: 'Profile',
  cardio: 'Cardio',
  dashboard: 'Home',
  admin: 'Admin',
};

/** The web's search results, limited to the places the app has. */
export function settingsSearchResults(query: string, userId: string, isAdmin: boolean) {
  return searchSettings(query, true, isAdmin).flatMap((entry) => {
    const target = searchTarget(entry, userId);
    return target ? [{ entry, target }] : [];
  });
}

/** The web's "Search settings & profile" field. */
export function SettingsSearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.searchBar,
        {
          backgroundColor: colors.surface2,
          borderColor: focused ? colors.accent : colors.lineStrong,
          borderRadius: radius.md,
        },
      ]}
    >
      <Icon name="search" size={18} color={colors.muted} />
      <TextInput
        accessibilityLabel="Search settings and profile"
        placeholder="Rest timer, username, theme…"
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={[type.body, styles.searchInput, { color: colors.text }]}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChange('')}
          style={styles.clearButton}
        >
          <Icon name="close" size={16} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** "N sections found" and one row per result, each opening its screen or section. */
export function SettingsSearchResults({
  results,
  onChoose,
}: {
  results: ReturnType<typeof settingsSearchResults>;
  onChoose: (target: SearchTarget) => void;
}) {
  const { colors, type } = useTheme();
  if (!results.length)
    return (
      <Text
        accessibilityLiveRegion="polite"
        style={[type.callout, styles.status, { color: colors.muted }]}
      >
        No sections found. Try “timer” or “username”.
      </Text>
    );
  return (
    <Section title={`${results.length} ${results.length === 1 ? 'section' : 'sections'} found`}>
      {results.map(({ entry, target }) => {
        const place = entry.group ? SETTINGS_GROUP_LABELS[entry.group] : PAGE_LABELS[entry.page];
        return (
          <Row
            key={entry.id}
            label={entry.title}
            subtitle={place}
            accessibilityLabel={`${entry.title}, ${place}`}
            destructive={entry.id === 'delete'}
            onPress={() => onChoose(target)}
          />
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 2,
    borderWidth: 1,
  },
  searchInput: { flex: 1, paddingVertical: 10 },
  clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  status: { paddingHorizontal: 16 },
});
