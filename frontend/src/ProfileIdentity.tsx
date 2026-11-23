import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { PROFILE_PHOTO_ERRORS, profileNameError } from './authRules';
import { FriendInviteButton } from './FriendQrCode';
import { Icon } from './Icon';
import { optimisePhoto } from './photoOptimise';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfilePhotoCrop } from './ProfilePhotoCrop';
import { DEFAULT_PHOTO_CROP, type PhotoCrop } from './profilePhotoGeometry';
import { useToast } from './Toast';
import { motionReduced } from './motion';
import { formatMemberSince, SEX_LABELS } from './profileDisplay';
import { SexMark } from './SexMark';
import type { Sex, User } from './types';
import { SettingsNavigationContext } from './settingsNavigation';

/** Identity is read-only until Edit profile; photo and text drafts share Save and Cancel. */
export function ProfileIdentity({
  user,
  onSaved,
  onChooseSharing,
  children,
}: {
  user: User;
  onSaved: (user: User) => void;
  /** Shows the friend QR code button, which can lead to the sharing choices. */
  onChooseSharing?: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const requestedFocus = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.display_name);
  // Chosen once: the draft exists only until the account has a sex.
  const [sex, setSex] = useState<Sex | null>(null);
  const [confirmingSex, setConfirmingSex] = useState(false);
  const sexConfirmed = useRef(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<File | string | null>(null);
  const [photoSource, setPhotoSource] = useState<File | string | null>(null);
  const [photoCrop, setPhotoCrop] = useState<PhotoCrop>(DEFAULT_PHOTO_CROP);
  const cropButton = useRef<HTMLButtonElement>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const navigation = useContext(SettingsNavigationContext);
  const handledJump = useRef(0);
  const editRequest = navigation?.request?.destination.editProfile ? navigation.request : null;

  useEffect(() => {
    if (!editRequest || handledJump.current === editRequest.serial) return;
    handledJump.current = editRequest.serial;
    if (!editing) {
      requestedFocus.current = editRequest.destination.selector;
      setDisplayName(user.display_name);
      setError(null);
      setEditing(true);
    }
  }, [editRequest, editing, user.display_name]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!editing) return;
    const target = requestedFocus.current
      ? section.current?.querySelector<HTMLElement>(requestedFocus.current)
      : null;
    requestedFocus.current = null;
    if (target) {
      if (!target.matches('input,button,select,textarea,a')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    } else nameInput.current?.focus();
  }, [editing]);

  // Opening or closing the editor grows or shrinks the card from its last height.
  const renderedHeight = useRef<number | null>(null);
  const shownEditing = useRef(editing);
  const resizing = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const card = section.current;
    if (shownEditing.current === editing) return;
    shownEditing.current = editing;
    if (!card) return;
    // Toggling mid-animation continues from the height currently on screen.
    const running = resizing.current?.playState === 'running';
    const from = running ? card.getBoundingClientRect().height : renderedHeight.current;
    resizing.current?.cancel();
    resizing.current = null;
    const to = card.getBoundingClientRect().height;
    renderedHeight.current = to;
    if (from === null || motionReduced() || typeof card.animate !== 'function') return;
    if (Math.abs(to - from) < 1) return;
    card.style.overflow = 'hidden';
    const resize = card.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 280,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
    const done = () => card.style.removeProperty('overflow');
    resize.onfinish = done;
    resize.oncancel = done;
    resizing.current = resize;
  }, [editing]);
  useLayoutEffect(() => {
    // Measuring during a resize would record an in-between height.
    if (resizing.current?.playState === 'running') return;
    renderedHeight.current = section.current?.getBoundingClientRect().height ?? null;
  });

  const photoUrl = editing
    ? (preview ?? (removePhoto ? null : user.profile_photo_url))
    : user.profile_photo_url;
  const sexDirty = !user.sex && sex !== null;
  const textDirty = displayName.trim() !== user.display_name || sexDirty;
  const dirty = textDirty || photo !== null || removePhoto;
  const joined = formatMemberSince(user.created_at);

  function edit() {
    setDisplayName(user.display_name);
    setSex(null);
    setPhoto(null);
    setPhotoSource(null);
    setPhotoCrop(DEFAULT_PHOTO_CROP);
    setRemovePhoto(false);
    setError(null);
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setSex(null);
    setConfirmingSex(false);
    setPhoto(null);
    setPhotoSource(null);
    setCropSource(null);
    setRemovePhoto(false);
    setError(null);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (saving || !dirty) return;
    setError(null);
    const nameError = profileNameError(displayName);
    if (nameError) {
      setError(nameError);
      return;
    }
    // A sex cannot be changed later, so saving one is confirmed first.
    if (sexDirty && !sexConfirmed.current) {
      setConfirmingSex(true);
      return;
    }
    sexConfirmed.current = false;
    setSaving(true);
    let detailsSaved = false;
    try {
      // Decode/resize the draft before saving anything, so a local photo failure keeps all drafts.
      const upload = photo ? await optimisePhoto(photo, 1024) : null;
      if (textDirty) {
        onSaved(
          await api.updateProfile({
            ...(displayName.trim() !== user.display_name
              ? { display_name: displayName.trim() }
              : {}),
            ...(sexDirty && sex ? { sex } : {}),
          }),
        );
        detailsSaved = true;
      }
      if (upload) onSaved(await api.uploadProfilePhoto(upload));
      else if (removePhoto) onSaved(await api.removeProfilePhoto());
      close();
      if (!photo && !removePhoto) toast.show('Profile saved.');
    } catch (reason) {
      const message =
        reason instanceof ApiError && PROFILE_PHOTO_ERRORS.has(reason.code)
          ? reason.message
          : authErrorMessage(reason);
      setError(`${detailsSaved ? 'Your details were saved. ' : ''}${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      ref={section}
      className={`settings-panel panel profile-summary profile-identity${editing ? ' is-editing' : ''}`}
      aria-label={editing ? 'Edit profile' : 'Signed-in account'}
    >
      <div className="profile-summary-main">
        {editing ? (
          <button
            className="profile-photo-edit"
            type="button"
            disabled={saving}
            aria-label={photoUrl ? 'Change profile photo' : 'Add profile photo'}
            onClick={() => input.current?.click()}
          >
            <ProfileAvatar
              className="profile-avatar"
              user={{ ...user, profile_photo_url: photoUrl }}
            />
            <Icon name="edit" />
          </button>
        ) : (
          <ProfileAvatar className="profile-avatar" user={user} viewable />
        )}
        <div className="profile-summary-copy">
          <strong>
            <span className="profile-name">
              {user.display_name}
              <SexMark sex={user.sex} />
            </span>
            {user.is_admin && <span className="profile-badge">Admin</span>}
          </strong>
          <span>{user.username}</span>
          {joined && <small>Joined {joined}</small>}
        </div>
        {!editing && (
          <div className="profile-identity-actions">
            {onChooseSharing && (
              <FriendInviteButton user={user} onChooseSharing={onChooseSharing} />
            )}
            <button
              ref={editButton}
              className="profile-edit-button"
              type="button"
              aria-label="Edit profile"
              onClick={edit}
            >
              <Icon name="edit" />
              <span>Edit profile</span>
            </button>
          </div>
        )}
      </div>
      {editing && (
        <>
          <input
            ref={input}
            className="sr-only"
            type="file"
            tabIndex={-1}
            aria-hidden="true"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) {
                setCropSource(file);
                setError(null);
              }
            }}
          />
          {photoUrl && (
            <div className="profile-photo-actions">
              <button
                ref={cropButton}
                type="button"
                className="text-link"
                disabled={saving}
                onClick={() => setCropSource(photoSource ?? photoUrl)}
              >
                Adjust crop
              </button>
              <button
                type="button"
                className="text-link profile-photo-remove"
                disabled={saving}
                onClick={() => {
                  setPhoto(null);
                  setPhotoSource(null);
                  setRemovePhoto(Boolean(user.profile_photo_url));
                  setError(null);
                }}
              >
                Remove photo
              </button>
            </div>
          )}
          <form className="profile-form" noValidate onSubmit={(event) => void save(event)}>
            <label className="auth-field" htmlFor={`${id}-name`}>
              <span>Name</span>
              <input
                ref={nameInput}
                id={`${id}-name`}
                type="text"
                autoComplete="name"
                autoCapitalize="words"
                required
                disabled={saving}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            {/* Only an administrator can change a username. */}
            <div className="auth-field profile-username-field">
              <span>Username</span>
              <p className="profile-locked-value">
                {user.username}
                <Icon name="lock" />
                <span className="sr-only">Locked</span>
              </p>
            </div>
            <div className="auth-field profile-sex-field">
              <span id={`${id}-sex`}>Sex</span>
              {user.sex ? (
                <p className="profile-locked-value">
                  <Icon name={user.sex} />
                  {SEX_LABELS[user.sex]}
                  <Icon name="lock" />
                  <span className="sr-only">Locked</span>
                </p>
              ) : (
                <>
                  <div
                    className="segmented-control"
                    role="radiogroup"
                    aria-labelledby={`${id}-sex`}
                    aria-describedby={`${id}-sex-hint`}
                  >
                    {(['male', 'female'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={sex === option}
                        className={sex === option ? 'active' : undefined}
                        disabled={saving}
                        onClick={() => setSex(sex === option ? null : option)}
                      >
                        {SEX_LABELS[option]}
                      </button>
                    ))}
                  </div>
                  <small id={`${id}-sex-hint`} className="auth-hint">
                    Only an administrator can change this once saved.
                  </small>
                </>
              )}
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="profile-button-row">
              <button type="button" className="profile-secondary" disabled={saving} onClick={close}>
                Cancel
              </button>
              <button type="submit" className="profile-primary" disabled={saving || !dirty}>
                {saving && <span className="auth-spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        </>
      )}
      {confirmingSex && sex && (
        <PopupDialog
          title={`Save your sex as ${SEX_LABELS[sex]}?`}
          className="profile-sex-confirm"
          size="compact"
          onClose={() => setConfirmingSex(false)}
          actions={
            <>
              <button type="button" onClick={() => setConfirmingSex(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="popup-primary-action"
                onClick={() => {
                  sexConfirmed.current = true;
                  setConfirmingSex(false);
                  void save();
                }}
              >
                Save
              </button>
            </>
          }
        >
          <p>
            It sets your body measurement outline. After you save, only an administrator can change
            it.
          </p>
        </PopupDialog>
      )}
      {cropSource && (
        <ProfilePhotoCrop
          source={cropSource}
          initialCrop={cropSource === photoSource ? photoCrop : DEFAULT_PHOTO_CROP}
          onUse={(file, crop) => {
            setPhoto(file);
            setPhotoSource(cropSource);
            setPhotoCrop(crop);
            setRemovePhoto(false);
            setCropSource(null);
            setError(null);
            requestAnimationFrame(() => cropButton.current?.focus());
          }}
          onClose={() => {
            setCropSource(null);
            requestAnimationFrame(() =>
              (
                cropButton.current ??
                section.current?.querySelector<HTMLButtonElement>('.profile-photo-edit')
              )?.focus(),
            );
          }}
        />
      )}
      {children}
    </section>
  );
}
