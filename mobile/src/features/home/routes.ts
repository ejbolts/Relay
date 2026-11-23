import type { Palette } from '../../ui/theme';

/**
 * Home's pushed screens, `/muscle-goals` and `/home-layout`: native headers in the page's
 * colours, with a back button to the screen that opened them.
 */
export function homeScreenOptions(colors: Palette, title: string) {
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
