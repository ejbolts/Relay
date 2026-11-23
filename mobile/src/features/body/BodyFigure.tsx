import { useId, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Defs, G, Line, Mask, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import {
  EDITOR_WIDTH,
  FIGURE_HALF_WIDTH,
  FIGURE_HEIGHT,
  FIGURE_TOP,
  LABEL_GAP,
  LABEL_WIDTH,
  LEADER_START,
  bodyFigureCallouts,
  bodyFigureLabelName,
} from '../../../../frontend/src/bodyFigureLayout';
import {
  BODY_FIGURES,
  bodyFigurePath,
  type BodyFigureKind,
} from '../../../../frontend/src/bodyFigureShapes';
import type { BodySizeField } from '../../../../frontend/src/bodySizes';
import { useTheme } from '../../ui/theme';

const WIDTH = FIGURE_HALF_WIDTH * 2;

/**
 * The web's body outline with every measurement drawn across the part it measures and labelled
 * beside it (frontend/src/bodyFigureLayout.ts places them). Each label is a button; while
 * `editing` names one, a number box takes the place of its value so it can be typed in place.
 */
export function BodyFigure({
  kind,
  values,
  carried,
  unit,
  onPick,
  editing,
  editValue,
  invalid,
  onCommit,
  onCancel,
}: {
  kind: BodyFigureKind;
  /** Shown values by field; a field left out has an empty label. */
  values: Partial<Record<BodySizeField, string>>;
  /** Values from an earlier entry than the one shown, drawn muted. */
  carried: ReadonlySet<BodySizeField>;
  unit: string;
  onPick: (field: BodySizeField) => void;
  editing: BodySizeField | null;
  editValue: string;
  invalid: boolean;
  /** Called with the typed text; returns whether the box can close. */
  onCommit: (field: BodySizeField, text: string) => boolean;
  onCancel: () => void;
}) {
  const { colors, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const shape = BODY_FIGURES[kind];
  const outline = useMemo(() => bodyFigurePath(shape.half), [shape]);
  const extras = shape.extras ?? [];
  const maskId = `body-figure-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const callouts = useMemo(() => bodyFigureCallouts(kind, () => true), [kind]);
  const scale = width / WIDTH;
  const frame = { x: -FIGURE_HALF_WIDTH, y: FIGURE_TOP, width: WIDTH, height: FIGURE_HEIGHT };
  const active = callouts.find((item) => item.field === editing);
  const px = (x: number) => (x + FIGURE_HALF_WIDTH) * scale;
  const py = (y: number) => (y - FIGURE_TOP) * scale;
  // About how wide " cm" or " in" is at the unit's size, in figure units.
  const unitWidth = 22 * 0.56 * unit.length + 14;

  return (
    <View
      accessibilityLabel="Measurements on the body"
      style={[styles.frame, { aspectRatio: WIDTH / FIGURE_HEIGHT }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Svg
          width={width}
          height={width / (WIDTH / FIGURE_HEIGHT)}
          viewBox={`${-FIGURE_HALF_WIDTH} ${FIGURE_TOP} ${WIDTH} ${FIGURE_HEIGHT}`}
          accessible={false}
        >
          {extras.length > 0 && (
            <Defs>
              <Mask id={`${maskId}-outline`} maskUnits="userSpaceOnUse" {...frame}>
                <Rect {...frame} fill="white" />
                {extras.map((d) => (
                  <Path key={d} d={d} fill="black" />
                ))}
              </Mask>
              <Mask id={`${maskId}-extras`} maskUnits="userSpaceOnUse" {...frame}>
                <Rect {...frame} fill="white" />
                <Path d={outline} fill="black" />
              </Mask>
            </Defs>
          )}
          {/* Leaders sit under the outline, so one reaching the torso passes behind the arm. */}
          {callouts.map((item) => (
            <Line
              key={`leader-${item.field}`}
              x1={item.column * LEADER_START}
              y1={item.labelY}
              x2={item.column < 0 ? item.from : item.to}
              y2={item.y}
              stroke={colors.lineStrong}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <Path d={outline} fill={colors.surface2} />
          {extras.map((d) => (
            <Path key={d} d={d} fill={colors.surface2} />
          ))}
          <Path
            d={outline}
            fill="none"
            stroke={colors.muted}
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            mask={extras.length > 0 ? `url(#${maskId}-outline)` : undefined}
          />
          {extras.map((d) => (
            <Path
              key={`edge-${d}`}
              d={d}
              fill="none"
              stroke={colors.muted}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              mask={`url(#${maskId}-extras)`}
            />
          ))}
          {shape.hairline && (
            <Path
              d={shape.hairline}
              fill="none"
              stroke={colors.muted}
              strokeWidth={1.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {callouts.map((item) => {
            const value = values[item.field];
            const earlier = Boolean(value && carried.has(item.field));
            const x = item.column * (FIGURE_HALF_WIDTH - 12);
            const anchor = item.column < 0 ? 'start' : 'end';
            return (
              <G key={item.field}>
                <Line
                  x1={item.from}
                  x2={item.to}
                  y1={item.y}
                  y2={item.y}
                  stroke={colors.accentText}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={value ? 1 : 0.4}
                  vectorEffect="non-scaling-stroke"
                />
                <SvgText
                  x={x}
                  y={item.labelY - 8}
                  fontSize={23}
                  fill={colors.muted}
                  textAnchor={anchor}
                >
                  {item.name}
                </SvgText>
                {value && item.field !== editing && (
                  <>
                    {/* A right-aligned text drops a trailing span on Android, so the unit is
                        its own text there, set left of the column edge by its width. */}
                    <SvgText
                      x={item.column < 0 ? x : x - unitWidth}
                      y={item.labelY + 25}
                      fontSize={34}
                      fontWeight={earlier ? '500' : '700'}
                      fill={earlier ? colors.muted : colors.text}
                      textAnchor={anchor}
                    >
                      {value}
                      {item.column < 0 && (
                        <TSpan fontSize={22} fontWeight="400" fill={colors.muted}>
                          {` ${unit}`}
                        </TSpan>
                      )}
                    </SvgText>
                    {item.column > 0 && (
                      <SvgText
                        x={x}
                        y={item.labelY + 25}
                        fontSize={22}
                        fill={colors.muted}
                        textAnchor="end"
                      >
                        {unit}
                      </SvgText>
                    )}
                  </>
                )}
              </G>
            );
          })}
        </Svg>
      )}
      {width > 0 &&
        callouts.map((item) => {
          const value = values[item.field];
          const left = item.column < 0 ? -FIGURE_HALF_WIDTH : FIGURE_HALF_WIDTH - LABEL_WIDTH;
          return (
            <Pressable
              key={`hit-${item.field}`}
              accessibilityRole="button"
              accessibilityLabel={bodyFigureLabelName(
                item.name,
                value,
                Boolean(value && carried.has(item.field)),
                unit,
              )}
              onPress={() => onPick(item.field)}
              style={({ pressed }) => [
                styles.hit,
                {
                  left: px(left),
                  top: py(item.labelY + 2 - (LABEL_GAP - 6) / 2),
                  width: LABEL_WIDTH * scale,
                  height: (LABEL_GAP - 6) * scale,
                  borderRadius: 16 * scale,
                },
                pressed && { backgroundColor: colors.surface2 },
              ]}
            />
          );
        })}
      {active && width > 0 && (
        <InlineEditor
          key={active.field}
          name={active.name}
          unit={unit}
          initial={editValue}
          invalid={invalid}
          side={active.column < 0 ? 'left' : 'right'}
          scheme={scheme}
          style={{
            left: px(
              active.column < 0 ? -FIGURE_HALF_WIDTH + 4 : FIGURE_HALF_WIDTH - 4 - EDITOR_WIDTH,
            ),
            top: py(active.labelY - 4),
            width: EDITOR_WIDTH * scale,
          }}
          onCommit={(text) => onCommit(active.field, text)}
          onCancel={onCancel}
        />
      )}
    </View>
  );
}

/** The number box for one measurement: Done or leaving it saves. */
function InlineEditor({
  name,
  unit,
  initial,
  invalid,
  side,
  scheme,
  style,
  onCommit,
  onCancel,
}: {
  name: string;
  unit: string;
  initial: string;
  invalid: boolean;
  side: 'left' | 'right';
  scheme: 'light' | 'dark';
  style: { left: number; top: number; width: number };
  onCommit: (text: string) => boolean;
  onCancel: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [text, setText] = useState(initial);
  // Set once the box has finished, so the blur from closing the keyboard doesn't save again.
  const finished = useRef(false);
  const commit = () => {
    if (finished.current) return;
    if (onCommit(text)) finished.current = true;
  };
  return (
    <View
      style={[
        styles.editor,
        style,
        {
          borderColor: invalid ? colors.danger : colors.accent,
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
        },
      ]}
    >
      <TextInput
        autoFocus
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        keyboardAppearance={scheme}
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={`${name} (${unit})`}
        onSubmitEditing={commit}
        onBlur={() => {
          if (!finished.current && !text.trim()) {
            finished.current = true;
            onCancel();
          } else commit();
        }}
        style={[
          type.body,
          type.number,
          styles.editorInput,
          { color: colors.text, textAlign: side === 'right' ? 'right' : 'left' },
        ]}
      />
      <Text style={[type.footnote, { color: colors.muted }]}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  hit: { position: 'absolute' },
  editor: {
    position: 'absolute',
    height: 36,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  editorInput: { flex: 1, minWidth: 0, paddingVertical: 0 },
});
