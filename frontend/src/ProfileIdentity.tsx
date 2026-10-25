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
import { authErrorMessage, USERNAME_HINT, validateUsername } from './authForm';
import { Icon } from './Icon';
import { optimisePhoto } from './photoOptimise';
import { ProfileAvatar } from './ProfileAvatar';
import { motionReduced } from './motion';
import { formatMemberSince } from './profileDisplay';
import type { User } from './types';
import { SettingsNavigationContext } from './settingsNavigation';

const PHOTO_ERRORS = new Set([
  'invalid_photo',
  'unsupported_photo_type',
  'photo_too_large',
  'photo_dimensions_too_large',
]);

/** Identity is read-only until Edit profile; photo and text drafts share Save and Cancel. */
export function ProfileIdentity({
  user,
  onSaved,
  children,
}: {
  user: User;
  onSaved: (user: User) => void;
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
  const [username, setUsername] = useState(user.username);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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
      setUsername(user.username);
      setStatus(null);
      setError(null);
      setEditing(true);
    }
  }, [editRequest, editing, user.display_name, user.username]);

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
  const textDirty = displayName.trim() !== user.display_name || username.trim() !== user.username;
  const dirty = textDirty || photo !== null || removePhoto;
  const joined = formatMemberSince(user.created_at);

  function edit() {
    setDisplayName(user.display_name);
    setUsername(user.username);
    setPhoto(null);
    setRemovePhoto(false);
    setStatus(null);
    setError(null);
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setPhoto(null);
    setRemovePhoto(false);
    setError(null);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setError(null);
    setStatus(null);
    if (!displayName.trim()) {
      setError('Enter a name to show in the app.');
      return;
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }
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
            ...(username.trim() !== user.username ? { username: username.trim() } : {}),
          }),
        );
        detailsSaved = true;
      }
      if (upload) onSaved(await api.uploadProfilePhoto(upload));
      else if (removePhoto) onSaved(await api.removeProfilePhoto());
      close();
      setStatus('Profile saved.');
    } catch (reason) {
      const message =
        reason instanceof ApiError && PHOTO_ERRORS.has(reason.code)
          ? reason.message
          : authErrorMessage(reason);
      setError(`${detailsSaved ? 'Your name and username were saved. ' : ''}${message}`);
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
          <ProfileAvatar className="profile-avatar" user={user} />
        )}
        <div className="profile-summary-copy">
          <strong>
            {user.display_name}
            {user.is_admin && <span className="profile-badge">Admin</span>}
          </strong>
          <span>{user.username}</span>
          {joined && <small>Joined {joined}</small>}
        </div>
        {!editing && (
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
                setPhoto(file);
                setRemovePhoto(false);
                setError(null);
              }
            }}
          />
          {photoUrl && (
            <button
              type="button"
              className="text-link profile-photo-remove"
              disabled={saving}
              onClick={() => {
                setPhoto(null);
                setRemovePhoto(Boolean(user.profile_photo_url));
                setError(null);
              }}
            >
              Remove photo
            </button>
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
            <label className="auth-field" htmlFor={`${id}-username`}>
              <span>Username</span>
              <input
                id={`${id}-username`}
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={32}
                disabled={saving}
                value={username}
                aria-describedby={`${id}-username-hint`}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <small id={`${id}-username-hint`} className="auth-hint">
              {USERNAME_HINT}
            </small>
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
      {status && (
        <p className="notification-setting-status" role="status">
          {status}
        </p>
      )}
      {children}
    </section>
  );
}
