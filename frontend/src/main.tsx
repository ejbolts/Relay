import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthGate } from './AuthGate';
import { ToastProvider } from './Toast';
import { registerAppUpdates } from './appUpdates';
import { captureFriendInvite } from './friendInvite';
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
import './styles.css';
import './pulse.css';
import './buttons.css';
import './lightMode.css';
import './workoutSetColours.css';
import './auth.css';
import './releaseAnnouncement.css';
import './homeScreenGuide.css';
import './appGuide.css';
import './feedback.css';
import './sharing.css';
import './WorkoutBrowser.css';
import './cardioPage.css';
import './exerciseList.css';

// Before the app reads its screen from the address, keep any friend invite through sign-in.
captureFriendInvite();
registerAppUpdates();
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
        <App />
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
);
