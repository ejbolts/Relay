import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '../data/queryClient';
// Mobile batch 4, records stream (B2).
import { BodyCheckInSync } from '../features/body/BodyCheckInSync';
// B5 (data): asks a new account whether to import its history.
import { useImportPrompt } from '../features/data';
import { AppTourHost } from '../features/guides/AppTourHost';
import { colourMode, useReduceMotion } from '../features/settings/devicePreferences';
import { WorkoutProvider } from '../features/workout/WorkoutProvider';
import { WorkoutLinkOpener } from '../features/workout/workoutLink';
import { useDeferredFriendInvite } from '../session/friendInvite';
import { SessionProvider, useSession } from '../session/SessionProvider';
import { pushedScreenOptions, sheetScreenOptions } from '../ui/navigation';
import { PromptHost } from '../ui/prompts';
import { useTheme } from '../ui/theme';

export default function RootLayout() {
  const [client] = useState(createQueryClient);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <SessionProvider>
            <Navigation />
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigation() {
  const { status } = useSession();
  const { scheme, colors } = useTheme();
  const mode = colourMode.use();
  const reducedMotion = useReduceMotion();
  useEffect(() => Appearance.setColorScheme(mode === 'auto' ? 'unspecified' : mode), [mode]);
  const signedIn = status.kind === 'signed-in';
  // After an admin reset nothing else works until a new password is chosen, as on the web.
  const mustChangePassword = signedIn && !!status.user.must_change_password;
  useDeferredFriendInvite(signedIn && !mustChangePassword);
  useImportPrompt();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.page,
      card: colors.surface,
      text: colors.text,
      border: colors.line,
    },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <WorkoutProvider>
        {/* Mobile batch 4, records stream (B2): sends check-ins saved offline. Before the
            screens, so their check-in queries start with the signed-in account. */}
        <BodyCheckInSync />
        {/* A cold-start tap on the rest timer's Live Activity opens the logger once it can. */}
        <WorkoutLinkOpener />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.page },
            ...(reducedMotion && { animation: 'none' }),
          }}
        >
          <Stack.Protected guard={signedIn && !mustChangePassword}>
            <Stack.Screen name="(tabs)" />
            {/* The logger: a page sheet that drags down to minimise the workout, not end it. */}
            <Stack.Screen name="workout" options={{ presentation: 'modal' }} />
            {/* The Start menu, like the web's: Cardio, Up next, Empty. A native form sheet on iOS;
                on Android a transparent modal that draws its own bottom sheet (ui/navigation). */}
            <Stack.Screen name="start-workout" options={sheetScreenOptions({ reducedMotion })} />
            {/* Settings and the split editor: pushed screens with their own stacks and headers. */}
            <Stack.Screen name="settings" />
            <Stack.Screen name="split" />
            {/* Social's profiles, shared workouts and sharing choices, over the tabs. */}
            <Stack.Screen name="social/profile/[id]" />
            <Stack.Screen name="social/workout/[id]" />
            <Stack.Screen name="social/sharing" />
            {/* Editing a saved workout from Training's session screen. */}
            <Stack.Screen name="edit-workout/[id]" />
            {/* Training blocks, over the tabs from Training or Home (mobile batch 3, exercises
                and blocks stream). */}
            <Stack.Screen name="blocks" />
            {/* W3 (Home): per-muscle weekly goals and the Home layout editor, with headers. */}
            <Stack.Screen
              name="muscle-goals"
              options={pushedScreenOptions(colors, 'Muscle goals')}
            />
            <Stack.Screen name="home-layout" options={pushedScreenOptions(colors, 'Edit Home')} />
            {/* Training Cardio: standalone logging, metrics and zone preferences. */}
            <Stack.Screen name="cardio/log" />
            <Stack.Screen name="cardio/metrics/[id]" />
            <Stack.Screen name="cardio/zones" />
            {/* Mobile batch 4, records stream (B2): editing a standalone cardio session. */}
            <Stack.Screen name="cardio/edit/[id]" />
            {/* B3 (weekly review and notices): last week's review and What's new, opened by
                themselves from Home or from the bell. */}
            <Stack.Screen
              name="weekly-review"
              options={pushedScreenOptions(colors, 'Weekly review')}
            />
            <Stack.Screen
              name="release-notes"
              options={pushedScreenOptions(colors, "What's new")}
            />
            {/* Mobile batch 4, data stream: CSV import with review and undo, and data export. */}
            <Stack.Screen name="data" />
            {/* Mobile batch 4, B6: the admin console (admins only) and the videos tab. */}
            <Stack.Screen name="admin" />
            <Stack.Screen name="videos" />
          </Stack.Protected>
          <Stack.Protected guard={mustChangePassword}>
            <Stack.Screen name="password-required" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
        {/* Mobile batch 4, B4: the quick tour, above the tabs so it stays open as it opens each. */}
        {signedIn && !mustChangePassword && <AppTourHost />}
        {/* Android's menu sheets and text dialogs for every screen. The logger, a separate native
            sheet, mounts its own. */}
        <PromptHost />
      </WorkoutProvider>
    </ThemeProvider>
  );
}
