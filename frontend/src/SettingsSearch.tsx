import { useContext, useId, useState } from 'react';
import { Icon } from './Icon';
import { openTipTarget } from './tipActions';
import { useUserSession } from './userContext';
import {
  searchSettings,
  SETTINGS_GROUP_LABELS,
  SettingsNavigationContext,
  useSettingsPageJump,
  type SettingsDestination,
} from './settingsNavigation';
import './settingsSearch.css';

const PAGE_LABELS: Record<SettingsDestination['page'], string> = {
  settings: 'Settings',
  profile: 'Profile',
  cardio: 'Cardio',
  dashboard: 'Home',
  admin: 'Admin',
};

export function SettingsSearch({ includeProfile = true }: { includeProfile?: boolean }) {
  const navigation = useContext(SettingsNavigationContext);
  const isAdmin = Boolean(useUserSession().user?.is_admin);
  const [query, setQuery] = useState('');
  const id = useId();
  const results = searchSettings(query, includeProfile, isAdmin);
  // Settings stays mounted, so it finishes jumps to results on the Cardio and Admin screens.
  useSettingsPageJump('cardio', true);
  useSettingsPageJump('admin', true);
  function choose(entry: SettingsDestination) {
    setQuery('');
    if (entry.action) openTipTarget(entry.action);
    else navigation?.navigate(entry);
  }
  return (
    <section className="settings-search" aria-label="Search settings and profile">
      <label htmlFor={id}>Search settings &amp; profile</label>
      <div className="settings-search-input">
        <Icon name="search" />
        <input
          id={id}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Rest timer, username, theme…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
            if (event.key === 'Enter' && results[0]) {
              event.preventDefault();
              choose(results[0]);
            }
          }}
        />
      </div>
      {query.trim() && (
        <div className="settings-search-results">
          <p role="status">
            {results.length
              ? `${results.length} ${results.length === 1 ? 'section' : 'sections'} found`
              : 'No sections found. Try “timer” or “username”.'}
          </p>
          {results.length > 0 && (
            <ul>
              {results.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      choose(entry);
                    }}
                  >
                    <span>
                      <strong>{entry.title}</strong>
                      <small>
                        {entry.group ? SETTINGS_GROUP_LABELS[entry.group] : PAGE_LABELS[entry.page]}
                      </small>
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
