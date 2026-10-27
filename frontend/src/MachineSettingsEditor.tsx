import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { MachineSetting } from './types';
import './machineSettings.css';

type Row = MachineSetting & { key: string };
const numericValue = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
const row = (setting: MachineSetting = { name: '', value: '' }): Row => ({
  ...setting,
  key: crypto.randomUUID(),
});
const rowsFor = (settings: MachineSetting[]) => (settings.length ? settings.map(row) : [row()]);

export function MachineSettingsEditor({
  id,
  hidden = false,
  exerciseId,
  initialSettings,
  onChange,
  onSaved,
}: {
  id?: string;
  hidden?: boolean;
  exerciseId: string;
  initialSettings?: MachineSetting[];
  onChange: (settings: MachineSetting[]) => void;
  onSaved?: () => void;
}) {
  const initial = useRef(initialSettings);
  const onChangeRef = useRef(onChange);
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const [rows, setRows] = useState(() => rowsFor(initialSettings ?? []));
  const [loading, setLoading] = useState(initialSettings === undefined);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const newInput = useRef<HTMLInputElement>(null);
  const focusNew = useRef(false);
  const focusAfterRemove = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (initial.current !== undefined) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void api.getMachineSettings(exerciseId).then(
      ({ settings }) => {
        if (cancelled) return;
        setRows(rowsFor(settings));
        onChangeRef.current(settings);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [exerciseId, attempt]);

  useEffect(() => {
    if (focusNew.current) {
      newInput.current?.focus();
      focusNew.current = false;
    } else if (focusAfterRemove.current) {
      focusAfterRemove.current.focus();
      focusAfterRemove.current = null;
    }
  }, [rows.length]);

  function update(key: string, field: 'name' | 'value', value: string) {
    setRows((current) =>
      current.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );
    setMessage('');
    setError('');
  }

  async function save() {
    if (savingRef.current) return;
    const settings = rows
      .map(({ name, value }) => ({ name: name.trim(), value: value.trim() }))
      .filter(({ name, value }) => name || value);
    if (settings.some(({ name, value }) => !name || !value)) {
      setError('Enter a setting name and value.');
      setMessage('');
      return;
    }
    if (settings.some(({ value }) => !numericValue.test(value))) {
      setError('Enter a number for each value.');
      setMessage('');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await api.saveMachineSettings(exerciseId, settings);
      if (!mounted.current) return;
      setRows(rowsFor(saved.settings));
      onChangeRef.current(saved.settings);
      setMessage('Settings saved');
      onSaved?.();
    } catch {
      if (mounted.current) setError('Could not save settings. Try again.');
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <section id={id} hidden={hidden} className="machine-settings" aria-label="Machine settings">
      <h3>Settings</h3>
      {loading ? (
        <p role="status">Loading settings…</p>
      ) : loadError ? (
        <div className="machine-settings-error" role="alert">
          Could not load settings.
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <fieldset disabled={saving} aria-label="Custom machine settings">
            {rows.map((item, index) => (
              <div className="machine-setting-row" key={item.key}>
                <input
                  ref={index === rows.length - 1 ? newInput : undefined}
                  aria-label={`Setting ${index + 1} name`}
                  placeholder={index === 0 ? 'Seat' : 'Setting'}
                  value={item.name}
                  maxLength={40}
                  onChange={(event) => update(item.key, 'name', event.target.value)}
                />
                <input
                  aria-label={`${item.name.trim() || `Setting ${index + 1}`} value`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="5"
                  value={item.value}
                  maxLength={30}
                  onChange={(event) => update(item.key, 'value', event.target.value)}
                />
                <button
                  type="button"
                  className="machine-setting-remove"
                  aria-label={`Remove ${item.name.trim() || `setting ${index + 1}`}`}
                  onClick={(event) => {
                    const currentRow = event.currentTarget.parentElement;
                    focusAfterRemove.current =
                      currentRow?.nextElementSibling?.querySelector('input') ??
                      currentRow?.previousElementSibling?.querySelector('input') ??
                      addButton.current;
                    setRows((current) => current.filter(({ key }) => key !== item.key));
                    setMessage('');
                    setError('');
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="machine-settings-actions">
              <button
                ref={addButton}
                className="machine-setting-add"
                type="button"
                disabled={rows.length >= 20}
                onClick={() => {
                  focusNew.current = true;
                  setRows((current) => [...current, row()]);
                  setMessage('');
                  setError('');
                }}
              >
                + Add
              </button>
              <button className="machine-setting-save" type="button" onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}

export function MachineSettingsSummary({ settings }: { settings?: MachineSetting[] }) {
  if (!settings?.length) return null;
  return (
    <dl className="machine-settings-summary" aria-label="Machine settings">
      {settings.map((setting, index) => (
        <div key={index}>
          <dt>{setting.name}</dt>
          <dd>{setting.value}</dd>
        </div>
      ))}
    </dl>
  );
}
