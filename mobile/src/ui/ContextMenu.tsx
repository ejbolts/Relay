import { ContextMenu as SwiftContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';
import type { ReactElement } from 'react';
import { Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { haptics } from './haptics';
import { menuItems, sheetOptions, type MenuItem } from './MenuButton';
import { showMenu } from './prompts';
import { useTheme } from './theme';

/**
 * Long press for more, as a native context menu: on iOS the system's lifted preview and menu
 * (SwiftUI's contextMenu); on Android a long press opens the app's menu sheet. A tap still goes
 * to `onPress`. Keep every action reachable another way too (a ••• button or the row's screen):
 * long press is a shortcut nobody has to discover.
 */
export function ContextMenu({
  items,
  title,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
  children,
}: {
  items: MenuItem[];
  /** The menu sheet's heading on Android. */
  title?: string;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
  /** One element: the row or card the menu belongs to. */
  children: ReactElement;
}) {
  const { scheme } = useTheme();
  const open = () => {
    haptics.press();
    showMenu(title, sheetOptions(items));
  };
  // Screen readers reach the same items through actions on the element.
  const actions = items.map((item) => ({ name: item.label, label: item.label }));
  const runAction = (name: string) => {
    const item = items.find((entry) => entry.label === name);
    if (!item) return;
    if ('items' in item) showMenu(item.label, sheetOptions(item.items));
    else item.onPress();
  };
  const pressable = (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={actions}
      onAccessibilityAction={(event) => runAction(event.nativeEvent.actionName)}
      onPress={onPress}
      onLongPress={Platform.OS === 'ios' ? undefined : open}
      delayLongPress={350}
      style={({ pressed }) => [style, pressed && !!onPress && { opacity: 0.75 }]}
    >
      {children}
    </Pressable>
  );
  if (Platform.OS !== 'ios') return pressable;
  return (
    <Host matchContents={{ vertical: true }} colorScheme={scheme}>
      <SwiftContextMenu>
        <SwiftContextMenu.Items>{menuItems(items)}</SwiftContextMenu.Items>
        <SwiftContextMenu.Trigger>
          <RNHostView matchContents={{ vertical: true }}>{pressable}</RNHostView>
        </SwiftContextMenu.Trigger>
      </SwiftContextMenu>
    </Host>
  );
}
