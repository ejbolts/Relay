import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  id: string;
  /** The eye button's name, such as "Show new password". */
  revealLabel?: string;
};

/** A password field with an eye to show what was typed, or the eye with a line to hide it. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ id, revealLabel = 'Show password', ...props }, ref) {
    const [shown, setShown] = useState(false);
    return (
      <div className="auth-password">
        <input
          ref={ref}
          id={id}
          type={shown ? 'text' : 'password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...props}
        />
        <button
          type="button"
          className="auth-reveal"
          // One name with a pressed state; the eye shows what a tap will do.
          aria-label={revealLabel}
          aria-pressed={shown}
          aria-controls={id}
          title={shown ? revealLabel.replace(/^Show/, 'Hide') : revealLabel}
          onClick={() => setShown((current) => !current)}
        >
          <Icon name={shown ? 'hide' : 'eye'} />
        </button>
      </div>
    );
  },
);
