import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { disabled as swiftDisabled, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import * as Haptics from 'expo-haptics';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon, type IconName, type IconPair } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';

// An iOS Settings-style grouped list: sections of rows on a card, each row with an optional
// tinted icon, a label, and a value, switch, menu or chevron on the right.

/** A pushed screen's scrolling page under its native header. */
export function SettingsPage({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  /** A small control beside the title, such as an info button. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const { colors, type, radius } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: 6 }}>
      {(!!title || action) && (
        <View style={styles.sectionHeader}>
          {!!title && (
            <Text
              accessibilityRole="header"
              style={[type.footnote, styles.sectionTitle, { color: colors.muted }]}
            >
              {title}
            </Text>
          )}
          {action}
        </View>
      )}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderColor: colors.line,
          borderWidth: StyleSheet.hairlineWidth,
          overflow: 'hidden',
        }}
      >
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 && (
              <View style={[styles.separator, { backgroundColor: colors.lineStrong }]} />
            )}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** The small tinted square that leads a row, as in the iOS Settings app. */
export function RowIcon({ icon, tint: color }: { icon: IconName | IconPair; tint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.rowIcon, { backgroundColor: color ?? colors.accent }]}>
      <Icon name={icon} size={15} color="#ffffff" />
    </View>
  );
}

interface RowBase {
  label: string;
  icon?: IconName | IconPair;
  iconTint?: string;
  disabled?: boolean;
}

export function Row({
  label,
  icon,
  iconTint,
  value,
  onPress,
  chevron = !!onPress,
  external,
  destructive,
  disabled,
  busy,
  accessibilityLabel,
  accessory,
  style,
}: RowBase & {
  value?: string | null;
  onPress?: () => void;
  chevron?: boolean;
  /** Opens outside the app. */
  external?: boolean;
  destructive?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  /** A control on the right, in place of the value. */
  accessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, type } = useTheme();
  const content = (
    <>
      {icon && <RowIcon icon={icon} tint={iconTint} />}
      <Text
        style={[
          type.body,
          // A value gives way to its label, which stays on one line.
          { color: destructive ? colors.danger : colors.text, flexShrink: value ? 0 : 1 },
          !accessory && !value && { flex: 1 },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {(accessory || !!value) && <View style={{ flex: 1 }} />}
      {!!value && (
        <Text
          style={[type.body, type.number, { color: colors.muted, flexShrink: 1 }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
      {accessory}
      {busy ? (
        <ActivityIndicator color={colors.muted} />
      ) : external ? (
        <Icon name="external" size={15} color={colors.muted} />
      ) : (
        chevron && <Icon name="chevronRight" size={14} color={colors.muted} />
      )}
    </>
  );
  if (!onPress)
    return (
      <View
        accessible={!accessory}
        // A row with a control lets the control carry its own name.
        accessibilityLabel={
          accessory
            ? accessibilityLabel
            : (accessibilityLabel ?? (value ? `${label}, ${value}` : label))
        }
        style={[styles.row, style]}
      >
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.surface2 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function SwitchRow({
  label,
  icon,
  iconTint,
  value,
  onChange,
  disabled,
}: RowBase & { value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Row
      label={label}
      icon={icon}
      iconTint={iconTint}
      accessory={
        <Switch
          accessibilityLabel={label}
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            void Haptics.selectionAsync();
            onChange(next);
          }}
          trackColor={{ true: colors.good, false: colors.surface3 }}
          thumbColor={Platform.OS === 'android' ? '#ffffff' : undefined}
          ios_backgroundColor={colors.surface3}
        />
      }
    />
  );
}

export interface Choice<T> {
  value: T;
  label: string;
}

/**
 * A setting with a few named values. On iOS a native menu picker (the current value with up and
 * down chevrons) opens a menu beside it; elsewhere the row opens the menu sheet.
 */
export function ChoiceRow<T>({
  label,
  icon,
  iconTint,
  value,
  choices,
  onChange,
  disabled,
  busy,
}: RowBase & {
  value: T;
  choices: Choice<T>[];
  onChange: (value: T) => void;
  busy?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const index = choices.findIndex((choice) => choice.value === value);
  const current = choices[index]?.label ?? '';
  const pick = (next: T) => {
    if (next === value) return;
    void Haptics.selectionAsync();
    onChange(next);
  };
  if (Platform.OS === 'ios')
    return (
      <Row
        label={label}
        icon={icon}
        iconTint={iconTint}
        busy={busy}
        chevron={false}
        accessory={
          <Host matchContents colorScheme={scheme}>
            <Picker
              selection={index}
              onSelectionChange={(selected: number) => {
                const choice = choices[selected];
                if (choice) pick(choice.value);
              }}
              modifiers={[
                pickerStyle('menu'),
                tint(colors.muted),
                swiftDisabled(!!disabled || !!busy),
              ]}
            >
              {choices.map((choice, i) => (
                <SwiftText key={choice.label} modifiers={[tag(i)]}>
                  {choice.label}
                </SwiftText>
              ))}
            </Picker>
          </Host>
        }
      />
    );
  return (
    <Row
      label={label}
      icon={icon}
      iconTint={iconTint}
      value={current}
      busy={busy}
      disabled={disabled}
      chevron={false}
      accessory={<Icon name="chevronDown" size={14} color={colors.muted} />}
      onPress={() =>
        showMenu(
          label,
          choices.map((choice) => ({
            label: choice.value === value ? `${choice.label} ✓` : choice.label,
            onPress: () => pick(choice.value),
          })),
        )
      }
    />
  );
}

/** A short inline message under a section, such as a failed save. */
export function SectionError({ message }: { message: string | null | undefined }) {
  const { colors, type } = useTheme();
  if (!message) return null;
  return (
    <Text
      accessibilityRole="alert"
      style={[type.footnote, { color: colors.danger, paddingHorizontal: 16 }]}
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.4 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  row: {
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 29,
    height: 29,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
