import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  APP_GUIDE_THANKS,
  appGuideSteps,
  CONTRIBUTING_URL,
  PROJECT_URL,
} from '../../../../frontend/src/appGuideSteps';
import type { AppTab } from '../../../../frontend/src/appNavigation';
import { Button } from '../../ui/components';
import { useReduceMotion } from '../settings/devicePreferences';
import { useTheme } from '../../ui/theme';
import { GuideCard, GuideText } from './GuideCard';
import { guideIcons } from './icons';
import { showAppTourStep } from './tourProgress';

/** Where each of the web's tour stops is in the app. Progress is an exercise in Training. */
const TAB_ROUTES: Partial<Record<AppTab, '/' | '/training' | '/social' | '/body' | '/settings'>> = {
  dashboard: '/',
  training: '/training',
  progress: '/training',
  social: '/social',
  body: '/body',
  settings: '/settings',
};

// The video logger is on the web, so the app's tour leaves out its stop.
const STEPS = appGuideSteps(false, { app: true });

/**
 * The web's quick tour, as a card over the bottom of the screen that opens each tab as it explains
 * it, then thanks the person, with a way to send feedback. The web's Add to Home Screen step is
 * left out: the app is already on the phone's home screen.
 */
export function AppTour({ index, onClose }: { index: number; onClose: () => void }) {
  const router = useRouter();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const setIndex = showAppTourStep;
  const step = STEPS[index];
  const route = step && TAB_ROUTES[step.tab];

  useEffect(() => {
    if (!route) return;
    if (route === '/settings') router.push(route);
    else router.navigate(route);
  }, [route, router]);

  const back = index > 0 ? () => setIndex(index - 1) : undefined;
  return (
    <Modal
      visible
      transparent
      animationType={reduced ? 'none' : 'fade'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={back ?? onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
              // Above the tab bar, so the tab being explained stays in sight.
              marginBottom: insets.bottom + 100,
            },
          ]}
        >
          {step ? (
            <GuideCard
              guide="Quick tour"
              index={index}
              total={STEPS.length}
              title={step.title}
              onBack={back}
              next={{
                label: index === STEPS.length - 1 ? 'Finish' : 'Next',
                onPress: () => setIndex(index + 1),
              }}
              onLeave={onClose}
            >
              <GuideText>{step.description}</GuideText>
            </GuideCard>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={[type.eyebrow, { color: colors.accentText }]}>
                {APP_GUIDE_THANKS.kicker}
              </Text>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {APP_GUIDE_THANKS.title}
              </Text>
              <GuideText>{APP_GUIDE_THANKS.body}</GuideText>
              <Button
                label="Send feedback"
                variant="secondary"
                onPress={() => {
                  onClose();
                  router.push('/settings/feedback');
                }}
              />
              <Button
                label="GitHub repository"
                variant="link"
                icon={guideIcons.external}
                onPress={() => void Linking.openURL(PROJECT_URL)}
              />
              <Button
                label="How to contribute"
                variant="link"
                icon={guideIcons.external}
                onPress={() => void Linking.openURL(CONTRIBUTING_URL)}
              />
              <View style={styles.actions}>
                <Button
                  label="Back"
                  variant="secondary"
                  icon="chevronLeft"
                  style={{ flex: 1 }}
                  onPress={back!}
                />
                <Button label="End guide" style={{ flex: 1 }} onPress={onClose} />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  card: { marginHorizontal: 12, padding: 18, borderRadius: 24, borderWidth: 1 },
  actions: { flexDirection: 'row', gap: 10 },
});
