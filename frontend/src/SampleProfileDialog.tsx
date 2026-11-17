import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';

export const SAMPLE_DISPLAY_NAME = 'Sam Sample';
export const SAMPLE_USERNAME = 'sam.sample';

/** Example numbers so the preview looks like a real profile. */
const SAMPLE_STATS = [
  { label: 'Workouts', icon: 'calendar', tone: 'workouts', value: 42 },
  { label: 'Cardio', icon: 'heart', tone: 'cardio', value: 11 },
  { label: 'PRs', icon: 'trophy', tone: 'records', value: 17 },
] as const;

/**
 * Shows how a new account appears to friends, using the name and username typed so far, or
 * Sam Sample until they are filled in. The profile card reuses Today's profile styles.
 */
export function SampleProfileDialog({
  displayName,
  username,
  onClose,
}: {
  displayName: string;
  username: string;
  onClose: () => void;
}) {
  const name = displayName.trim().replace(/\s+/g, ' ') || SAMPLE_DISPLAY_NAME;
  const handle = username.trim().toLowerCase() || SAMPLE_USERNAME;
  return (
    <PopupDialog title="Sample profile" className="sample-profile-dialog" onClose={onClose}>
      <div className="sample-profile-body">
        <p className="sample-profile-intro">How friends will see you. Workouts are examples.</p>
        <section className="pulse-card today-profile" aria-label="Sample profile card">
          <ProfileAvatar
            className="profile-avatar today-profile-avatar"
            user={{ display_name: name, username: handle, profile_photo_url: null }}
          />
          <div className="today-profile-body">
            <h2 className="sample-profile-name">{name}</h2>
            <p className="sample-profile-username">@{handle}</p>
            <dl className="today-profile-stats">
              {SAMPLE_STATS.map((stat) => (
                <div key={stat.label}>
                  <dt>
                    <span className={`today-profile-icon ${stat.tone}`} aria-hidden="true">
                      <Icon name={stat.icon} />
                    </span>
                    {stat.label}
                  </dt>
                  <dd className="num">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <ul className="sample-profile-recent" aria-label="Example recent activity">
          <li>
            <span>Push · 6 exercises</span>
            <small>Yesterday</small>
          </li>
          <li>
            <span>🏆 Bench Press 85 kg × 5</span>
            <small>Yesterday</small>
          </li>
        </ul>
        <dl className="sample-profile-key">
          <div>
            <dt className="is-name">Name</dt>
            <dd>Shown on your profile and to friends.</dd>
          </div>
          <div>
            <dt className="is-username">Username</dt>
            <dd>Your sign-in and @handle for search.</dd>
          </div>
        </dl>
      </div>
      <footer className="popup-dialog-actions">
        <button type="button" className="popup-primary-action" onClick={onClose}>
          Close
        </button>
      </footer>
    </PopupDialog>
  );
}
