import { Button, Host, Image, Menu, Section, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as labelled,
  background,
  font,
  foregroundStyle,
  frame,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Platform, Pressable, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { showMenu, type MenuOption } from './prompts';
import { useTheme } from './theme';

/** A menu entry: an action (optionally ticked or destructive), or a submenu. */
export type MenuItem =
  | { label: string; onPress: () => void; checked?: boolean; destructive?: boolean }
  | { label: string; items: MenuItem[] };

/**
 * A button that opens a menu, like a <select> in Safari: on iOS a native menu anchored to the
 * button (UIMenu, through SwiftUI), small and next to what you tapped, instead of a sheet over
 * the whole screen. Elsewhere it opens the app's menu sheet.
 *
 * The iOS trigger is drawn natively (an SF Symbol or a short text in a filled shape), because
 * only a native trigger can anchor the menu; `children` draws the same trigger elsewhere.
 */
export function MenuButton({
  accessibilityLabel,
  title,
  items,
  trigger,
  width,
  height,
  fill,
  cornerRadius,
  style,
  children,
}: {
  accessibilityLabel: string;
  /** A small heading above the items. */
  title?: string;
  items: MenuItem[];
  trigger: { sf: SFSymbol; color: ColorValue; size?: number } | { text: string; color: ColorValue };
  width: number;
  height: number;
  fill: ColorValue;
  /** Leave out for a circle. */
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { scheme } = useTheme();
  if (Platform.OS !== 'ios')
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={6}
        onPress={() => showMenu(title, sheetOptions(items))}
        style={style}
      >
        {children}
      </Pressable>
    );

  const shape =
    cornerRadius === undefined ? shapes.circle() : shapes.roundedRectangle({ cornerRadius });
  const box = [
    frame({ width, height }),
    background(fill as string, shape),
    labelled(accessibilityLabel),
  ];
  const label =
    'sf' in trigger ? (
      <Image
        systemName={trigger.sf}
        size={trigger.size ?? 17}
        color={trigger.color as string}
        modifiers={box}
      />
    ) : (
      <SwiftText
        modifiers={[
          font({ size: 15, weight: 'semibold' }),
          foregroundStyle(trigger.color as string),
          ...box,
        ]}
      >
        {trigger.text}
      </SwiftText>
    );
  return (
    <Host matchContents colorScheme={scheme} style={[{ width, height }, style]}>
      <Menu label={label}>
        {title ? <Section title={title}>{menuItems(items)}</Section> : menuItems(items)}
      </Menu>
    </Host>
  );
}

function menuItems(items: MenuItem[]): ReactNode {
  return items.map((item, index) =>
    'items' in item ? (
      <Menu key={`${index}-${item.label}`} label={item.label}>
        {menuItems(item.items)}
      </Menu>
    ) : (
      <Button
        key={`${index}-${item.label}`}
        label={item.label}
        systemImage={item.checked ? 'checkmark' : undefined}
        role={item.destructive ? 'destructive' : undefined}
        onPress={item.onPress}
      />
    ),
  );
}

/** The same items for the menu sheet: a submenu opens a second sheet. */
function sheetOptions(items: MenuItem[]): MenuOption[] {
  return items.map((item) =>
    'items' in item
      ? { label: item.label, onPress: () => showMenu(item.label, sheetOptions(item.items)) }
      : {
          label: item.checked ? `${item.label} ✓` : item.label,
          destructive: item.destructive,
          onPress: item.onPress,
        },
  );
}
