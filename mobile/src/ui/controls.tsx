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
          return (
            <Pressable
              key={`${index}-${label}`}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected, checked: selected, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => choose(index)}
              style={({ pressed }) => [
                styles.segment,
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
  const clamp = (next: number) => snapToStep(next, min, max, step);
  const [last, setLast] = useState(value);
  const change = (next: number) => {
    const snapped = clamp(next);
    if (snapped !== last) haptics.selection();
    setLast(snapped);
    onChange(snapped);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={valueText ? { text: valueText } : { min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        change(value + (event.nativeEvent.actionName === 'increment' ? step : -step))
      }
      style={[styles.slider, style]}
    >
      {Platform.OS === 'ios' ? (
        <Host colorScheme={scheme} style={{ flex: 1 }}>
          <SwiftSlider
            value={value}
            min={min}
            max={max}
            step={step}
            onValueChange={change}
            modifiers={[tint(colors.accent)]}
          />
        </Host>
      ) : (
        <ComposeHost style={{ flex: 1 }}>
          <ComposeSlider
            value={value}
            min={min}
            max={max}
            steps={Math.max(0, Math.round((max - min) / step) - 1)}
            onValueChange={change}
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

/** The nearest value on the slider's grid, which starts at `min`, kept within the range. */
export function snapToStep(value: number, min: number, max: number, step: number) {
  const snapped = min + Math.round((value - min) / step) * step;
  // Drop float noise such as 0.30000000000000004 from decimal steps.
  return Math.min(max, Math.max(min, Number(snapped.toFixed(10))));
}

const styles = StyleSheet.create({
  slider: { flex: 1, height: 44, justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 4, borderWidth: 1, borderRadius: 13, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '600' },
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
});
