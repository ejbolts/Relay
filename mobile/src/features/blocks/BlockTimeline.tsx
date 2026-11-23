import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import {
  timelineCentreYear,
  timelineMarks,
  timelineSpan,
  timelineX,
  timelineZoom,
  zoomAbout,
} from '../../../../frontend/src/blockTimelineGeometry';
import { blockYearSegments } from '../../../../frontend/src/trainingBlockSegments';
import { blockRange } from '../../../../frontend/src/trainingBlocks';
import type { TrainingBlocks } from '../../../../frontend/src/types';
import { useTheme } from '../../ui/theme';
import { nativeBlockColor } from './BlockScopeChip';

const DARK_INK = '#0b0d0f';

/**
 * Every block on one continuous timeline, as the web's ScrollTimeline: swipe through the years
 * and pinch to zoom, from all the history in view to about two weeks across; month and then week
 * lines appear once there is room. The geometry is the web's (frontend/src/blockTimelineGeometry).
 */
export function BlockTimeline({
  config,
  today,
  selected,
  onSelect,
  onCentreYear,
  scrollRequest = null,
  barHeight = 34,
}: {
  config: TrainingBlocks;
  today: string;
  selected: string | null;
  onSelect: (blockId: string) => void;
  /** Reports the year in the middle of the view as the timeline scrolls. */
  onCentreYear?: (year: number) => void;
  /** Scrolls so the date is at the left edge; a new key repeats the request. */
  scrollRequest?: { date: string; key: number } | null;
  barHeight?: number;
}) {
  const { colors, type, radius } = useTheme();
  const [width, setWidth] = useState(0);
  const view = width || 320;
  const span = timelineSpan(config, today);
  const [chosenZoom, setChosenZoom] = useState<number | null>(null);
  const zoom = timelineZoom(chosenZoom, view, span.total);
  const x = (day: string) => timelineX(span, zoom, day);
  const scroller = useRef<ScrollViewInstance>(null);
  const scrollLeft = useRef(0);
  const pendingScroll = useRef<number | null>(null);
  const placed = useRef(false);
  const pinchZoom = useRef<number | null>(null);
  const reportedYear = useRef<number | null>(null);

  // After a zoom, keep the date under the fingers in place; on first layout, open with today a
  // little right of centre so recent blocks lead into it.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !width) return;
    if (pendingScroll.current !== null) {
      element.scrollTo({ x: Math.max(0, pendingScroll.current), animated: false });
      scrollLeft.current = Math.max(0, pendingScroll.current);
      pendingScroll.current = null;
    } else if (!placed.current) {
      placed.current = true;
      const left = Math.max(0, timelineX(span, zoom, today) - width * 0.6);
      element.scrollTo({ x: left, animated: false });
      scrollLeft.current = left;
    }
  });

  const requestKey = scrollRequest?.key;
  useEffect(() => {
    if (!scrollRequest) return;
    scroller.current?.scrollTo({ x: timelineX(span, zoom, scrollRequest.date), animated: true });
    // Only a new request scrolls; zooming keeps the reader's place instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const pinch = usePinchGesture({
    runOnJS: true,
    onUpdate: (event) => {
      pinchZoom.current ??= zoom;
      const next = zoomAbout(
        scrollLeft.current,
        event.focalX,
        zoom,
        pinchZoom.current * event.scale,
        view,
        span.total,
      );
      pendingScroll.current = next.scrollLeft;
      setChosenZoom(next.zoom);
    },
    onFinalize: () => {
      pinchZoom.current = null;
    },
  });

  const { lines, labels } = timelineMarks(span, zoom);
  const segments = blockYearSegments(config, today);
  const todayShown = today >= span.start && today < span.end;
  return (
    <GestureDetector gesture={pinch}>
      <View
        accessibilityLabel="Training timeline, pinch to zoom"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(event) => {
            const left = event.nativeEvent.contentOffset.x;
            scrollLeft.current = left;
            const year = timelineCentreYear(span, zoom, left, view);
            if (onCentreYear && year !== null && year !== reportedYear.current) {
              reportedYear.current = year;
              onCentreYear(year);
            }
          }}
        >
          <View style={{ width: span.total * zoom, gap: 4 }}>
            <View
              style={[
                styles.bar,
                { height: barHeight, backgroundColor: colors.surface2, borderRadius: radius.sm },
              ]}
            >
              {lines.map((line) => (
                <View
                  key={line.key}
                  pointerEvents="none"
                  style={[
                    styles.line,
                    {
                      left: line.left,
                      backgroundColor: line.kind === 'year' ? colors.muted : colors.line,
                      opacity: line.kind === 'week' ? 0.5 : 1,
                    },
                  ]}
                />
              ))}
              {segments.map((segment) => {
                const left = x(segment.start);
                const spanWidth = x(segment.end) - left;
                const block = config.blocks.find((item) => item.id === segment.blockId);
                const isSelected = !!segment.blockId && segment.blockId === selected;
                const style = [
                  styles.segment,
                  {
                    left: left + 1,
                    width: Math.max(3, spanWidth - 2),
                    backgroundColor: segment.color
                      ? nativeBlockColor(segment.color, colors)
                      : colors.surface3,
                    opacity: segment.planned ? 0.35 : 1,
                    borderColor: isSelected ? colors.text : 'transparent',
                  },
                ] as const;
                const label =
                  !segment.planned && spanWidth >= 36 ? (
                    <Text
                      style={[
                        type.caption,
                        {
                          color: segment.color ? DARK_INK : colors.secondary,
                          fontWeight: '600',
                        },
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="clip"
                    >
                      {segment.name}
                    </Text>
                  ) : null;
                if (!block || segment.planned)
                  return (
                    <View key={segment.key} pointerEvents="none" style={style}>
                      {label}
                    </View>
                  );
                return (
                  <Pressable
                    key={segment.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${block.name}, ${blockRange(block.start_date, block.end_date)}`}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => onSelect(block.id)}
                    style={style}
                  >
                    {label}
                  </Pressable>
                );
              })}
              {todayShown && (
                <View
                  pointerEvents="none"
                  style={[styles.today, { left: x(today), backgroundColor: colors.text }]}
                />
              )}
            </View>
            <View style={styles.axis} importantForAccessibility="no-hide-descendants">
              {labels.map((label) => (
                <Text
                  key={label.key}
                  style={[
                    type.caption,
                    styles.label,
                    {
                      left: label.left,
                      color: label.year ? colors.text : colors.muted,
                      fontWeight: label.year ? '700' : '400',
                    },
                  ]}
                >
                  {label.text}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  bar: { overflow: 'hidden' },
  line: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  segment: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  today: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  axis: { height: 16 },
  label: { position: 'absolute', top: 0, paddingLeft: 3 },
});
