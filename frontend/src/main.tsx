import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthGate } from './AuthGate';
import { registerAppUpdates } from './appUpdates';
import { applyReduceMotion, reduceMotionPreference } from './motion';
import {
  applyColourMode,
  applyColourTheme,
  colourModePreference,
  colourThemePreference,
} from './colourThemes';
import './styles.css';
import './pulse.css';
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

registerAppUpdates();
// Apply before the first paint so the opening screen respects the setting.
applyReduceMotion(reduceMotionPreference());
applyColourMode(colourModePreference());
applyColourTheme(colourThemePreference());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
);
