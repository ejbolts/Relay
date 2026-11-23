import { Host as ComposeHost, Slider as ComposeSlider } from '@expo/ui/jetpack-compose';
import { Host, Slider as SwiftSlider } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import SegmentedControl, {
  type SegmentedControlProps,
} from '@react-native-segmented-control/segmented-control';
import { useState, type ComponentType } from 'react';
import {
  Platform,
  Pressable,
  Switch as NativeSwitch,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
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
  // and for screen readers. When the steps divide the range evenly the native controls show
  // them as stops; otherwise they move freely and land on the grid here, so `max` stays
  // reachable even after a shorter last step.
  const even = sliderValues(min, max, step).length - 1 === (max - min) / step;
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
            step={even ? step : undefined}
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
            steps={even ? Math.max(0, Math.round((max - min) / step) - 1) : 0}
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

/**
 * Every value a slider can take: `min`, then each `step` above it, then `max` itself when the
 * steps don't land on it exactly.
 */
export function sliderValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  // Drop float noise such as 0.30000000000000004 from decimal steps.
  for (let i = 0; ; i += 1) {
    const value = Number((min + i * step).toFixed(10));
    if (value >= max - step * 1e-9) break;
    values.push(value);
  }
  values.push(max);
  return values;
}

/** The nearest value on the slider's grid (`sliderValues`). */
export function snapToStep(value: number, min: number, max: number, step: number) {
  return nearest(sliderValues(min, max, step), value).value;
}

/** The next value up (`1`) or down (`-1`) the grid from `value`, as a screen reader's swipe. */
export function stepSlider(
  value: number,
  min: number,
  max: number,
  step: number,
  direction: 1 | -1,
) {
  const values = sliderValues(min, max, step);
  const { index } = nearest(values, value);
  return values[Math.min(values.length - 1, Math.max(0, index + direction))];
}

function nearest(values: number[], value: number) {
  let index = 0;
  values.forEach((candidate, i) => {
    if (Math.abs(candidate - value) < Math.abs(values[index] - value)) index = i;
  });
  return { index, value: values[index] };
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
