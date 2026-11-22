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
          <Stack.Protected guard={signedIn}>
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
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </WorkoutProvider>
    </ThemeProvider>
  );
}
