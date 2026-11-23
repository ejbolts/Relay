import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type AnimatedStyle,
} from 'react-native-reanimated';
import {
  dropHomeSection,
  findHomeDropTarget,
  homeSection,
  homeSectionGridRows,
  moveHomeSection,
  stepHomeSection,
  toggleHomeSection,
  toggleHomeSectionWidth,
  type HomeDropRect,
  type HomeDropTarget,
  type HomeLayout,
  type HomeSectionGap,
  type HomeSectionId,
} from '../../../../frontend/src/homeLayout';
import { cardSurface } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon, type IconName, type IconPair } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { CARD_SETTINGS } from './CardSettings';
import { homeIcons } from './homeIcons';

const widthName = (span: number) => (span === 3 ? 'Half width' : span === 2 ? 'Third width' : '');

const targetKey = (target: HomeDropTarget | null) =>
  !target ? null : target.kind === 'gap' ? `gap:${target.after}` : `card:${target.id}`;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ActiveDrag {
  id: HomeSectionId;
  startTouchX: number;
  startTouchY: number;
  startScrollY: number;
  translationX: number;
  translationY: number;
  absoluteY: number;
}

interface HomeLayoutGridProps {
  draft: HomeLayout;
  visible: HomeSectionId[];
  disabled: boolean;
  scrollRef: RefObject<ScrollViewInstance | null>;
  scrollMetricsRef: RefObject<{ y: number; height: number; contentHeight: number }>;
  onChange: (next: HomeLayout) => void;
  onCustomise: (id: HomeSectionId) => void;
  onAddInGap: (gap: HomeSectionGap) => void;
  onDraggingChange: (dragging: boolean) => void;
}

/**
 * Six-column grid of Home cards for Edit Home, matching the web's rows and trailing empty slots.
 * Long-press and drag any card onto another card to reorder, or into a row's empty space to pack
 * it beside its neighbour without resizing the rest of the row. Keeps all accessible move/hide/more
 * buttons for screen readers.
 */
export function HomeLayoutGrid({
  draft,
  visible,
  disabled,
  scrollRef,
  scrollMetricsRef,
  onChange,
  onCustomise,
  onAddInGap,
  onDraggingChange,
}: HomeLayoutGridProps) {
  const { colors, type, radius } = useTheme();
  const rows = homeSectionGridRows(visible, draft.widths);
  const [draggingId, setDraggingId] = useState<HomeSectionId | null>(null);
  const [overTarget, setOverTarget] = useState<HomeDropTarget | null>(null);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const dragAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: dragScale.value },
    ],
  }));

  const rowLayoutsRef = useRef<Record<string, Box>>({});
  const slotLayoutsRef = useRef<Record<string, { rowKey: string; box: Box }>>({});
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const overTargetRef = useRef<HomeDropTarget | null>(null);
  const latestRef = useRef({ draft, rows, onChange });
  const updateTargetRef = useRef<(drag: ActiveDrag) => void>(() => undefined);

  useEffect(() => {
    latestRef.current = { draft, rows, onChange };
  });

  useEffect(() => {
    onDraggingChange(draggingId !== null);
  }, [draggingId, onDraggingChange]);

  function buildDropRects(): HomeDropRect[] {
    const rects: HomeDropRect[] = [];
    for (const row of latestRef.current.rows) {
      const rowKey = row.items.map((item) => item.id).join(',');
      const rowBox = rowLayoutsRef.current[rowKey];
      if (!rowBox) continue;
      for (const item of row.items) {
        const slot = slotLayoutsRef.current[`card:${item.id}`];
        if (!slot || slot.rowKey !== rowKey) continue;
        rects.push({
          target: { kind: 'card', id: item.id },
          x: rowBox.x + slot.box.x,
          y: rowBox.y + slot.box.y,
          width: slot.box.width,
          height: slot.box.height,
        });
      }
      if (row.gap) {
        const slot = slotLayoutsRef.current[`gap:${row.gap.after}`];
        if (slot && slot.rowKey === rowKey) {
          rects.push({
            target: { kind: 'gap', after: row.gap.after, span: row.gap.span },
            x: rowBox.x + slot.box.x,
            y: rowBox.y + slot.box.y,
            width: slot.box.width,
            height: slot.box.height,
          });
        }
      }
    }
    return rects;
  }

  function updateTargetForDrag(drag: ActiveDrag) {
    const sourceSlot = slotLayoutsRef.current[`card:${drag.id}`];
    const sourceRow = sourceSlot ? rowLayoutsRef.current[sourceSlot.rowKey] : undefined;
    if (!sourceSlot || !sourceRow) return;
    const scrollDelta = scrollMetricsRef.current.y - drag.startScrollY;
    const pointerX = sourceRow.x + sourceSlot.box.x + drag.startTouchX + drag.translationX;
    const pointerY =
      sourceRow.y + sourceSlot.box.y + drag.startTouchY + drag.translationY + scrollDelta;
    const next = findHomeDropTarget(buildDropRects(), drag.id, pointerX, pointerY);
    if (targetKey(next) !== targetKey(overTargetRef.current)) {
      overTargetRef.current = next;
      setOverTarget(next);
      if (next) haptics.selection();
    }
  }

  useEffect(() => {
    updateTargetRef.current = updateTargetForDrag;
  });

  // Keep scrolling smoothly while a dragged card is held near the top or bottom edge.
  useEffect(() => {
    if (!draggingId) return;
    let frame = 0;
    const tick = () => {
      const drag = activeDragRef.current;
      if (!drag) return;
      const metrics = scrollMetricsRef.current;
      if (metrics.height > 0 && metrics.contentHeight > metrics.height) {
        const edge = 110;
        const delta =
          drag.absoluteY < edge + 60 ? -10 : drag.absoluteY > metrics.height - edge ? 10 : 0;
        if (delta !== 0) {
          const maxScroll = Math.max(0, metrics.contentHeight - metrics.height);
          const nextY = Math.max(0, Math.min(maxScroll, metrics.y + delta));
          if (nextY !== metrics.y) {
            metrics.y = nextY;
            scrollRef.current?.scrollTo({ y: nextY, animated: false });
            dragY.set(drag.translationY + (nextY - drag.startScrollY));
            updateTargetRef.current(drag);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draggingId, dragY, scrollMetricsRef, scrollRef]);

  function startDrag(id: HomeSectionId, x: number, y: number, absoluteY: number) {
    if (disabled || activeDragRef.current) return;
    haptics.press();
    const drag: ActiveDrag = {
      id,
      startTouchX: x,
      startTouchY: y,
      startScrollY: scrollMetricsRef.current.y,
      translationX: 0,
      translationY: 0,
      absoluteY,
    };
    activeDragRef.current = drag;
    overTargetRef.current = null;
    dragX.set(0);
    dragY.set(0);
    dragScale.set(1.03);
    setDraggingId(id);
    setOverTarget(null);
  }

  function moveDrag(
    id: HomeSectionId,
    translationX: number,
    translationY: number,
    absoluteY: number,
  ) {
    const drag = activeDragRef.current;
    if (!drag || drag.id !== id) return;
    drag.translationX = translationX;
    drag.translationY = translationY;
    drag.absoluteY = absoluteY;
    const scrollDelta = scrollMetricsRef.current.y - drag.startScrollY;
    dragX.set(translationX);
    dragY.set(translationY + scrollDelta);
    updateTargetForDrag(drag);
  }

  function finishDrag(id: HomeSectionId, canceled: boolean) {
    const drag = activeDragRef.current;
    if (!drag || drag.id !== id) return;
    const target = overTargetRef.current;
    activeDragRef.current = null;
    overTargetRef.current = null;
    dragX.set(0);
    dragY.set(0);
    dragScale.set(1);
    setDraggingId(null);
    setOverTarget(null);
    if (!canceled && target) {
      const next = dropHomeSection(latestRef.current.draft, id, target);
      if (next !== latestRef.current.draft) {
        latestRef.current.onChange(next);
      }
    }
  }

  const title = (id: HomeSectionId) => homeSection(id).title;

  if (visible.length === 0) {
    return (
      <View style={cardSurface(colors)}>
        <Text style={[type.footnote, styles.empty, { color: colors.muted }]}>
          Add a section below, or reset the layout.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {rows.map((row) => {
        const rowKey = row.items.map((item) => item.id).join(',');
        const rowHasDragged =
          draggingId !== null && row.items.some((item) => item.id === draggingId);
        const isThirdRow =
          row.items.every((item) => item.span === 2) && (!row.gap || row.gap.span === 2);
        return (
          <View
            key={rowKey}
            onLayout={(event: LayoutChangeEvent) => {
              rowLayoutsRef.current[rowKey] = event.nativeEvent.layout;
            }}
            style={[
              styles.gridRow,
              { gap: isThirdRow ? 8 : 10 },
              rowHasDragged && styles.draggedRow,
            ]}
          >
            {row.items.map((item) => {
              const index = visible.indexOf(item.id);
              const span = item.span;
              const isDragged = draggingId === item.id;
              const isDropTarget = overTarget?.kind === 'card' && overTarget.id === item.id;
              const items: MenuItem[] = [
                ...(CARD_SETTINGS[item.id]
                  ? [{ label: 'Customise…', onPress: () => onCustomise(item.id) }]
                  : []),
                {
                  label: span === 6 ? 'Compact width' : 'Full width',
                  onPress: () => onChange(toggleHomeSectionWidth(draft, item.id, span)),
                },
                ...(index > 0
                  ? [
                      {
                        label: 'Move to top',
                        onPress: () => onChange(moveHomeSection(draft, item.id, visible[0])),
                      },
                    ]
                  : []),
              ];
              return (
                <View
                  key={item.id}
                  onLayout={(event: LayoutChangeEvent) => {
                    slotLayoutsRef.current[`card:${item.id}`] = {
                      rowKey,
                      box: event.nativeEvent.layout,
                    };
                  }}
                  style={[{ flex: span, minWidth: 0 }, isDragged && styles.draggedSlot]}
                >
                  {isDragged && (
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFill,
                        styles.placeholder,
                        {
                          borderColor: colors.accent,
                          backgroundColor: colors.accentSoft,
                          borderRadius: radius.lg,
                        },
                      ]}
                    />
                  )}
                  <DraggableSectionCard
                    id={item.id}
                    title={title(item.id)}
                    span={span}
                    index={index}
                    total={visible.length}
                    menuItems={items}
                    disabled={disabled}
                    isDragged={isDragged}
                    isDropTarget={isDropTarget}
                    anyDragging={draggingId !== null}
                    dragAnimatedStyle={dragAnimatedStyle}
                    onHide={() => {
                      onChange(toggleHomeSection(draft, item.id));
                      showToast(`${title(item.id)} hidden`);
                    }}
                    onMoveUp={() => onChange(stepHomeSection(draft, visible, item.id, -1))}
                    onMoveDown={() => onChange(stepHomeSection(draft, visible, item.id, 1))}
                    onDragStart={startDrag}
                    onDragMove={moveDrag}
                    onDragEnd={finishDrag}
                  />
                </View>
              );
            })}
            {row.gap && (
              <EmptyDropSpace
                gap={row.gap}
                afterTitle={title(row.gap.after)}
                highlighted={overTarget?.kind === 'gap' && overTarget.after === row.gap.after}
                disabled={disabled || draggingId !== null}
                onLayout={(event) => {
                  slotLayoutsRef.current[`gap:${row.gap!.after}`] = {
                    rowKey,
                    box: event.nativeEvent.layout,
                  };
                }}
                onPress={() => onAddInGap(row.gap!)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function DraggableSectionCard({
  id,
  title,
  span,
  index,
  total,
  menuItems,
  disabled,
  isDragged,
  isDropTarget,
  anyDragging,
  dragAnimatedStyle,
  onHide,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  id: HomeSectionId;
  title: string;
  span: number;
  index: number;
  total: number;
  menuItems: MenuItem[];
  disabled: boolean;
  isDragged: boolean;
  isDropTarget: boolean;
  anyDragging: boolean;
  dragAnimatedStyle: AnimatedStyle<ViewStyle>;
  onHide: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (id: HomeSectionId, x: number, y: number, absoluteY: number) => void;
  onDragMove: (
    id: HomeSectionId,
    translationX: number,
    translationY: number,
    absoluteY: number,
  ) => void;
  onDragEnd: (id: HomeSectionId, canceled: boolean) => void;
}) {
  const { colors, type } = useTheme();
  const controlsDisabled = disabled || anyDragging;
  const pan = usePanGesture({
    enabled: !disabled && (!anyDragging || isDragged),
    activateAfterLongPress: 250,
    runOnJS: true,
    onActivate: (event) => onDragStart(id, event.x, event.y, event.absoluteY),
    onUpdate: (event) => onDragMove(id, event.translationX, event.translationY, event.absoluteY),
    onDeactivate: (event) => onDragEnd(id, event.canceled),
    onFinalize: (event) => onDragEnd(id, event.canceled),
  });

  const surface = cardSurface(colors);
  const highlightStyle = isDropTarget
    ? { borderColor: colors.accent, borderWidth: 2 }
    : isDragged
      ? {
          borderColor: colors.accent,
          shadowColor: colors.shadow,
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }
      : undefined;

  const menu = (compact: boolean) => (
    <View style={[styles.menuTouch, compact ? styles.menuOuterCompact : styles.menuOuter]}>
      <View
        pointerEvents="none"
        style={[
          compact ? styles.roundCompact : styles.round,
          styles.menuFace,
          { backgroundColor: colors.surface2 },
        ]}
      />
      <MenuButton
        accessibilityLabel={`More for ${title}`}
        items={menuItems}
        trigger={{ sf: 'ellipsis', color: colors.text, size: compact ? 14 : 15 }}
        width={TOUCH}
        height={TOUCH}
        fill={NEARLY_CLEAR}
      >
        <View style={styles.menuTouch}>
          <Icon name="more" size={compact ? 16 : 18} color={colors.text} />
        </View>
      </MenuButton>
    </View>
  );

  let content;
  if (span === 6) {
    content = (
      <View style={styles.fullRow}>
        <View style={styles.gripWrap} accessible={false}>
          <Icon name={homeIcons.grip} size={16} color={colors.muted} />
        </View>
        <RoundButton
          icon={homeIcons.remove}
          color={colors.danger}
          plain
          label={`Hide ${title}`}
          disabled={controlsDisabled}
          onPress={onHide}
        />
        <Text style={[type.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        <RoundButton
          icon="chevronUp"
          color={colors.text}
          label={`Move ${title} up`}
          disabled={controlsDisabled || index === 0}
          onPress={onMoveUp}
        />
        <RoundButton
          icon="chevronDown"
          color={colors.text}
          label={`Move ${title} down`}
          disabled={controlsDisabled || index === total - 1}
          onPress={onMoveDown}
        />
        {menu(false)}
      </View>
    );
  } else if (span >= 3) {
    content = (
      <View style={styles.halfCard}>
        <View style={styles.compactTop}>
          <RoundButton
            icon={homeIcons.remove}
            color={colors.danger}
            plain
            compact
            label={`Hide ${title}`}
            disabled={controlsDisabled}
            onPress={onHide}
          />
          <Text
            style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {menu(true)}
        </View>
        <View style={styles.compactBottom}>
          <View style={styles.gripLabel}>
            <Icon name={homeIcons.grip} size={14} color={colors.muted} />
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
              {widthName(span)}
            </Text>
          </View>
          <View style={styles.stepButtons}>
            <RoundButton
              icon="chevronUp"
              color={colors.text}
              compact
              label={`Move ${title} up`}
              disabled={controlsDisabled || index === 0}
              onPress={onMoveUp}
            />
            <RoundButton
              icon="chevronDown"
              color={colors.text}
              compact
              label={`Move ${title} down`}
              disabled={controlsDisabled || index === total - 1}
              onPress={onMoveDown}
            />
          </View>
        </View>
      </View>
    );
  } else {
    content = (
      <View style={styles.thirdCard}>
        <View style={styles.compactTop}>
          <RoundButton
            icon={homeIcons.remove}
            color={colors.danger}
            plain
            compact
            label={`Hide ${title}`}
            disabled={controlsDisabled}
            onPress={onHide}
          />
          <View style={{ flex: 1, alignItems: 'center' }} accessible={false}>
            <Icon name={homeIcons.grip} size={14} color={colors.muted} />
          </View>
          {menu(true)}
        </View>
        <View style={styles.thirdBody}>
          <Text
            style={[type.footnote, { color: colors.text, fontWeight: '600' }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {widthName(span)}
          </Text>
        </View>
        <View style={styles.thirdStepRow}>
          <RoundButton
            icon="chevronUp"
            color={colors.text}
            compact
            label={`Move ${title} up`}
            disabled={controlsDisabled || index === 0}
            onPress={onMoveUp}
          />
          <RoundButton
            icon="chevronDown"
            color={colors.text}
            compact
            label={`Move ${title} down`}
            disabled={controlsDisabled || index === total - 1}
            onPress={onMoveDown}
          />
        </View>
      </View>
    );
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID={`home-layout-card-${id}`}
        accessibilityHint="Hold and drag to reorder or move into an empty space"
        style={[surface, styles.cardFrame, highlightStyle, isDragged && dragAnimatedStyle]}
      >
        {content}
      </Animated.View>
    </GestureDetector>
  );
}

function EmptyDropSpace({
  gap,
  afterTitle,
  highlighted,
  disabled,
  onLayout,
  onPress,
}: {
  gap: HomeSectionGap;
  afterTitle: string;
  highlighted: boolean;
  disabled: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  const { colors, type, radius } = useTheme();
  return (
    <Pressable
      testID={`home-drop-space-${gap.after}`}
      accessibilityRole="button"
      accessibilityLabel={`Add a section after ${afterTitle}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onLayout={onLayout}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dropSpace,
        {
          flex: gap.span,
          borderRadius: radius.lg,
          borderColor: highlighted ? colors.accent : colors.lineStrong,
          borderWidth: highlighted ? 2 : 1.5,
          backgroundColor: highlighted ? colors.accentSoft : 'transparent',
        },
        pressed && !highlighted && { opacity: 0.7 },
      ]}
    >
      <Icon name="plus" size={20} color={colors.accentText} />
      <Text
        style={[
          type.footnote,
          { color: highlighted ? colors.accentText : colors.muted, fontWeight: '600' },
        ]}
        numberOfLines={2}
      >
        Add a section
      </Text>
      <Text
        style={[type.caption, { color: highlighted ? colors.accentText : colors.muted }]}
        numberOfLines={2}
      >
        or drag one here
      </Text>
    </Pressable>
  );
}

export function RoundButton({
  icon,
  color,
  label,
  disabled = false,
  plain = false,
  compact = false,
  onPress,
}: {
  icon: IconName | IconPair;
  color: string;
  label: string;
  disabled?: boolean;
  /** Just the icon, as the list's red remove and green add buttons. */
  plain?: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={compact ? 6 : 4}
      onPress={onPress}
      style={({ pressed }) => [
        compact ? styles.roundCompact : styles.round,
        !plain && { backgroundColor: colors.surface2 },
        (pressed || disabled) && { opacity: disabled ? 0.3 : 0.6 },
      ]}
    >
      <Icon name={icon} size={plain ? (compact ? 22 : 24) : compact ? 16 : 18} color={color} />
    </Pressable>
  );
}

const ROUND = 38;
const ROUND_COMPACT = 32;
const TOUCH = 44;
// SwiftUI skips fully clear backgrounds when hit-testing; this one still takes taps.
const NEARLY_CLEAR = 'rgba(0,0,0,0.01)';

const styles = StyleSheet.create({
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', alignItems: 'stretch' },
  draggedRow: { zIndex: 100, elevation: 10 },
  draggedSlot: { zIndex: 100 },
  cardFrame: { flex: 1, justifyContent: 'center' },
  placeholder: { borderWidth: 1.5, borderStyle: 'dashed' },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  gripWrap: { width: 18, alignItems: 'center', justifyContent: 'center' },
  halfCard: { padding: 10, gap: 10, flex: 1, justifyContent: 'space-between' },
  thirdCard: { padding: 8, gap: 8, flex: 1, justifyContent: 'space-between' },
  compactTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  gripLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  stepButtons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thirdBody: { gap: 2 },
  thirdStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropSpace: {
    minWidth: 0,
    minHeight: 84,
    padding: 10,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundCompact: {
    width: ROUND_COMPACT,
    height: ROUND_COMPACT,
    borderRadius: ROUND_COMPACT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: 16 },
  menuTouch: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  menuFace: { position: 'absolute' },
  // The frame overhangs the circle by 3 pt a side; keep the circles evenly spaced.
  menuOuter: { marginHorizontal: -(TOUCH - ROUND) / 2 },
  menuOuterCompact: { marginHorizontal: -(TOUCH - ROUND_COMPACT) / 2 },
});
