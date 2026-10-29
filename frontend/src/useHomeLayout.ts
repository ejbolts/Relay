import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { DEFAULT_HOME_SECTION_SETTINGS, defaultHomeLayout } from './homeLayout';
import { useUserSession } from './userContext';

export function useHomeLayout(active = true) {
  const { user } = useUserSession();
  const [layout, setLayout] = useState(defaultHomeLayout);
  const [loaded, setLoaded] = useState(!user);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(defaultHomeLayout);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const editButton = useRef<HTMLButtonElement>(null);
  const focusAfterEdit = useRef(false);

  useEffect(() => {
    if (editing) focusAfterEdit.current = true;
    else if (!saving && focusAfterEdit.current) {
      editButton.current?.focus();
      focusAfterEdit.current = false;
    }
  }, [editing, saving]);

  useEffect(() => {
    if (active) return;
    setEditing(false);
    setDragging(false);
    setDraft(defaultHomeLayout());
    setError(null);
    setMessage('');
  }, [active]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoaded(false);
    setLoadError(false);
    void api
      .getHomeLayout()
      .then((saved) => {
        if (!cancelled) {
          setLayout(saved);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, attempt]);

  function edit() {
    setDraft({
      order: [...layout.order],
      hidden: [...layout.hidden],
      widths: { ...layout.widths },
      settings: { ...DEFAULT_HOME_SECTION_SETTINGS, ...layout.settings },
    });
    setError(null);
    setMessage('');
    setEditing(true);
  }

  function cancel() {
    setError(null);
    setMessage('Changes cancelled.');
    finish();
  }

  function finish() {
    setEditing(false);
    setDragging(false);
  }

  async function save() {
    if (saving || dragging) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveHomeLayout(draft);
      setLayout(saved);
      setMessage('Home layout saved.');
      finish();
    } catch {
      setError(
        'Could not save your layout. Your changes are still here. Use the pencil or green tick to try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    layout,
    loaded,
    loadError,
    editing,
    draft,
    saving,
    dragging,
    setDragging,
    error,
    message,
    editButton,
    retry: () => setAttempt((value) => value + 1),
    edit,
    cancel,
    // The Today pencil saves the draft when tapped again. Cancel remains in the bottom bar.
    toggleEditing: () => {
      if (saving || dragging) return;
      if (editing) void save();
      else edit();
    },
    change: setDraft,
    reset: () => {
      setDraft(defaultHomeLayout());
      setError(null);
      setMessage('Default layout restored. Tap the green tick to keep it.');
    },
    save,
  };
}
