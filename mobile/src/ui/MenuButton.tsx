import { Button, Host, Image, Menu, Section, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as labelled,
  background,
  contentShape,
  font,
  foregroundStyle,
  frame,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { splitStyle } from './components';
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
  touch,
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
  /**
   * A touch area larger than the drawn trigger (`width` × `height`), such as 44 pt around a
   * compact pill. `style`'s placement goes on the touch area and its looks on the face.
   */
  touch?: { width?: number; height?: number };
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { scheme } = useTheme();
  if (touch) {
    const { box: place, face } = splitStyle(style);
    const outerWidth = Math.max(touch.width ?? width, width);
    const outerHeight = Math.max(touch.height ?? height, height);
    const outer = [
      place,
      { width: outerWidth, height: outerHeight },
      touchStyles.centre,
    ] as StyleProp<ViewStyle>;
    if (Platform.OS !== 'ios')
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={() => showMenu(title, sheetOptions(items))}
          style={outer}
        >
          <View style={face}>{children}</View>
        </Pressable>
      );
    // The face is drawn in RN; the native trigger on top draws the label and takes touches over
    // the whole area, so the menu still anchors to it.
    const area = [
      frame({ width: outerWidth, height: outerHeight }),
      contentShape(shapes.rectangle()),
      labelled(accessibilityLabel),
    ];
    const native =
      'sf' in trigger ? (
        <Image
          systemName={trigger.sf}
          size={trigger.size ?? 17}
          color={trigger.color as string}
          modifiers={area}
        />
      ) : (
        <SwiftText
          modifiers={[
            font({ size: 15, weight: 'semibold' }),
            foregroundStyle(trigger.color as string),
            ...area,
          ]}
        >
          {trigger.text}
        </SwiftText>
      );
    return (
      <View style={outer}>
        <View pointerEvents="none" style={[face, { width, height }]} />
        <Host matchContents colorScheme={scheme} style={StyleSheet.absoluteFill}>
          <Menu label={native}>
            {title ? <Section title={title}>{menuItems(items)}</Section> : menuItems(items)}
          </Menu>
        </Host>
      </View>
    );
  }
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

export function menuItems(items: MenuItem[]): ReactNode {
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
export function sheetOptions(items: MenuItem[]): MenuOption[] {
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

const touchStyles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});
