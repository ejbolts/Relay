import { Icon } from './Icon';

/** Shown beside a screen title while Relay is working from the data saved on this device. */
export function OfflineBadge() {
  return (
    <span className="offline-badge" role="status">
      <Icon name="cloud-off" />
      Offline
    </span>
  );
}
