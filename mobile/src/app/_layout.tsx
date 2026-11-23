import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '../data/queryClient';
// W3 (Home): header options for Home's pushed screens.
import { homeScreenOptions } from '../features/home/routes';
import { colourMode, useReduceMotion } from '../features/settings/devicePreferences';
import { WorkoutProvider } from '../features/workout/WorkoutProvider';
import { useDeferredFriendInvite } from '../session/friendInvite';
import { SessionProvider, useSession } from '../session/SessionProvider';
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
            {/* The Start menu, like the web's: Cardio, Up next, Empty. A native sheet on iOS; on
                Android a pushed formSheet draws under the native tab bar, so it is a transparent
                modal that draws its own bottom sheet. */}
            <Stack.Screen
              name="start-workout"
              options={{
                presentation: Platform.OS === 'ios' ? 'formSheet' : 'transparentModal',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
                ...(Platform.OS !== 'ios' && {
                  animation: reducedMotion ? 'none' : 'fade',
                  contentStyle: { backgroundColor: 'transparent' },
                }),
              }}
            />
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
            <Stack.Screen name="muscle-goals" options={homeScreenOptions(colors, 'Muscle goals')} />
            <Stack.Screen name="home-layout" options={homeScreenOptions(colors, 'Edit Home')} />
            {/* Training Cardio: standalone logging, metrics and zone preferences. */}
            <Stack.Screen name="cardio/log" />
            <Stack.Screen name="cardio/metrics/[id]" />
            <Stack.Screen name="cardio/zones" />
          </Stack.Protected>
          <Stack.Protected guard={mustChangePassword}>
            <Stack.Screen name="password-required" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
        {/* Android's menu sheets and text dialogs for every screen. The logger, a separate native
            sheet, mounts its own. */}
        <PromptHost />
      </WorkoutProvider>
    </ThemeProvider>
  );
}
