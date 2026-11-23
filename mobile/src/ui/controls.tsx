import { Host as ComposeHost, Slider as ComposeSlider } from '@expo/ui/jetpack-compose';
import { Host, Slider as SwiftSlider } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import SegmentedControl, {
  type SegmentedControlProps,
} from '@react-native-segmented-control/segmented-control';
import { useState, type ComponentType } from 'react';
import {
  Platform,
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

/** A native segmented control, as the web's .segmented-control. */
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
  return (
    <NativeSegmentedControl
      accessibilityLabel={accessibilityLabel}
      values={[...values]}
      selectedIndex={selectedIndex}
      enabled={enabled}
      appearance={scheme}
      // Android draws the control itself: give it the web's surfaces.
      backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}
      tintColor={Platform.OS === 'android' ? colors.surface3 : undefined}
      fontStyle={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}
      activeFontStyle={{ color: colors.text, fontSize: 13, fontWeight: '600' }}
      onChange={(event) => {
        haptics.selection();
        onChange(event.nativeEvent.selectedSegmentIndex);
      }}
      style={[{ height: 36 }, style]}
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
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next / step) * step));
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

const styles = StyleSheet.create({
  slider: { flex: 1, height: 40, justifyContent: 'center' },
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
});
