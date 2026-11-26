import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {
  cardioMetricAutoPlaceholder,
  cardioMetricFields,
  type CardioMetricKey,
} from '../../../../frontend/src/cardioForm';
import type { CardioSession } from '../../../../frontend/src/types';
import { TextField } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { headerOptions } from '../../ui/navigation';
import { useTheme } from '../../ui/theme';

export function CardioPage({ title, children }: { title: string; children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <>
      <Stack.Screen options={{ ...headerOptions(colors), headerShown: true, title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </>
  );
}

export function CardioField({
  label,
  error,
  invalid,
  style,
  hideLabel,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
  hideLabel?: boolean;
}) {
  const { colors } = useTheme();
  // The shared field: the web's raised input with a strong outline that turns accent on focus.
  return (
    <TextField
      {...props}
      label={hideLabel ? undefined : label}
      accessibilityLabel={label}
      error={error}
      style={[styles.field, style]}
      inputStyle={[
        invalid && !error && { borderColor: colors.danger },
        props.multiline && { minHeight: 80 },
      ]}
    />
  );
}

export function CardioError({ message }: { message: string }) {
  const { colors, type } = useTheme();
  return (
    <Text role="alert" style={[type.footnote, { color: colors.danger }]}>
      {message}
    </Text>
  );
}

export function CardioChoice({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, radius, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.lineStrong,
          borderRadius: radius.md,
          opacity: pressed ? 0.65 : 1,
        },
      ]}
    >
      <Text style={[type.callout, { color: colors.text, flex: 1, fontWeight: '600' }]}>
        {value}
      </Text>
      <Icon name="chevronDown" size={16} color={colors.muted} />
    </Pressable>
  );
}

export function CardioMetricFields({
  activity,
  draft,
  onChange,
  errors,
  disabled,
  estimates,
}: {
  activity: string;
  draft: Record<CardioMetricKey, string>;
  onChange: (key: CardioMetricKey, value: string) => void;
  errors: Partial<Record<CardioMetricKey, string>>;
  disabled: boolean;
  estimates?: CardioSession;
}) {
  return (
    <View style={styles.metrics}>
      {cardioMetricFields(activity).map(({ key, label, step, placeholder }) => (
        <CardioField
          key={key}
          label={key === 'calories_kcal' && !estimates ? 'Active calories (kcal)' : label}
          style={styles.metric}
          keyboardType={step === 1 ? 'number-pad' : 'decimal-pad'}
          value={draft[key]}
          onChangeText={(value) => onChange(key, value.replace(',', '.'))}
          error={errors[key]}
          editable={!disabled}
          // The web's hints: an example where a watch shows the number, Optional elsewhere.
          placeholder={
            !estimates
              ? key === 'calories_kcal'
                ? 'e.g. 350'
                : key === 'average_heart_rate_bpm'
                  ? 'e.g. 142'
                  : (placeholder ?? 'Optional')
              : estimates && key === 'elevation_gain_m'
                ? cardioMetricAutoPlaceholder(estimates.estimated_elevation_gain_m)
                : estimates && key === 'average_mets'
                  ? cardioMetricAutoPlaceholder(estimates.estimated_mets)
                  : placeholder
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  choice: {
    minHeight: 46,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexBasis: '46%', flexGrow: 1 },
});
