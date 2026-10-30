import { useEffect, useMemo, useState } from 'react';
import { encode } from 'uqr';
import { api } from './api';
import { friendInviteUrl, openFriendInvite } from './friendInvite';
import { FriendQrScanner } from './FriendQrScanner';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import type { User } from './types';

/** A QR code drawn as one SVG path, dark on light so every camera can read it in any theme. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 4 });
    let modules = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) modules += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { size: qr.size, path: modules };
  }, [value]);
  return (
    <svg
      className="qr-code"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

type Shareable = 'checking' | 'shared' | 'private';
type SheetMode = 'code' | 'scan';

export function FriendInviteDialog({
  user,
  onClose,
  onChooseSharing,
}: {
  user: User;
  onClose: () => void;
  onChooseSharing: () => void;
}) {
  const url = friendInviteUrl(user.id);
  const [mode, setMode] = useState<SheetMode>('code');
  const [shareable, setShareable] = useState<Shareable>('checking');
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const canShare = typeof navigator.share === 'function';

  useEffect(() => {
    let cancelled = false;
    api.sharing
      .choices()
      .then((choices) => {
        if (!cancelled) setShareable(choices.visibility === 'private' ? 'private' : 'shared');
      })
      // Offline, the code still works once the other person is connected.
      .catch(() => {
        if (!cancelled) setShareable('shared');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function share() {
    setShareError(null);
    if (canShare) {
      try {
        await navigator.share({ title: `Add ${user.display_name} on Relay`, url });
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setShareError('Could not copy the link.');
    }
  }

  return (
    <PopupDialog title="QR code" className="friend-invite-dialog" swipeToDismiss onClose={onClose}>
      <div
        className="segmented-control friend-invite-modes"
        role="tablist"
        aria-label="QR code view"
      >
        {(
          [
            ['code', 'My code'],
            ['scan', 'Scan'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className={mode === value ? 'active' : ''}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'scan' ? (
        <FriendQrScanner
          userId={user.id}
          onScanned={(accountId) => {
            onClose();
            openFriendInvite(accountId);
          }}
        />
      ) : shareable === 'private' ? (
        <div className="friend-invite-private">
          <span className="friend-invite-private-icon" aria-hidden="true">
            <Icon name="hide" />
          </span>
          <h3>Share your profile to use your QR code</h3>
          <button
            type="button"
            className="profile-primary"
            onClick={() => {
              onClose();
              onChooseSharing();
            }}
          >
            Choose who can see your profile
          </button>
        </div>
      ) : (
        <div className="friend-invite-body">
          <div className="friend-invite-card">
            <div className="friend-invite-code" aria-busy={shareable === 'checking'}>
              {shareable === 'shared' && (
                <QrCode value={url} label={`QR code to add ${user.display_name} as a friend`} />
              )}
            </div>
            <div className="friend-invite-person">
              <ProfileAvatar className="profile-avatar" user={user} />
              <div>
                <strong>{user.display_name}</strong>
                <span>{user.username}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="profile-secondary friend-invite-share"
            disabled={shareable !== 'shared'}
            onClick={() => void share()}
          >
            <Icon name={copied ? 'check' : 'link'} />
            <span>{copied ? 'Link copied' : canShare ? 'Share link' : 'Copy link'}</span>
          </button>
          <p className="sr-only" role="status">
            {copied ? 'Invite link copied.' : ''}
          </p>
          {shareError && (
            <p className="inline-error" role="alert">
              {shareError}
            </p>
          )}
        </div>
      )}
    </PopupDialog>
  );
}

/** Opens the friend QR code sheet: an icon on the profile card, or a labelled chip. */
export function FriendInviteButton({
  user,
  onChooseSharing,
  labelled = false,
}: {
  user: User;
  onChooseSharing: () => void;
  labelled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={labelled ? 'friend-invite-chip' : 'profile-edit-button friend-invite-button'}
        aria-label={labelled ? undefined : 'QR code'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="qr" />
        {labelled && <span>QR code</span>}
      </button>
      {open && (
        <FriendInviteDialog
          user={user}
          onClose={() => setOpen(false)}
          onChooseSharing={onChooseSharing}
        />
      )}
    </>
  );
}
