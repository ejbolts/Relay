import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '../data/queryClient';
import { WorkoutProvider } from '../features/workout/WorkoutProvider';
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
  const signedIn = status.kind === 'signed-in';
  // After an admin reset nothing else works until a new password is chosen, as on the web.
  const mustChangePassword = signedIn && !!status.user.must_change_password;
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
      <StatusBar style="auto" />
      <WorkoutProvider>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}
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
                  animation: 'fade',
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
