import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EMOJI_GROUPS } from '../../../../frontend/src/emojiCatalog';
import { searchEmojis, type EmojiEntry } from '../../../../frontend/src/emojiPicker';
import { reactionChoice, reactionKey } from '../../../../frontend/src/friendFeedData';
import type { WorkoutReactionKind } from '../../../../frontend/src/types';
import { Button, errorMessage } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useCountAsSheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { useReduceMotion } from '../settings/devicePreferences';

const CELL = 48;
const HEADING = 34;
const SIDE = 20;

type Row =
  | { key: string; kind: 'heading'; title: string; group: number }
  | { key: string; kind: 'emojis'; emojis: EmojiEntry[]; group: number };

/** Category headings and rows of emojis, so the list can be virtualised with fixed heights. */
function emojiRows(columns: number, results: EmojiEntry[] | null): Row[] {
  const chunk = (emojis: readonly EmojiEntry[], group: number, prefix: string): Row[] => {
    const rows: Row[] = [];
    for (let start = 0; start < emojis.length; start += columns) {
      rows.push({
        key: `${prefix}-${start}`,
        kind: 'emojis',
        emojis: emojis.slice(start, start + columns),
        group,
      });
    }
    return rows;
  };
  if (results) return chunk(results, 0, 'search');
  return EMOJI_GROUPS.flatMap((group, index) => [
    {
      key: group.name,
      kind: 'heading' as const,
      title: group.name,
      group: index,
    },
    ...chunk(group.emojis, index, group.name),
  ]);
}

/** Where each row starts in the list, for jumping to a category and following the scroll. */
function rowOffsets(rows: Row[]): number[] {
  const offsets: number[] = [];
  let top = 0;
  for (const row of rows) {
    offsets.push(top);
    top += row.kind === 'heading' ? HEADING : CELL;
  }
  return offsets;
}

/**
 * Any emoji as a reaction to a workout or comment, as on the web: search by name, jump between
 * categories, or type an emoji from the keyboard into the search. Choosing your current reaction
 * again, or Remove reaction, takes it away.
 */
export function EmojiReactionSheet({
  title,
  yours,
  busy = false,
  error,
  onChoose,
  onClose,
}: {
  title: string;
  yours: WorkoutReactionKind | null;
  busy?: boolean;
  error?: unknown;
  /** The chosen reaction's saved key; `null` removes yours. */
  onChoose: (reaction: WorkoutReactionKind | null) => void;
  onClose: () => void;
}) {
  const { colors, radius, scheme, type } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const { width } = useWindowDimensions();
  const ios = Platform.OS === 'ios';
  const input = useRef<TextInputInstance>(null);
  const list = useRef<FlatList<Row>>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [group, setGroup] = useState(0);
  useCountAsSheet(true);

  const columns = Math.max(5, Math.floor((width - SIDE * 2) / CELL));
  const searching = query.trim().length > 0;
  const rows = useMemo(
    () => emojiRows(columns, searching ? searchEmojis(query) : null),
    [columns, searching, query],
  );
  const offsets = useMemo(() => rowOffsets(rows), [rows]);
  const current = reactionChoice(yours);

  const choose = (emoji: string) => {
    haptics.tap();
    const key = reactionKey(emoji);
    onChoose(key === yours ? null : key);
  };

  const showGroup = (index: number) => {
    haptics.selection();
    setGroup(index);
    const row = rows.findIndex((item) => item.kind === 'heading' && item.group === index);
    if (row >= 0)
      list.current?.scrollToOffset({
        offset: offsets[row],
        animated: !reduced,
      });
  };

  const content = (
    <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={[type.title, { color: colors.text, flex: 1 }]}
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.closeTouch}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.close,
                { backgroundColor: colors.surface2 },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Icon name="close" size={15} color={colors.secondary} />
            </View>
          )}
        </Pressable>
      </View>

      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: colors.surface2,
            borderColor: focused ? colors.accent : colors.lineStrong,
            borderRadius: radius.md,
          },
        ]}
      >
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          ref={input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search emoji"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Search emoji"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          keyboardAppearance={scheme}
          selectionColor={colors.accent}
          style={[type.body, styles.searchInput, { color: colors.text }]}
        />
        {!!query && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => {
              setQuery('');
              input.current?.focus();
            }}
            style={styles.clearButton}
          >
            <Icon name="close" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {!searching && (
        <View
          accessibilityLabel="Emoji categories"
          style={[styles.tabs, { borderBottomColor: colors.line }]}
        >
          {EMOJI_GROUPS.map((item, index) => {
            const active = index === group;
            return (
              <Pressable
                key={item.name}
                accessibilityRole="tab"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: active }}
                onPress={() => showGroup(index)}
                style={[
                  styles.tab,
                  { borderRadius: radius.sm },
                  active && { backgroundColor: colors.accentSoft },
                ]}
              >
                <Text style={[styles.tabEmoji, !active && styles.tabIdle]}>{item.icon}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={14}
        windowSize={7}
        getItemLayout={(_data, index) => ({
          length: rows[index].kind === 'heading' ? HEADING : CELL,
          offset: offsets[index],
          index,
        })}
        onScroll={(event) => {
          if (searching) return;
          const top = event.nativeEvent.contentOffset.y + 8;
          let at = 0;
          for (let index = 0; index < rows.length && offsets[index] <= top; index += 1) {
            at = rows[index].group;
          }
          if (at !== group) setGroup(at);
        }}
        scrollEventThrottle={64}
        ListEmptyComponent={
          <Text style={[styles.empty, type.callout, { color: colors.muted }]}>No emoji found</Text>
        }
        renderItem={({ item: row }) =>
          row.kind === 'heading' ? (
            <Text
              accessibilityRole="header"
              style={[styles.heading, type.footnote, { color: colors.muted }]}
            >
              {row.title}
            </Text>
          ) : (
            <View style={styles.emojiRow}>
              {row.emojis.map(([emoji, name]) => {
                const mine = reactionKey(emoji) === yours;
                return (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    accessibilityState={{ selected: mine, disabled: busy }}
                    disabled={busy}
                    onPress={() => choose(emoji)}
                    style={({ pressed }) => [
                      styles.cell,
                      { borderRadius: radius.md },
                      mine && {
                        backgroundColor: colors.accentSoft,
                        borderColor: colors.accent,
                      },
                      pressed && { backgroundColor: colors.surface2 },
                    ]}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          )
        }
      />

      {!!error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(error)}
        </Text>
      )}
      {busy && <ActivityIndicator size="small" color={colors.accentText} />}
      {current && (
        <Button
          label={`${current.emoji}  Remove reaction`}
          accessibilityLabel="Remove reaction"
          variant="secondary"
          block
          disabled={busy}
          onPress={() => {
            haptics.tap();
            onChoose(null);
          }}
        />
      )}
    </View>
  );

  return (
    <Modal
      visible
      onRequestClose={onClose}
      allowSwipeDismissal
      animationType={reduced ? 'none' : ios ? 'slide' : 'fade'}
      presentationStyle={ios ? 'pageSheet' : 'overFullScreen'}
      transparent={!ios}
      statusBarTranslucent={!ios}
      navigationBarTranslucent={!ios}
    >
      {ios ? (
        <View style={{ flex: 1, backgroundColor: colors.surface }}>{content}</View>
      ) : (
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
          <View
            style={[
              styles.androidCard,
              { backgroundColor: colors.surface, marginTop: insets.top + 48 },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
            {content}
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  androidCard: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
  },
  body: { flex: 1, paddingHorizontal: SIDE, paddingTop: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeTouch: {
    width: 44,
    height: 44,
    margin: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 0 },
  clearButton: {
    width: 44,
    height: 44,
    marginRight: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
  },
  tab: {
    flex: 1,
    maxWidth: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabEmoji: { fontSize: 20 },
  tabIdle: { opacity: 0.5 },
  list: { flex: 1, marginHorizontal: -SIDE },
  listContent: { paddingHorizontal: SIDE, paddingBottom: 12 },
  heading: { height: HEADING, paddingTop: 12, fontWeight: '600' },
  emojiRow: { flexDirection: 'row', height: CELL },
  cell: {
    width: CELL,
    height: CELL,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 30 },
  empty: { textAlign: 'center', paddingVertical: 24 },
});
