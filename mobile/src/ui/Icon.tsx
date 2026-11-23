import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Platform, type ColorValue } from 'react-native';

type Material = ComponentProps<typeof MaterialIcons>['name'];

// One name per meaning, with its SF Symbol on iOS and Material icon elsewhere. A feature that
// needs another icon passes its own { sf, md } pair (keep them in the feature's folder), so both
// platforms stay covered without everyone editing this list.
const ICONS = {
  home: { sf: 'house.fill', md: 'home' },
  training: { sf: 'calendar', md: 'calendar-month' },
  start: { sf: 'plus', md: 'add' },
  social: { sf: 'person.2.fill', md: 'group' },
  body: { sf: 'figure.stand', md: 'accessibility-new' },
  play: { sf: 'play.fill', md: 'play-arrow' },
  next: { sf: 'forward.end.fill', md: 'skip-next' },
  skip: { sf: 'forward.fill', md: 'fast-forward' },
  blank: { sf: 'square.dashed', md: 'crop-free' },
  cardio: { sf: 'heart.fill', md: 'favorite' },
  timer: { sf: 'timer', md: 'timer' },
  close: { sf: 'xmark', md: 'close' },
  check: { sf: 'checkmark', md: 'check' },
  plus: { sf: 'plus', md: 'add' },
  minus: { sf: 'minus', md: 'remove' },
  trash: { sf: 'trash', md: 'delete-outline' },
  more: { sf: 'ellipsis', md: 'more-horiz' },
  edit: { sf: 'pencil', md: 'edit' },
  search: { sf: 'magnifyingglass', md: 'search' },
  filter: { sf: 'line.3.horizontal.decrease', md: 'filter-list' },
  trophy: { sf: 'trophy.fill', md: 'emoji-events' },
  settings: { sf: 'gearshape', md: 'settings' },
  bell: { sf: 'bell', md: 'notifications-none' },
  chevronRight: { sf: 'chevron.right', md: 'chevron-right' },
  chevronLeft: { sf: 'chevron.left', md: 'chevron-left' },
  chevronDown: { sf: 'chevron.down', md: 'expand-more' },
  chevronUp: { sf: 'chevron.up', md: 'expand-less' },
  dumbbell: { sf: 'dumbbell.fill', md: 'fitness-center' },
  flame: { sf: 'flame.fill', md: 'local-fire-department' },
  pause: { sf: 'pause.fill', md: 'pause' },
  external: { sf: 'arrow.up.right.square', md: 'open-in-new' },
} satisfies Record<string, { sf: SFSymbol; md: Material }>;

export type IconName = keyof typeof ICONS;
export type IconPair = { sf: SFSymbol; md: Material };
export const iconSymbols = ICONS;

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName | IconPair;
  size?: number;
  color: ColorValue;
}) {
  const icon = typeof name === 'string' ? ICONS[name] : name;
  const fallback = <MaterialIcons name={icon.md} size={size} color={color as string} />;
  if (Platform.OS !== 'ios') return fallback;
  return (
    <SymbolView
      name={icon.sf}
      size={size}
      tintColor={color}
      fallback={fallback}
      resizeMode="scaleAspectFit"
    />
  );
}
