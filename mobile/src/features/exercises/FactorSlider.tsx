import { Host as ComposeHost, Slider as ComposeSlider } from '@expo/ui/jetpack-compose';
import { Host, Slider } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { Platform, View } from 'react-native';
import { FACTOR_RANGE, clampFactor } from '../../../../frontend/src/machineWeights';
import { useTheme } from '../../ui/theme';

/**
 * A machine's conversion to the reference machine, from half to double its weights, on the
 * platform's own slider: SwiftUI's on iOS, Material's on Android.
 */
export function FactorSlider({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (factor: number) => void;
}) {
  const { colors, scheme } = useTheme();
  const factor = clampFactor(value);
  const change = (next: number) => onChange(clampFactor(next));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: `times ${value.toFixed(2)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        change(factor + (event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))
      }
      style={{ flex: 1, height: 40, justifyContent: 'center' }}
    >
      {Platform.OS === 'ios' ? (
        <Host colorScheme={scheme} style={{ flex: 1 }}>
          <Slider
            value={factor}
            min={FACTOR_RANGE.min}
            max={FACTOR_RANGE.max}
            step={FACTOR_RANGE.step}
            onValueChange={change}
            modifiers={[tint(colors.accent)]}
          />
        </Host>
      ) : (
        <ComposeHost style={{ flex: 1 }}>
          <ComposeSlider
            value={factor}
            min={FACTOR_RANGE.min}
            max={FACTOR_RANGE.max}
            onValueChange={change}
            colors={{
              thumbColor: colors.accent,
              activeTrackColor: colors.accent,
              inactiveTrackColor: colors.surface3,
            }}
          />
        </ComposeHost>
      )}
    </View>
  );
}
