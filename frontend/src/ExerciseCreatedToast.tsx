import { Toast, TOAST_MS } from './Toast';

// eslint-disable-next-line react-refresh/only-export-components
export const EXERCISE_CREATED_TOAST_MS = TOAST_MS.action;

/** Brief confirmation that an exercise joined the library, with a shortcut to it. */
export function ExerciseCreatedToast({
  name,
  onOpen,
  onDismiss,
}: {
  name: string;
  onOpen?: () => void;
  onDismiss: () => void;
}) {
  return (
    <Toast
      id={name}
      message={`${name} added`}
      action={
        onOpen && {
          label: 'Open',
          run: () => {
            onDismiss();
            onOpen();
          },
        }
      }
      dismissLabel="Dismiss exercise notification"
      onDismiss={onDismiss}
    />
  );
}
