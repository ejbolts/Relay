import type { Palette } from '../../ui/theme';

/** The native header Social's pushed screens show over the tabs, like Training's. */
export function socialHeader(colors: Palette, title: string) {
  return {
    headerShown: true,
    title,
    headerTintColor: colors.accentText,
    headerTitleStyle: { color: colors.text },
    headerStyle: { backgroundColor: colors.page },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: colors.page },
  };
}
