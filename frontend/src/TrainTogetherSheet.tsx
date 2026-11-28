import { useEffect, useState } from 'react';
import { ApiError, api, type ApiErrorMember } from './api';
import { QrCode } from './FriendQrCode';
import { FriendQrScanner } from './FriendQrScanner';
import { openFriendInvite } from './friendInvite';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { useToast } from './Toast';
import {
  inviteCountdownLabel,
  memberName,
  TRAIN_ERRORS,
  TRAIN_INVITE_SECONDS,
  TRAIN_MAX_MEMBERS,
  TRAIN_TOGETHER_LABEL,
  trainInviteLink,
  type TrainInvite,
  type TrainMember,
  type TrainSession,
} from './trainTogether';
import { TrainTogetherAvatar } from './TrainTogetherAvatar';
import type { PartnerPalette } from './trainTogetherTheme';
import type { User } from './types';

type SheetTab = 'code' | 'scan';

interface ScanProblem {
  message: string;
  member?: ApiErrorMember;
}

export function TrainTogetherSheet({
  user,
  session,
  partners,
  palettes,
  invite,
  inviteSeconds,
  creatingInvite,
  joining,
  leaving,
  initialTab = 'code',
  onCreateInvite,
  onJoin,
  onLeave,
  onClose,
}: {
  user: User;
  session: TrainSession | null;
  partners: TrainMember[];
  palettes: PartnerPalette[];
  invite: TrainInvite | null;
  inviteSeconds: number;
  creatingInvite: boolean;
  joining: boolean;
  leaving: boolean;
  initialTab?: SheetTab;
  onCreateInvite: () => Promise<TrainInvite | null>;
  onJoin: (token: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [scanProblem, setScanProblem] = useState<ScanProblem | null>(null);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const [addedFriendIds, setAddedFriendIds] = useState<ReadonlySet<string>>(() => new Set());
  const toast = useToast();
  const canShare = typeof navigator.share === 'function';

  const maxMembers = session?.max_members ?? TRAIN_MAX_MEMBERS;
  const sessionFull = (session?.members.length ?? 0) >= maxMembers;

  // Auto-fetch a fresh invite whenever the My code tab is open and no live code is held.
  useEffect(() => {
    if (tab !== 'code' || sessionFull || invite || creatingInvite || inviteError) return;
    let cancelled = false;
    void onCreateInvite().catch((reason: unknown) => {
      if (cancelled) return;
      setInviteError(
        reason instanceof Error ? reason.message : 'Could not create a Train together code.',
      );
    });
    return () => {
      cancelled = true;
    };
  }, [tab, sessionFull, invite, creatingInvite, inviteError, onCreateInvite]);

  const inviteUrl = invite ? trainInviteLink(invite.token, window.location.origin) : null;
  const progressPct = Math.min(100, Math.max(0, (inviteSeconds / TRAIN_INVITE_SECONDS) * 100));

  async function shareLink() {
    if (!inviteUrl) return;
    setShareError(null);
    if (canShare) {
      try {
        await navigator.share({
          title: `Train with ${user.display_name} on Relay`,
          url: inviteUrl,
        });
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.show('Link copied');
    } catch {
      setShareError('Could not copy the link.');
    }
  }

  async function handleScannedTrain(token: string) {
    setScanProblem(null);
    try {
      await onJoin(token);
      onClose();
    } catch (reason) {
      if (reason instanceof ApiError) {
        setScanProblem({
          message: reason.message,
          member: reason.code === TRAIN_ERRORS.notFriends ? reason.member : undefined,
        });
      } else {
        setScanProblem({
          message: reason instanceof Error ? reason.message : 'Could not join this session.',
        });
      }
    }
  }

  async function handleAddFriend(member: ApiErrorMember) {
    if (addingFriendId === member.user_id || addedFriendIds.has(member.user_id)) return;
    setAddingFriendId(member.user_id);
    try {
      const result = await api.sharing.addFriend(member.user_id);
      setAddedFriendIds((current) => new Set(current).add(member.user_id));
      toast.show(
        result.status === 'friends'
          ? `Added ${member.name} as a friend`
          : `Friend request sent to ${member.name}`,
      );
    } catch (reason) {
      toast.show({
        message: reason instanceof Error ? reason.message : 'Could not send friend request.',
        variant: 'error',
      });
    } finally {
      setAddingFriendId(null);
    }
  }

  async function handleLeave() {
    try {
      await onLeave();
      onClose();
    } catch (reason) {
      toast.show({
        message: reason instanceof Error ? reason.message : 'Could not leave the session.',
        variant: 'error',
      });
    }
  }

  return (
    <PopupDialog
      variant="sheet"
      title={TRAIN_TOGETHER_LABEL}
      className="train-together-sheet"
      onClose={onClose}
    >
      <div
        className="segmented-control tt-sheet-modes"
        role="tablist"
        aria-label="Train together view"
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
            aria-selected={tab === value}
            className={tab === value ? 'active' : ''}
            onClick={() => {
              setTab(value);
              setScanProblem(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'scan' ? (
        <div className="tt-sheet-scan">
          <FriendQrScanner
            userId={user.id}
            mode="train"
            paused={joining}
            onScanned={(accountId) => {
              onClose();
              openFriendInvite(accountId);
            }}
            onScannedTrain={(token) => void handleScannedTrain(token)}
          />
          {scanProblem && (
            <div className="tt-scan-error" role="alert">
              <p>{scanProblem.message}</p>
              {scanProblem.member && (
                <button
                  type="button"
                  className="pulse-button primary tt-add-friend-btn"
                  disabled={
                    addingFriendId === scanProblem.member.user_id ||
                    addedFriendIds.has(scanProblem.member.user_id)
                  }
                  onClick={() => void handleAddFriend(scanProblem.member!)}
                >
                  {addedFriendIds.has(scanProblem.member.user_id)
                    ? 'Friend request sent'
                    : addingFriendId === scanProblem.member.user_id
                      ? 'Sending…'
                      : 'Add friend'}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="tt-sheet-body">
          {sessionFull ? (
            <div className="tt-sheet-full" role="status">
              <strong>
                Session full ({session?.members.length ?? maxMembers}/{maxMembers})
              </strong>
            </div>
          ) : inviteError ? (
            <div className="tt-sheet-error" role="alert">
              <p>{inviteError}</p>
              <button
                type="button"
                className="pulse-button secondary tt-full-btn"
                onClick={() => setInviteError(null)}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="tt-qr-card">
                <div className="tt-qr-box" aria-busy={!inviteUrl}>
                  {inviteUrl && (
                    <QrCode
                      value={inviteUrl}
                      label={`QR code to train together with ${user.display_name}`}
                    />
                  )}
                </div>
                <div className="tt-countdown-track" aria-hidden="true">
                  <div className="tt-countdown-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="tt-qr-person">
                  <div className="tt-qr-person-id">
                    <TrainTogetherAvatar
                      person={{
                        display_name: user.display_name,
                        username: user.username,
                        photo_url: user.profile_photo_url,
                      }}
                      size="lg"
                      variant="self"
                    />
                    <div className="tt-qr-person-copy">
                      <strong>{user.display_name}</strong>
                      <span>@{user.username}</span>
                    </div>
                  </div>
                  <span
                    className="tt-countdown-pill num"
                    aria-label={`Code expires in ${inviteCountdownLabel(inviteSeconds)}`}
                  >
                    <Icon name="timer" />
                    {inviteCountdownLabel(inviteSeconds)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="pulse-button secondary tt-full-btn"
                disabled={!inviteUrl}
                onClick={() => void shareLink()}
              >
                <Icon name="link" />
                <span>{canShare ? 'Share link' : 'Copy link'}</span>
              </button>
              {shareError && (
                <p className="inline-error" role="alert">
                  {shareError}
                </p>
              )}
            </>
          )}

          {partners.length > 0 && (
            <div className="tt-sheet-session">
              <ul className="tt-sheet-members" aria-label="Training together">
                {partners.map((partner, index) => (
                  <li key={partner.user_id} className="tt-sheet-member">
                    <TrainTogetherAvatar
                      person={partner}
                      size="md"
                      palette={palettes[index]}
                      live={partner.workout !== null}
                    />
                    <span className="tt-sheet-member-copy">
                      <strong>{memberName(partner)}</strong>
                      <small>
                        {partner.workout
                          ? partner.workout.draft.name || 'Live workout'
                          : 'No workout open'}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="pulse-button danger-soft tt-full-btn"
                disabled={leaving}
                onClick={() => void handleLeave()}
              >
                {leaving ? 'Leaving…' : 'Leave session'}
              </button>
            </div>
          )}
        </div>
      )}
    </PopupDialog>
  );
}
