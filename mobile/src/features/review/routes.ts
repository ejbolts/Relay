import type { IconPair } from '../../ui/Icon';
import type { Palette } from '../../ui/theme';

/** The weekly review and What's new, pushed over the tabs from Home or the bell. */
export const reviewRoutes = {
  /** Opens on last week; arrows step to earlier weeks and this week. */
  weeklyReview: '/weekly-review' as const,
  releaseNotes: '/release-notes' as const,
};

/** Their native headers, in the page's colours with a back button. */
export function reviewScreenOptions(colors: Palette, title: string) {
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

/** The review's and the bell's own icons, as SF Symbol and Material pairs. */
export const reviewIcons = {
  sparkle: { sf: 'sparkles', md: 'auto-awesome' },
  trend: { sf: 'chart.line.uptrend.xyaxis', md: 'trending-up' },
  key: { sf: 'key', md: 'vpn-key' },
  person: { sf: 'person', md: 'person-outline' },
} satisfies Record<string, IconPair>;
