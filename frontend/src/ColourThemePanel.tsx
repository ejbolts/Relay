import { useState, type CSSProperties } from 'react';
import {
  COLOUR_MODES,
  COLOUR_THEMES,
  DARK_STYLES,
  GLASS_LEVELS,
  SET_TINT_LEVELS,
  LIGHT_STYLES,
  SUN_RAY_STYLES,
  colourModePreference,
  colourThemePreference,
  darkStylePreference,
  glassPreference,
  setTintPreference,
  lightStylePreference,
  sunRayPreference,
  saveColourMode,
  saveColourTheme,
  saveDarkStyle,
  saveGlass,
  saveSetTint,
  saveLightStyle,
  saveSunRay,
} from './colourThemes';
import { Icon } from './Icon';
import './colourThemes.css';

export function ColourThemePanel() {
  const [selected, setSelected] = useState(colourThemePreference);
  const [mode, setMode] = useState(colourModePreference);
  const [darkStyle, setDarkStyle] = useState(darkStylePreference);
  const [glass, setGlass] = useState(glassPreference);
  const [setTint, setSetTint] = useState(setTintPreference);
  const [lightStyle, setLightStyle] = useState(lightStylePreference);
  const [sunRay, setSunRay] = useState(sunRayPreference);
  const [status, setStatus] = useState('');
  return (
    <section
      className="settings-panel panel colour-theme-panel"
      aria-labelledby="colour-theme-title"
    >
      <header>
        <div>
          <p className="section-kicker">APPEARANCE</p>
          <h2 id="colour-theme-title">App theme</h2>
        </div>
      </header>
      <p>Choose light or dark mode and an accent colour. Your choices stay on this device.</p>
      <fieldset className="colour-mode-options">
        <legend className="sr-only">Mode</legend>
        {COLOUR_MODES.map((option) => (
          <label key={option.id} className={mode === option.id ? 'is-selected' : ''}>
            <input
              type="radio"
              name="colour-mode"
              value={option.id}
              checked={mode === option.id}
              onChange={() => {
                setMode(option.id);
                setStatus(
                  saveColourMode(option.id)
                    ? `${option.name} mode saved on this device.`
                    : `${option.name} mode applied for this visit.`,
                );
              }}
            />
            <Icon name={option.icon} />
            <strong>{option.name}</strong>
          </label>
        ))}
      </fieldset>
      {mode === 'dark' && (
        <fieldset className="dark-style-options">
          <legend className="sr-only">Dark style</legend>
          {DARK_STYLES.map((option) => (
            <label key={option.id} className={darkStyle === option.id ? 'is-selected' : ''}>
              <input
                type="radio"
                name="dark-style"
                value={option.id}
                checked={darkStyle === option.id}
                onChange={() => {
                  setDarkStyle(option.id);
                  setStatus(
                    saveDarkStyle(option.id)
                      ? `${option.name} dark style saved on this device.`
                      : `${option.name} dark style applied for this visit.`,
                  );
                }}
              />
              <span className="dark-style-swatch" data-style={option.id} aria-hidden="true">
                <span />
              </span>
              <strong>{option.name}</strong>
            </label>
          ))}
        </fieldset>
      )}
      {mode === 'light' && (
        <fieldset className="dark-style-options light-style-options">
          <legend className="sr-only">Light style</legend>
          {LIGHT_STYLES.map((option) => (
            <label key={option.id} className={lightStyle === option.id ? 'is-selected' : ''}>
              <input
                type="radio"
                name="light-style"
                value={option.id}
                checked={lightStyle === option.id}
                onChange={() => {
                  setLightStyle(option.id);
                  saveLightStyle(option.id);
                }}
              />
              <span className="light-style-swatch" data-style={option.id} aria-hidden="true">
                <span />
              </span>
              <strong>{option.name}</strong>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="colour-theme-options">
        <legend className="sr-only">Accent colour</legend>
        {COLOUR_THEMES.map((theme) => (
          <label key={theme.id} className={selected === theme.id ? 'is-selected' : ''}>
            <input
              type="radio"
              name="colour-theme"
              value={theme.id}
              checked={selected === theme.id}
              onChange={() => {
                setSelected(theme.id);
                setStatus(
                  saveColourTheme(theme.id)
                    ? `${theme.name} theme saved on this device.`
                    : `${theme.name} theme applied for this visit.`,
                );
              }}
            />
            <span
              className="colour-theme-swatch"
              style={{ '--theme-swatch': theme.accent } as CSSProperties}
              aria-hidden="true"
            />
            <span>
              <strong>{theme.name}</strong>
              <small>{theme.detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="glass-options sun-ray-options">
        <legend>Background</legend>
        <div>
          {SUN_RAY_STYLES.map((style) => (
            <label key={style.id} className={sunRay === style.id ? 'is-selected' : ''}>
              <input
                type="radio"
                name="sun-ray-style"
                value={style.id}
                checked={sunRay === style.id}
                onChange={() => {
                  setSunRay(style.id);
                  saveSunRay(style.id);
                }}
              />
              <span className="sun-ray-swatch" data-style={style.id} aria-hidden="true" />
              <strong>{style.name}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="glass-options">
        <legend>Frosted glass</legend>
        <div>
          {GLASS_LEVELS.map((level) => (
            <label key={level.id} className={glass === level.id ? 'is-selected' : ''}>
              <input
                type="radio"
                name="glass-level"
                value={level.id}
                checked={glass === level.id}
                onChange={() => {
                  setGlass(level.id);
                  saveGlass(level.id);
                }}
              />
              <span className="glass-swatch" data-level={level.id} aria-hidden="true">
                <span />
              </span>
              <strong>{level.name}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="glass-options set-tint-options">
        <legend>Set colours</legend>
        <div>
          {SET_TINT_LEVELS.map((level) => (
            <label key={level.id} className={setTint === level.id ? 'is-selected' : ''}>
              <input
                type="radio"
                name="set-tint"
                value={level.id}
                checked={setTint === level.id}
                onChange={() => {
                  setSetTint(level.id);
                  saveSetTint(level.id);
                }}
              />
              <span className="set-tint-swatch" data-level={level.id} aria-hidden="true">
                <span data-kind="warmup" />
                <span data-kind="normal" />
              </span>
              <strong>{level.name}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="notification-setting-status" role="status">
        {status}
      </p>
    </section>
  );
}
