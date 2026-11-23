import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  defaultHomeLayout,
  fillHomeSectionGap,
  homeLayoutDraft,
  homeSection,
  homeSectionLists,
  showHomeSectionAfter,
  type HomeLayout,
  type HomeSectionGap,
  type HomeSectionId,
} from '../../../../frontend/src/homeLayout';
import { Button, cardSurface, ErrorState, errorMessage, Loading } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { CARD_SETTINGS, CardSettingsForm } from './CardSettings';
import { useHomeLayout, useSaveHomeLayout } from './homeData';
import { homeIcons } from './homeIcons';
import { HomeLayoutGrid, RoundButton } from './HomeLayoutGrid';
import { appDrawsSection } from './homeSections';
import { HomeSheet } from './HomeSheet';

/**
 * Arranges Home, as the web's layout editing does: drag cards to reorder or into a row's empty
 * space, move them with accessible buttons, hide them or add hidden ones back, make a card compact
 * or full width, and change a card's options. Save sends the layout in the web's format, so both
 * apps show the same Home.
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

function Editor({ saved }: { saved: HomeLayout }) {
  const { colors, type, radius, space } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const save = useSaveHomeLayout();
  const [draft, setDraft] = useState(() => homeLayoutDraft(saved));
  const [customising, setCustomising] = useState<HomeSectionId | null>(null);
  const [addingTo, setAddingTo] = useState<HomeSectionGap | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Discarding lets the back gesture through; saving leaves once the screen no longer holds.
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const [baseline] = useState(() => JSON.stringify(homeLayoutDraft(saved)));
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const scrollMetricsRef = useRef({ y: 0, height: 0, contentHeight: 0 });
  const dirty = JSON.stringify(draft) !== baseline;
  const { visible, hidden } = homeSectionLists(draft, appDrawsSection);
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
    haptics.selection();
    setError(null);
    setDraft(next);
  }

  async function saveLayout() {
    if (save.isPending || dragging) return;
    setError(null);
    try {
      await save.mutateAsync(draft);
      haptics.success();
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
                accessibilityState={{ disabled: !dirty || dragging }}
                disabled={!dirty || dragging}
                hitSlop={8}
                onPress={() => void saveLayout()}
              >
                <Text
                  style={[
                    type.body,
                    {
                      color: colors.accentText,
                      fontWeight: '600',
                      opacity: dirty && !dragging ? 1 : 0.4,
                    },
                  ]}
                >
                  Save
                </Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onLayout={(event) => {
          scrollMetricsRef.current.height = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_width, height) => {
          scrollMetricsRef.current.contentHeight = height;
        }}
        onScroll={(event) => {
          scrollMetricsRef.current.y = event.nativeEvent.contentOffset.y;
        }}
        // Opaque, so Home never shows along the edge while this screen slides in.
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: space.gutter,
          gap: 20,
          paddingBottom: insets.bottom + 48,
        }}
      >
        {error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        <View style={{ gap: 8 }}>
          <Text
            accessibilityRole="header"
            style={[type.eyebrow, { color: colors.muted, paddingHorizontal: 4 }]}
          >
            ON HOME
          </Text>
          <HomeLayoutGrid
            draft={draft}
            visible={visible}
            disabled={save.isPending}
            scrollRef={scrollRef}
            scrollMetricsRef={scrollMetricsRef}
            onChange={change}
            onCustomise={setCustomising}
            onAddInGap={setAddingTo}
            onDraggingChange={setDragging}
          />
        </View>
        {hidden.length > 0 && (
          <Group title="Add sections">
            {hidden.map((id, index) => (
              <Row key={id} first={index === 0}>
                <RoundButton
                  icon={homeIcons.add}
                  color={colors.good}
                  plain
                  label={`Add ${title(id)}`}
                  disabled={save.isPending || dragging}
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
          disabled={save.isPending || dragging}
          style={{ borderRadius: radius.lg }}
          onPress={() => {
            change(defaultHomeLayout());
            showToast('Default layout restored');
          }}
        />
      </ScrollView>
      <HomeSheet visible={!!addingTo} onClose={() => setAddingTo(null)} title="Add a section here">
        <Text style={[type.callout, { color: colors.muted }]}>
          {hidden.length
            ? 'Choose a section to add to this space.'
            : 'All available sections are already on Home.'}
        </Text>
        {hidden.map((id) => {
          const section = homeSection(id);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${section.title} here`}
              disabled={save.isPending}
              onPress={() => {
                if (!addingTo) return;
                change(fillHomeSectionGap(draft, id, addingTo.after, addingTo.span));
                showToast(`${section.title} added`);
                setAddingTo(null);
              }}
              style={({ pressed }) => [
                styles.gapChoice,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.body, { color: colors.text, fontWeight: '600' }]}>
                  {section.title}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]}>{section.description}</Text>
              </View>
              <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
                Add
              </Text>
            </Pressable>
          );
        })}
      </HomeSheet>
      <HomeSheet
        visible={!!customising && !!CARD_SETTINGS[customising]}
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
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={[type.eyebrow, { color: colors.muted, paddingHorizontal: 4 }]}
      >
        {title.toUpperCase()}
      </Text>
      <View style={cardSurface(colors)}>{children}</View>
    </View>
  );
}

function Row({ first, children }: { first: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      {children}
    </View>
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
  gapChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
  },
});
