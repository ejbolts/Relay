import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { disabled as swiftDisabled, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { Children, Fragment, isValidElement, useContext, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { buttonColors, cardSurface } from '../../ui/components';
import { Switch } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon, type IconName, type IconPair } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';

// A native grouped list styled with Pulse's card surfaces and calm accent-tinted icon badges:
// sections of rows on a card, each row with an optional icon, a label, and a value, switch, menu
// or chevron on the right.

/** A pushed screen's scrolling page under its native header. */
export function SettingsPage({
  children,
  refreshing,
  onRefresh,
  scrollRef,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** For screens that scroll to one of their sections, such as Settings' search. */
  scrollRef?: Ref<ScrollViewInstance>;
}) {
  const { colors, space } = useTheme();
  // Optional, so pages rendered without a safe-area provider (tests, other stacks) still work.
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: space.gutter,
        gap: space.xl,
        paddingBottom: Math.max(space.xxl * 2, bottomInset + 36),
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.muted}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface2}
          />
        ) : undefined
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
  const { colors, type } = useTheme();
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
      <View style={[cardSurface(colors), { overflow: 'hidden' }]}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 && <View style={[styles.separator, { backgroundColor: colors.line }]} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/**
 * The calm rounded-square icon badge that leads a row, matching the web's Settings hub: soft
 * accent fill with accent ink (or soft danger tint for destructive rows), following the active
 * Relay accent theme instead of hardcoded per-row colours.
 */
export function RowIcon({
  icon,
  destructive,
}: {
  icon: IconName | IconPair;
  /** Retained for caller compatibility; Pulse rows follow the active accent theme. */
  tint?: string;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const danger = buttonColors(colors, 'danger-soft');
  return (
    <View
      style={[styles.rowIcon, { backgroundColor: destructive ? danger.fill : colors.accentSoft }]}
    >
      <Icon name={icon} size={16} color={destructive ? danger.ink : colors.accentText} />
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
  subtitle,
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
  subtitle?: string | null;
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
      {icon && <RowIcon icon={icon} tint={iconTint} destructive={destructive} />}
      <View style={[!accessory && !value && { flex: 1 }, { flexShrink: value ? 0 : 1, gap: 1 }]}>
        <Text
          style={[type.body, { color: destructive ? colors.danger : colors.text }]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {!!subtitle && (
          <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
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
  return (
    <Row
      label={label}
      icon={icon}
      iconTint={iconTint}
      accessory={
        <Switch accessibilityLabel={label} value={value} disabled={disabled} onChange={onChange} />
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
    haptics.selection();
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
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  separator: { height: 1, marginLeft: 16 },
  row: {
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
