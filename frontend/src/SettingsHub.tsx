import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import {
  SETTINGS_GROUP_LABELS,
  SettingsNavigationContext,
  type SettingsGroupId,
} from './settingsNavigation';
import { SettingsSearch } from './SettingsSearch';
import './settingsHub.css';

export interface SettingsGroup {
  id: SettingsGroupId;
  icon: IconName;
  description: string;
  content: ReactNode;
}

/** Keep panels mounted so browsing settings never discards an unfinished form. */
export function SettingsHub({
  active,
  groups,
  includeAccount,
  accountName,
  onOpenProfile,
  revealData,
  revealHelp,
  selected,
  onSelect,
}: {
  active: boolean;
  groups: SettingsGroup[];
  includeAccount: boolean;
  accountName?: string;
  onOpenProfile: () => void;
  revealData: boolean;
  revealHelp?: boolean;
  selected: SettingsGroupId | null;
  onSelect: (group: SettingsGroupId | null) => void;
}) {
  const navigation = useContext(SettingsNavigationContext);
  const previousSelection = useRef(selected);
  const heading = useRef<HTMLHeadingElement>(null);
  const overviewButtons = useRef(new Map<SettingsGroupId, HTMLButtonElement>());
  const handled = useRef(0);
  const group = groups.find((entry) => entry.id === selected);

  useEffect(() => {
    const request = navigation?.request;
    if (!active || !request || handled.current === request.serial) return;
    if (request.destination.page !== 'settings' || !request.destination.group) return;
    handled.current = request.serial;
    onSelect(request.destination.group);
  }, [active, navigation?.request, onSelect]);

  useEffect(() => {
    if (revealData) onSelect('data');
  }, [revealData, onSelect]);

  useEffect(() => {
    if (revealHelp) onSelect('help');
  }, [revealHelp, onSelect]);

  useEffect(() => {
    const previous = previousSelection.current;
    previousSelection.current = selected;
    if (selected !== null || previous === null) return;
    const frame = requestAnimationFrame(() => overviewButtons.current.get(previous)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  function choose(id: SettingsGroupId) {
    onSelect(id);
    // Search handles its own destination focus; category navigation focuses the panel title.
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  }

  return (
    <div className={`settings-hub${group ? ' has-selection' : ''}`}>
      <header className="settings-hub-intro">
        <div>
          <p className="section-kicker">YOUR SETUP</p>
          <h2>Make Relay yours.</h2>
          <p>Set up your training, make the app yours, and stay in control of your data.</p>
        </div>
        {includeAccount && (
          <button type="button" className="settings-profile-link" onClick={onOpenProfile}>
            <Icon name="user" />
            <span>
              <strong>{accountName}</strong>
              <small>Edit your profile</small>
            </span>
            <Icon name="chevron-right" />
          </button>
        )}
      </header>
      <SettingsSearch includeProfile={includeAccount} />

      <div className="settings-overview" hidden={!!group}>
        <div className="settings-overview-heading">
          <h3>Browse settings</h3>
          <span>Choose a section</span>
        </div>
        <nav className="settings-category-grid" aria-label="Browse settings">
          {groups.map((entry) => (
            <button
              type="button"
              className="settings-category-card"
              key={entry.id}
              onClick={() => choose(entry.id)}
              ref={(element) => {
                if (element) overviewButtons.current.set(entry.id, element);
                else overviewButtons.current.delete(entry.id);
              }}
            >
              <span className="settings-category-icon">
                <Icon name={entry.icon} />
              </span>
              <span className="settings-category-copy">
                <strong>{SETTINGS_GROUP_LABELS[entry.id]}</strong>
                <span>{entry.description}</span>
              </span>
              <Icon name="chevron-right" />
            </button>
          ))}
        </nav>
      </div>

      <div className="settings-workspace" hidden={!group}>
        <nav className="settings-section-nav" aria-label="Settings sections">
          <div className="settings-section-links">
            {groups.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-current={selected === entry.id ? 'page' : undefined}
                onClick={() => choose(entry.id)}
              >
                <Icon name={entry.icon} />
                {SETTINGS_GROUP_LABELS[entry.id]}
              </button>
            ))}
          </div>
        </nav>
        <div className="settings-section-content">
          <header className="settings-section-heading">
            <h2 ref={heading} tabIndex={-1}>
              {group ? SETTINGS_GROUP_LABELS[group.id] : ''}
            </h2>
            <p>{group?.description}</p>
          </header>
          {groups.map((entry) => (
            <div key={entry.id} data-settings-group={entry.id} hidden={selected !== entry.id}>
              {entry.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
