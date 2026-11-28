import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, api, type ApiErrorMember } from './api';
import { QrCode } from './FriendQrCode';
import { FriendQrScanner } from './FriendQrScanner';
import { openFriendInvite } from './friendInvite';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { useToast } from './Toast';
import {
  friendRequestSentNotice,
  inviteCountdownLabel,
  leaveFailedNotice,
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
import { partnerWorkoutName } from './trainTogetherView';
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
  onLeave: () => Promise<boolean | void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteAttempt, setInviteAttempt] = useState(0);
  const [scanRetryKey, setScanRetryKey] = useState(0);
  const [shareError, setShareError] = useState<string | null>(null);
  const [scanProblem, setScanProblem] = useState<ScanProblem | null>(null);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const [addedFriendIds, setAddedFriendIds] = useState<ReadonlySet<string>>(() => new Set());
  const toast = useToast();
  const canShare = typeof navigator.share === 'function';
  const idPrefix = useId();
  const codeTabRef = useRef<HTMLButtonElement>(null);
  const scanTabRef = useRef<HTMLButtonElement>(null);

  const maxMembers = session?.max_members ?? TRAIN_MAX_MEMBERS;
  const sessionFull = (session?.members.length ?? 0) >= maxMembers;
  // Only render a held invite that matches the current session (when a session is loaded).
  const activeInvite = invite && (!session || invite.session_id === session.id) ? invite : null;

  const mountedRef = useRef(true);
  const inFlightInviteRef = useRef(false);
  const onCreateInviteRef = useRef(onCreateInvite);
  onCreateInviteRef.current = onCreateInvite;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Request one invite when My code is showing and no live code is held; never auto-retry errors.
  useEffect(() => {
    if (tab !== 'code' || sessionFull || activeInvite || inviteError || inFlightInviteRef.current) {
      return;
    }
    inFlightInviteRef.current = true;
    void onCreateInviteRef
      .current()
      .catch((reason: unknown) => {
        if (!mountedRef.current) return;
        setInviteError(
          reason instanceof Error ? reason.message : 'Could not create a Train together code.',
        );
      })
      .finally(() => {
        inFlightInviteRef.current = false;
      });
  }, [tab, sessionFull, activeInvite, inviteError, inviteAttempt, user.id, session?.id]);

  // Keep `creatingInvite` consumed for aria-busy while request is pending.
  const inviteUrl = activeInvite
    ? trainInviteLink(activeInvite.token, window.location.origin)
    : null;
  const inviteBusy = creatingInvite || !inviteUrl;
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
          : friendRequestSentNotice(member.name),
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
      const ok = await onLeave();
      if (ok !== false) onClose();
    } catch {
      toast.show({
        message: leaveFailedNotice,
        variant: 'error',
      });
    }
  }

  function selectTab(next: SheetTab, moveFocus = false) {
    setTab(next);
    setScanProblem(null);
    if (moveFocus) {
      (next === 'code' ? codeTabRef : scanTabRef).current?.focus();
    }
  }

  const codeTabId = `${idPrefix}-tab-code`;
  const scanTabId = `${idPrefix}-tab-scan`;
  const codePanelId = `${idPrefix}-panel-code`;
  const scanPanelId = `${idPrefix}-panel-scan`;

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
            ['code', 'My code', codeTabId, codePanelId, codeTabRef],
            ['scan', 'Scan', scanTabId, scanPanelId, scanTabRef],
          ] as const
        ).map(([value, label, tabId, panelId, tabRef]) => (
          <button
            key={value}
            ref={tabRef}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={panelId}
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? 'active' : ''}
            onClick={() => selectTab(value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                selectTab(tab === 'code' ? 'scan' : 'code', true);
              } else if (event.key === 'Home') {
                event.preventDefault();
                selectTab('code', true);
              } else if (event.key === 'End') {
                event.preventDefault();
                selectTab('scan', true);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'scan' ? (
        <div id={scanPanelId} role="tabpanel" aria-labelledby={scanTabId} className="tt-sheet-scan">
          <FriendQrScanner
            userId={user.id}
            mode="train"
            paused={joining}
            retryKey={scanRetryKey}
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
              <button
                type="button"
                className="pulse-button secondary tt-full-btn"
                onClick={() => {
                  setScanProblem(null);
                  setScanRetryKey((count) => count + 1);
                }}
              >
                Scan again
              </button>
            </div>
          )}
        </div>
      ) : (
        <div id={codePanelId} role="tabpanel" aria-labelledby={codeTabId} className="tt-sheet-body">
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
                onClick={() => {
                  setInviteError(null);
                  setInviteAttempt((count) => count + 1);
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="tt-qr-card">
                <div className="tt-qr-box" aria-busy={inviteBusy}>
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
                        {partner.workout ? partnerWorkoutName(partner.workout) : 'No workout open'}
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
