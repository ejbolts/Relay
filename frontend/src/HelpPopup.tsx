import { useState, type ReactNode } from 'react';
import { PopupDialog } from './PopupDialog';
import './helpPopup.css';

export function HelpPopup({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-popup" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="auth-help-button"
        aria-label={`About ${title.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <PopupDialog title={title} className="help-popup-dialog" onClose={() => setOpen(false)}>
          {children}
        </PopupDialog>
      )}
    </span>
  );
}
