import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fuzzyHighlightIndices,
  rankExerciseSearchMatches,
} from '../../../../../frontend/src/exerciseSearch';
import {
  formatLiftEstimate,
  MAX_HEAD_TO_HEAD_LIFTS,
  orderLiftsForPicker,
  toggleLiftSelection,
} from '../../../../../frontend/src/liftComparisonDisplay';
import type { LiftComparison, SharedProfileSummary } from '../../../../../frontend/src/types';
import { useWeightUnit } from '../../../data/queries';
import { haptics } from '../../../ui/haptics';
import { Icon } from '../../../ui/Icon';
import { isToastAccountCurrent, showToast, toastAccount, ToastHost } from '../../../ui/Toast';
import { useTheme } from '../../../ui/theme';
import { useReduceMotion } from '../../settings/devicePreferences';
import { Avatar } from '../Avatar';

type Member = Pick<SharedProfileSummary, 'id' | 'display_name' | 'profile_photo_url'>;

/**
 * Search your exercises and tick up to 20 lifts to compare with a member, with both of your
 * best estimates beside each. The list keeps its opening order while open so rows don't jump
 * under your finger as you tick them.
 */
export function LiftPickerSheet({
  visible,
  member,
  you,
  lifts,
  selected,
  onChange,
  onClose,
}: {
  visible: boolean;
  member: Member;
  you: { display_name: string; profile_photo_url?: string | null };
  lifts: LiftComparison[];
  selected: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
  onClose: () => void;
}) {
  const { colors, radius, scheme, type } = useTheme();
  const unit = useWeightUnit();
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const ios = Platform.OS === 'ios';
  const inputRef = useRef<TextInputInstance>(null);
  const undoOfferRef = useRef(0);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [undoActive, setUndoActive] = useState(false);
  const [toastKey, setToastKey] = useState(0);
  // Fixed order while the sheet is open, matching the web's LiftPicker.
  const [ordered] = useState(() => orderLiftsForPicker(lifts, selected));
  const shown = useMemo(
    () => (query.trim() ? rankExerciseSearchMatches(ordered, query, []) : ordered),
    [ordered, query],
  );
  const full = selected.length >= MAX_HEAD_TO_HEAD_LIFTS;

  const handleClose = () => {
    undoOfferRef.current += 1;
    onClose();
  };

  const content = (
    <View style={[styles.sheetBody, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.title, { color: colors.text, flex: 1 }]}>
          Lifts to compare
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={handleClose}
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
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search exercises"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Search your exercises"
          returnKeyType="search"
          autoCorrect={false}
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
              inputRef.current?.focus();
            }}
            style={styles.clearButton}
          >
            <Icon name="close" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      <View style={styles.toolbar}>
        <Text style={[type.footnote, type.number, { color: colors.muted }]}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{selected.length}</Text> of{' '}
          {MAX_HEAD_TO_HEAD_LIFTS} chosen
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unselect all"
          accessibilityState={{ disabled: selected.length === 0 }}
          disabled={selected.length === 0}
          onPress={() => {
            haptics.selection();
            const previous = selected;
            const account = toastAccount();
            const offer = ++undoOfferRef.current;
            setUndoActive(true);
            onChange([]);
            showToast(
              'Lifts cleared',
              {
                label: 'Undo',
                run: () => {
                  if (undoOfferRef.current !== offer || !isToastAccountCurrent(account)) return;
                  undoOfferRef.current += 1;
                  setUndoActive(false);
                  haptics.selection();
                  onChange(previous);
                },
                onDismiss: () => {
                  if (undoOfferRef.current === offer) {
                    undoOfferRef.current += 1;
                    setUndoActive(false);
                  }
                },
              },
              { account },
            );
          }}
          style={styles.unselectButton}
        >
          <Text
            style={[
              type.footnote,
              {
                color: selected.length === 0 ? colors.deemph : colors.accentText,
                fontWeight: '600',
              },
            ]}
          >
            Unselect all
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => item.exercise_id}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Your exercises"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.line }]} />
        )}
        ListEmptyComponent={
          <Text
            accessibilityRole="text"
            style={[styles.empty, type.callout, { color: colors.muted }]}
          >
            No exercises match “{query.trim()}”.
          </Text>
        }
        renderItem={({ item }) => {
          const chosen = selected.includes(item.exercise_id);
          const disabled = full && !chosen;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: chosen, disabled }}
              disabled={disabled}
              onPress={() => {
                haptics.selection();
                undoOfferRef.current += 1;
                if (undoActive) {
                  setUndoActive(false);
                  setToastKey((current) => current + 1);
                }
                onChange((current) => toggleLiftSelection(current, item.exercise_id));
              }}
              style={({ pressed }) => [
                styles.row,
                pressed && !disabled && { backgroundColor: colors.surface2 },
                disabled && { opacity: 0.45 },
              ]}
            >
              <View
                style={[
                  styles.check,
                  {
                    borderColor: chosen ? colors.accent : colors.lineStrong,
                    backgroundColor: chosen ? colors.accent : 'transparent',
                  },
                ]}
              >
                {chosen && <Icon name="check" size={14} color={colors.onAccent} />}
              </View>
              <View style={styles.copy}>
                <HighlightedName value={item.name} query={query} />
                <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
                  {item.muscle_group}
                  {item.equipment ? ` · ${item.equipment}` : ''}
                </Text>
              </View>
              {(item.yours || item.theirs) && (
                <View style={styles.preview}>
                  {item.yours && (
                    <View
                      style={styles.bestRow}
                      accessibilityLabel={`You: ${formatLiftEstimate(item.yours, unit)}`}
                    >
                      <Avatar person={you} size={20} />
                      <Text
                        style={[
                          type.footnote,
                          type.number,
                          { color: colors.text, fontWeight: '600' },
                        ]}
                      >
                        {formatLiftEstimate(item.yours, unit)}
                      </Text>
                    </View>
                  )}
                  {item.theirs && (
                    <View
                      style={styles.bestRow}
                      accessibilityLabel={`${member.display_name}: ${formatLiftEstimate(item.theirs, unit)}`}
                    >
                      <Avatar person={member} size={20} />
                      <Text
                        style={[
                          type.footnote,
                          type.number,
                          { color: colors.text, fontWeight: '600' },
                        ]}
                      >
                        {formatLiftEstimate(item.theirs, unit)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );

  const sheetToast = <ToastHost key={toastKey} bottom={16} />;

  return (
    <Modal
      visible={visible}
      onRequestClose={handleClose}
      allowSwipeDismissal
      animationType={reduced ? 'none' : ios ? 'slide' : 'fade'}
      presentationStyle={ios ? 'pageSheet' : 'overFullScreen'}
      transparent={!ios}
      statusBarTranslucent={!ios}
      navigationBarTranslucent={!ios}
    >
      {ios ? (
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          {content}
          {sheetToast}
        </View>
      ) : (
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={handleClose} />
          <View
            style={[
              styles.androidCard,
              { backgroundColor: colors.surface, marginTop: insets.top + 48 },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
            {content}
            {sheetToast}
          </View>
        </View>
      )}
    </Modal>
  );
}

function HighlightedName({ value, query }: { value: string; query: string }) {
  const { colors, type } = useTheme();
  const indices = useMemo(() => new Set(fuzzyHighlightIndices(value, query)), [value, query]);
  if (!indices.size) {
    return (
      <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={2}>
        {value}
      </Text>
    );
  }
  return (
    <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={2}>
      {[...value].map((char, index) =>
        indices.has(index) ? (
          <Text key={`${char}-${index}`} style={{ color: colors.accentText, fontWeight: '700' }}>
            {char}
          </Text>
        ) : (
          char
        ),
      )}
    </Text>
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
  sheetBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 10 },
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  unselectButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  list: { flex: 1, marginHorizontal: -20 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  separator: { height: StyleSheet.hairlineWidth },
  empty: { textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  preview: { alignItems: 'flex-end', gap: 4 },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
