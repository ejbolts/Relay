import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';

export function CardioPage({ title, children }: { title: string; children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerTintColor: colors.accentText,
          headerTitleStyle: { color: colors.text },
          headerStyle: { backgroundColor: colors.page },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
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
  const { colors, radius, type } = useTheme();
  return (
    <View style={[styles.field, style]}>
      {!hideLabel && <Text style={[type.footnote, { color: colors.secondary }]}>{label}</Text>}
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        style={[
          type.callout,
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface2,
            borderRadius: radius.md,
            borderColor: error || invalid ? colors.danger : colors.line,
            ...(props.multiline ? { minHeight: 80, textAlignVertical: 'top' } : {}),
          },
        ]}
      />
      {error && <CardioError message={error} />}
    </View>
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
        { backgroundColor: colors.surface2, borderRadius: radius.md, opacity: pressed ? 0.65 : 1 },
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
          placeholder={
            estimates && key === 'elevation_gain_m'
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
  field: { gap: 5 },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  choice: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexBasis: '46%', flexGrow: 1 },
});
