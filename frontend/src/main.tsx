// First, so the stylesheets keep their order whatever the screens below import.
import './appStyles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { preloadApp } from './appLoad';
import { AppLoader } from './AppLoader';
import { AuthGate } from './AuthGate';
import { ToastProvider } from './Toast';
import { registerAppUpdates } from './appUpdates';
import { captureFriendInvite } from './friendInvite';
import { captureTrainInvite } from './trainTogetherInvite';
import { captureInstallPrompt } from './installPrompt';
import { preventIosInputZoom } from './iosInputZoom';
import { applyReduceMotion, reduceMotionPreference } from './motion';
import {
  applyColourMode,
  applyColourTheme,
  applyDarkStyle,
  applyGlass,
  applyLightStyle,
  colourModePreference,
  colourThemePreference,
  darkStylePreference,
  followSystemColourMode,
  glassPreference,
  resetAppearanceOnce,
  lightStylePreference,
} from './colourThemes';

// Before the app reads its screen from the address, keep any friend or train-together invite through sign-in.
captureFriendInvite();
captureTrainInvite();
// The signed-in app downloads from now, behind whichever screen shows first. The offline
// worker starts once it has, so the two never share the connection.
registerAppUpdates(preloadApp());
captureInstallPrompt();
preventIosInputZoom();
// Apply before the first paint so the opening screen respects the setting.
applyReduceMotion(reduceMotionPreference());
resetAppearanceOnce();
applyDarkStyle(darkStylePreference());
applyLightStyle(lightStylePreference());
applyGlass(glassPreference());
applyColourMode(colourModePreference());
applyColourTheme(colourThemePreference());
followSystemColourMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate>
        <AppLoader />
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
);
