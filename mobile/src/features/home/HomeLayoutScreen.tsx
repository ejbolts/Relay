import * as Haptics from 'expo-haptics';
import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  defaultHomeLayout,
  homeLayoutDraft,
  homeSection,
  homeSectionLists,
  homeSectionSpans,
  moveHomeSection,
  showHomeSectionAfter,
  stepHomeSection,
  toggleHomeSection,
  toggleHomeSectionWidth,
  type HomeLayout,
  type HomeSectionId,
} from '../../../../frontend/src/homeLayout';
import { Button, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon, type IconName, type IconPair } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { CARD_SETTINGS, CardSettingsForm } from './CardSettings';
import { useHomeLayout, useSaveHomeLayout } from './homeData';
import { homeIcons } from './homeIcons';
import { appDrawsSection } from './homeSections';
import { HomeSheet } from './HomeSheet';

/**
 * Arranges Home, as the web's layout editing does: move cards up or down, hide them or add
 * hidden ones back, make a card compact or full width, and change a card's options. Save sends
 * the layout in the web's format, so both apps show the same Home.
 */
export function HomeLayoutScreen() {
  const home = useHomeLayout();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      {home.confirmed ? (
        <Editor saved={home.layout} />
      ) : home.isError ? (
        <ErrorState message={errorMessage(home.error)} onRetry={() => void home.refetch()} />
      ) : (
        <Loading label="Loading your layout" />
      )}
    </View>
  );
}

const widthName = (span: number) => (span === 3 ? 'Half width' : span === 2 ? 'Third width' : '');

function Editor({ saved }: { saved: HomeLayout }) {
  const { colors, type, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const save = useSaveHomeLayout();
  const [draft, setDraft] = useState(() => homeLayoutDraft(saved));
  const [customising, setCustomising] = useState<HomeSectionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Discarding lets the back gesture through; saving leaves once the screen no longer holds.
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const [baseline] = useState(() => JSON.stringify(homeLayoutDraft(saved)));
  const dirty = JSON.stringify(draft) !== baseline;
  const { visible, hidden } = homeSectionLists(draft, appDrawsSection);
  const spans = homeSectionSpans(visible, draft.widths);
  const title = (id: HomeSectionId) => homeSection(id).title;

  usePreventRemove(dirty && !leaving && !done, ({ repeat }) =>
    Alert.alert('Discard changes?', 'Your changes to Home will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard changes',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          repeat();
        },
      },
    ]),
  );
  useEffect(() => {
    if (done) router.back();
  }, [done, router]);

  function change(next: HomeLayout) {
    void Haptics.selectionAsync();
    setError(null);
    setDraft(next);
  }

  async function saveLayout() {
    if (save.isPending) return;
    setError(null);
    try {
      await save.mutateAsync(draft);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Home layout saved');
      setDone(true);
    } catch {
      setError('Could not save your layout. Your changes are still here, so try again.');
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            save.isPending ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save Home layout"
                accessibilityState={{ disabled: !dirty }}
                disabled={!dirty}
                hitSlop={8}
                onPress={() => void saveLayout()}
              >
                <Text
                  style={[
                    type.body,
                    { color: colors.accentText, fontWeight: '600', opacity: dirty ? 1 : 0.4 },
                  ]}
                >
                  Save
                </Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 48 }}
      >
        {error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        <Group title="On Home">
          {visible.length === 0 ? (
            <Text style={[type.footnote, styles.empty, { color: colors.muted }]}>
              Add a section below, or reset the layout.
            </Text>
          ) : (
            visible.map((id, index) => {
              const span = spans[index];
              const items: MenuItem[] = [
                ...(CARD_SETTINGS[id]
                  ? [{ label: 'Customise…', onPress: () => setCustomising(id) }]
                  : []),
                {
                  label: span === 6 ? 'Compact width' : 'Full width',
                  onPress: () => change(toggleHomeSectionWidth(draft, id, span)),
                },
                ...(index > 0
                  ? [
                      {
                        label: 'Move to top',
                        onPress: () => change(moveHomeSection(draft, id, visible[0])),
                      },
                    ]
                  : []),
              ];
              return (
                <Row key={id} first={index === 0}>
                  <RoundButton
                    icon={homeIcons.remove}
                    color={colors.danger}
                    plain
                    label={`Hide ${title(id)}`}
                    onPress={() => {
                      change(toggleHomeSection(draft, id));
                      showToast(`${title(id)} hidden`);
                    }}
                  />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
                      {title(id)}
                    </Text>
                    {span < 6 && (
                      <Text style={[type.caption, { color: colors.muted }]}>{widthName(span)}</Text>
                    )}
                  </View>
                  <RoundButton
                    icon="chevronUp"
                    color={colors.text}
                    label={`Move ${title(id)} up`}
                    disabled={index === 0}
                    onPress={() => change(stepHomeSection(draft, visible, id, -1))}
                  />
                  <RoundButton
                    icon="chevronDown"
                    color={colors.text}
                    label={`Move ${title(id)} down`}
                    disabled={index === visible.length - 1}
                    onPress={() => change(stepHomeSection(draft, visible, id, 1))}
                  />
                  <MenuButton
                    accessibilityLabel={`More for ${title(id)}`}
                    items={items}
                    trigger={{ sf: 'ellipsis', color: colors.text, size: 15 }}
                    width={34}
                    height={34}
                    fill={colors.surface2}
                  >
                    <View style={[styles.round, { backgroundColor: colors.surface2 }]}>
                      <Icon name="more" size={18} color={colors.text} />
                    </View>
                  </MenuButton>
                </Row>
              );
            })
          )}
        </Group>
        {hidden.length > 0 && (
          <Group title="Add sections">
            {hidden.map((id, index) => (
              <Row key={id} first={index === 0}>
                <RoundButton
                  icon={homeIcons.add}
                  color={colors.good}
                  plain
                  label={`Add ${title(id)}`}
                  onPress={() => {
                    change(showHomeSectionAfter(draft, id, visible[0]));
                    showToast(`${title(id)} added`);
                  }}
                />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
                    {title(id)}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2}>
                    {homeSection(id).description}
                  </Text>
                </View>
              </Row>
            ))}
          </Group>
        )}
        <Button
          label="Reset to default"
          icon={homeIcons.reset}
          variant="secondary"
          style={{ borderRadius: radius.lg }}
          onPress={() => {
            change(defaultHomeLayout());
            showToast('Default layout restored');
          }}
        />
      </ScrollView>
      <HomeSheet
        visible={!!customising}
        onClose={() => setCustomising(null)}
        title={customising ? `Customise ${title(customising)}` : ''}
      >
        {customising && <CardSettingsForm id={customising} layout={draft} onChange={change} />}
        <Button label="Done" onPress={() => setCustomising(null)} />
      </HomeSheet>
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { colors, type, radius } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={[type.eyebrow, { color: colors.muted, paddingHorizontal: 4 }]}
      >
        {title.toUpperCase()}
      </Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card }}>{children}</View>
    </View>
  );
}

function Row({ first, children }: { first: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
      ]}
    >
      {children}
    </View>
  );
}

function RoundButton({
  icon,
  color,
  label,
  disabled = false,
  plain = false,
  onPress,
}: {
  icon: IconName | IconPair;
  color: string;
  label: string;
  disabled?: boolean;
  /** Just the icon, as the list's red remove and green add buttons. */
  plain?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        !plain && { backgroundColor: colors.surface2 },
        (pressed || disabled) && { opacity: disabled ? 0.3 : 0.6 },
      ]}
    >
      <Icon name={icon} size={plain ? 24 : 18} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  round: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: 16 },
});
