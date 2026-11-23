import { Host as ComposeHost, Slider as ComposeSlider } from '@expo/ui/jetpack-compose';
import { Host, Slider as SwiftSlider } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import SegmentedControl, {
  type SegmentedControlProps,
} from '@react-native-segmented-control/segmented-control';
import { useState, type ComponentType, type Ref } from 'react';
import {
  Platform,
  Pressable,
  Switch as NativeSwitch,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { haptics } from './haptics';
import { useTheme } from './theme';

// Native controls in Pulse's colours: UISegmentedControl, UISwitch and SwiftUI's slider on iOS,
// their Material equivalents on Android, and the web's input look for text.

// The package's class typings predate React 19's JSX types; the component itself is fine.
const NativeSegmentedControl = SegmentedControl as unknown as ComponentType<SegmentedControlProps>;

/**
 * A segmented control, as the web's .segmented-control: UISegmentedControl on iOS; on Android the
 * web's own look drawn here, since the package's Android control names its choices "0", "1"…
 * for screen readers. Both are 44 pt tall, the web's control with its border and padding.
 */
export function Segmented({
  values,
  selectedIndex,
  onChange,
  accessibilityLabel,
  enabled = true,
  style,
}: {
  values: readonly string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  accessibilityLabel: string;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme, colors } = useTheme();
  const choose = (index: number) => {
    if (index === selectedIndex) return;
    haptics.selection();
    onChange(index);
  };
  if (Platform.OS !== 'ios')
    return (
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.segments,
          { backgroundColor: colors.surface, borderColor: colors.line },
          !enabled && { opacity: 0.45 },
          style,
        ]}
      >
        {values.map((label, index) => {
          const selected = index === selectedIndex;
          // Each choice is a full-height 44 pt pressable; the pill inside it is the web's 36 pt.
          return (
            <Pressable
              key={`${index}-${label}`}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected, checked: selected, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => choose(index)}
              style={styles.segment}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.segmentPill,
                    selected && { backgroundColor: colors.surface3 },
                    pressed && !selected && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.segmentText, { color: selected ? colors.text : colors.muted }]}
                  >
                    {label}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  return (
    <NativeSegmentedControl
      accessibilityLabel={accessibilityLabel}
      values={[...values]}
      selectedIndex={selectedIndex}
      enabled={enabled}
      appearance={scheme}
      fontStyle={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}
      activeFontStyle={{ color: colors.text, fontSize: 13, fontWeight: '600' }}
      onChange={(event) => choose(event.nativeEvent.selectedSegmentIndex)}
      style={[{ height: 44 }, style]}
    />
  );
}

/** A native on/off switch in the accent colour, as the web's switches. */
export function Switch({
  value,
  onChange,
  accessibilityLabel,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <NativeSwitch
      accessibilityLabel={accessibilityLabel}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        haptics.selection();
        onChange(next);
      }}
      trackColor={{ true: colors.accent, false: colors.surface3 }}
      thumbColor={Platform.OS === 'android' ? '#ffffff' : undefined}
      ios_backgroundColor={colors.surface3}
    />
  );
}

/**
 * A native slider: SwiftUI's on iOS, Material's on Android. Screen readers adjust it in `step`s
 * with swipe up and down; `valueText` says the value aloud.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  accessibilityLabel,
  valueText,
  style,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  valueText?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  const [last, setLast] = useState(value);
  const change = (snapped: number) => {
    if (snapped !== last) haptics.selection();
    setLast(snapped);
    onChange(snapped);
  };
  // One grid of reachable values (from `min` in steps, then `max` itself) for the native track
  // and for screen readers. Ranges the steps divide evenly get native stops. An uneven range is
  // not supported (see the dev warning): its track moves freely and lands on the grid, and after
  // a release that snaps back to the same value the native thumb can rest off it.
  const grid = sliderGrid(min, max, step);
  const nativeChange = (next: number) => change(snapToStep(next, min, max, step));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={valueText ? { text: valueText } : { min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        change(
          stepSlider(value, min, max, step, event.nativeEvent.actionName === 'increment' ? 1 : -1),
        )
      }
      style={[styles.slider, style]}
    >
      {Platform.OS === 'ios' ? (
        <Host colorScheme={scheme} style={{ flex: 1 }}>
          <SwiftSlider
            value={value}
            min={min}
            max={max}
            step={grid.even ? grid.step : undefined}
            onValueChange={nativeChange}
            modifiers={[tint(colors.accent)]}
          />
        </Host>
      ) : (
        <ComposeHost style={{ flex: 1 }}>
          <ComposeSlider
            value={value}
            min={min}
            max={max}
            steps={grid.even ? Math.max(0, grid.last - 1) : 0}
            onValueChange={nativeChange}
            colors={{
              thumbColor: colors.accent,
              activeTrackColor: colors.accent,
              inactiveTrackColor: colors.surface3,
              activeTickColor: 'transparent',
              inactiveTickColor: 'transparent',
            }}
          />
        </ComposeHost>
      )}
    </View>
  );
}

/**
 * A text input with the web's look (the raised surface, a strong outline that turns accent while
 * focused), an optional label above it and its validation message below.
 */
export function TextField({
  label,
  error,
  style,
  inputStyle,
  onFocus,
  onBlur,
  multiline,
  ...input
}: TextInputProps & {
  /** Reaches the input itself (React 19 passes it with the props), e.g. to focus the next field. */
  ref?: Ref<TextInputInstance>;
  label?: string;
  /** Shown under the field in red; also read out with the field. */
  error?: string | null;
  style?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
}) {
  const { colors, type, radius, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      {!!label && (
        <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>{label}</Text>
      )}
      <TextInput
        accessibilityLabel={input.accessibilityLabel ?? label}
        accessibilityHint={error ?? undefined}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        keyboardAppearance={scheme}
        multiline={multiline}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          type.body,
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface2,
            borderColor: error ? colors.danger : focused ? colors.accent : colors.lineStrong,
            borderRadius: radius.md,
          },
          multiline && styles.multiline,
          inputStyle,
        ]}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const warned = new Set<string>();
function warnOnce(message: string) {
  if (!__DEV__ || warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/**
 * A slider's reachable values without listing them: `min`, each `step` above it, then `max`
 * itself. Invalid input (a step that isn't positive and finite, or bounds out of order) becomes
 * one step across the whole range, with a warning in development.
 */
export function sliderGrid(min: number, max: number, step: number) {
  const valid =
    Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(step) && step > 0 && max > min;
  if (!valid) {
    warnOnce(`Slider: invalid range ${min}–${max} with step ${step}.`);
    const lo = Number.isFinite(min) ? min : 0;
    const hi = Number.isFinite(max) && max > lo ? max : lo + 1;
    return {
      min: lo,
      max: hi,
      step: hi - lo,
      last: 1,
      even: true,
      at: (i: number) => (i <= 0 ? lo : hi),
    };
  }
  const quotient = (max - min) / step;
  // Tolerant, so decimal steps such as 0.1 over 0.3 still count as even.
  const even = Math.abs(quotient - Math.round(quotient)) < 1e-9 * Math.max(1, quotient);
  const last = even ? Math.round(quotient) : Math.ceil(quotient);
  if (!even) {
    warnOnce(
      `Slider: ${min}–${max} isn't a whole number of ${step} steps. Uneven ranges aren't ` +
        'supported: the native thumb can rest between values.',
    );
  }
  // Drop float noise such as 0.30000000000000004 from decimal steps.
  const at = (i: number) => (i >= last ? max : Number((min + i * step).toFixed(10)));
  return { min, max, step, last, even, at };
}

/** Every value a slider can take, in order (`sliderGrid` without the arithmetic). */
export function sliderValues(min: number, max: number, step: number): number[] {
  const grid = sliderGrid(min, max, step);
  return Array.from({ length: grid.last + 1 }, (_, i) => grid.at(i));
}

/** The index and value on the grid nearest `value`. */
function nearestOnGrid(grid: ReturnType<typeof sliderGrid>, value: number) {
  const clamped = Math.min(grid.max, Math.max(grid.min, value));
  const below = Math.min(grid.last, Math.max(0, Math.floor((clamped - grid.min) / grid.step)));
  const above = Math.min(grid.last, below + 1);
  const index =
    Math.abs(grid.at(above) - clamped) < Math.abs(grid.at(below) - clamped) ? above : below;
  return { index, value: grid.at(index) };
}

/** The nearest value on the slider's grid. */
export function snapToStep(value: number, min: number, max: number, step: number) {
  return nearestOnGrid(sliderGrid(min, max, step), value).value;
}

/** The next value up (`1`) or down (`-1`) the grid from `value`, as a screen reader's swipe. */
export function stepSlider(
  value: number,
  min: number,
  max: number,
  step: number,
  direction: 1 | -1,
) {
  const grid = sliderGrid(min, max, step);
  const { index } = nearestOnGrid(grid, value);
  return grid.at(Math.min(grid.last, Math.max(0, index + direction)));
}

const styles = StyleSheet.create({
  slider: { flex: 1, height: 44, justifyContent: 'center' },
  // The web's control: a 1 pt outline round 36 pt pills, 4 pt apart, 44 pt in all. The outline
  // sits inside the 44 pt so each choice's pressable can fill the full height.
  segments: {
    flexDirection: 'row',
    height: 44,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  segment: { flex: 1, minWidth: 44, marginVertical: -1, justifyContent: 'center' },
  segmentPill: {
    height: 36,
    marginHorizontal: 2,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '600' },
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
});
