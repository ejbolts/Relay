import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { useTrainingBlocks } from './trainingBlocksContext';
import { localDate } from './utils';
import type { TrainingBlock, TrainingBlocks } from './types';
import './trainingBlocks.css';

export function TrainingBlockControls() {
  const { config, block, select, changed, loading, error: loadError, retry } = useTrainingBlocks();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingBlock | null>(null);
  const [removing, setRemoving] = useState<TrainingBlock | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState(localDate());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const close = () => {
    if (busyRef.current) return;
    setOpen(false);
    setRemoving(null);
    setError(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const reset = () => {
    setEditing(null);
    setName('');
    setStart(localDate());
  };
  async function save(
    action: () => Promise<TrainingBlocks>,
    message: string,
    chooseStart?: string,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      changed(next);
      if (chooseStart) select(next.blocks.find((item) => item.start_date === chooseStart)!.id);
      if (chooseStart || removing) {
        setOpen(false);
        requestAnimationFrame(() => trigger.current?.focus());
        setNotice(message);
      }
      reset();
      setRemoving(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save training blocks.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save(
      () =>
        editing
          ? api.trainingBlocks.update(editing.id, { name: name.trim(), start_date: start })
          : api.trainingBlocks.create({ name: name.trim(), start_date: start }),
      editing ? 'Training block updated' : 'Training block started',
      start,
    );
  }
  return (
    <>
      <div className="training-block-controls">
        <label>
          Training block
          <select
            aria-label="Training block"
            value={block?.id ?? 'all'}
            disabled={loading || !!loadError}
            onChange={(event) => select(event.target.value)}
          >
            <option value="all">All time</option>
            {[...config.blocks].reverse().map((item, index) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {index === 0 ? ' · Current' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          ref={trigger}
          type="button"
          className="secondary"
          disabled={loading || !!loadError}
          onClick={() => {
            reset();
            setError(null);
            setOpen(true);
          }}
        >
          Manage blocks
        </button>
      </div>
      {loadError && (
        <p role="alert">
          {loadError}{' '}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {notice &&
        createPortal(
          <div className="undo-toast top-toast" role="status">
            <span>{notice}</span>
            <button
              type="button"
              className="undo-toast-close"
              aria-label="Dismiss training block notification"
              onClick={() => setNotice('')}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
      {open && (
        <PopupDialog
          title={removing ? 'Remove training block?' : 'Training blocks'}
          onClose={close}
          className="training-block-dialog"
        >
          {removing ? (
            <>
              <p>
                Remove “{removing.name}”? Workouts stay saved. Block records will follow the
                remaining dates, and yearly rollover will turn off.
              </p>
              <div className="training-block-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRemoving(null);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      () => api.trainingBlocks.remove(removing.id),
                      'Training block removed',
                    )
                  }
                >
                  Remove block
                </button>
              </div>
            </>
          ) : (
            <>
              {config.blocks.length > 0 && (
                <ul className="training-block-list">
                  {[...config.blocks].reverse().map((item, index) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        {index === 0 && <span className="badge">Current</span>}
                        <time>{item.start_date}</time>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${item.name}`}
                        disabled={busy}
                        onClick={() => {
                          setEditing(item);
                          setName(item.name);
                          setStart(item.start_date);
                          setError(null);
                        }}
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${item.name}`}
                        disabled={busy}
                        onClick={() => {
                          setRemoving(item);
                          setError(null);
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={submit} className="training-block-form">
                <h3>{editing ? 'Edit block' : 'Start new block'}</h3>
                <fieldset disabled={busy}>
                  <label>
                    Block name
                    <input
                      required
                      maxLength={80}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g. Winter strength"
                    />
                  </label>
                  <label>
                    Start date
                    <input
                      required
                      type="date"
                      max={localDate()}
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                    />
                  </label>
                  <div className="training-block-actions">
                    <button
                      type="button"
                      onClick={() => setStart(`${localDate().slice(0, 4)}-01-01`)}
                    >
                      1 January
                    </button>
                    <button type="button" onClick={() => setStart(localDate())}>
                      Today
                    </button>
                  </div>
                  <div className="training-block-actions">
                    {editing && (
                      <button type="button" onClick={reset}>
                        Cancel edit
                      </button>
                    )}
                    <button type="submit" className="primary-action" disabled={!name.trim()}>
                      {busy ? 'Saving…' : editing ? 'Save block' : 'Start block'}
                    </button>
                  </div>
                </fieldset>
              </form>
              <label className="training-block-yearly">
                <input
                  type="checkbox"
                  checked={config.auto_yearly}
                  disabled={busy || !config.blocks.length}
                  onChange={(event) =>
                    void save(
                      () => api.trainingBlocks.preferences(event.target.checked),
                      'Yearly rollover updated',
                    )
                  }
                />
                Start a new block each January
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </PopupDialog>
      )}
    </>
  );
}
