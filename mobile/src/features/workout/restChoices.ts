import { formatSeconds } from '../../../../frontend/src/utils';
import type { MenuItem } from '../../ui/MenuButton';
import { promptText } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';

/** The rest times the logger offers, as the web's rest select does. */
export const REST_CHOICES = [30, 60, 90, 120, 150, 180, 210, 240];
/** The longest rest the web accepts (frontend/src/RestTimeSelect.tsx). */
export const MAX_REST_SECONDS = 7200;

/** "2:30" or "150" (seconds) as seconds, or null when it isn't a rest from 1 s to 2 hours. */
export function parseRestInput(text: string): number | null {
  const value = text.trim();
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(value);
  const seconds = clock
    ? Number(clock[1]) * 60 + Number(clock[2])
    : /^\d{1,5}$/.test(value)
      ? Number(value)
      : NaN;
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_REST_SECONDS ? seconds : null;
}

/**
 * A rest menu's items: the usual times (the current one ticked), optionally "No rest", and
 * Custom… for any other time, which asks for minutes and seconds.
 */
export function restMenuItems({
  current,
  onPick,
  onNone,
}: {
  current: number | null;
  onPick: (seconds: number) => void;
  onNone?: () => void;
}): MenuItem[] {
  const custom = current !== null && !REST_CHOICES.includes(current);
  return [
    ...REST_CHOICES.map((seconds) => ({
      label: formatSeconds(seconds),
      checked: seconds === current,
      onPress: () => onPick(seconds),
    })),
    ...(onNone ? [{ label: 'No rest', checked: current === null, onPress: onNone }] : []),
    {
      label: custom ? `Custom (${formatSeconds(current)})…` : 'Custom…',
      checked: custom,
      onPress: () =>
        promptText({
          title: 'Custom rest time',
          value: formatSeconds(current ?? 90),
          placeholder: 'm:ss',
          submitLabel: 'Set rest time',
          onSubmit: (text) => {
            const seconds = parseRestInput(text);
            if (seconds === null) showToast('Enter a rest such as 2:30, up to 2 hours.');
            else onPick(seconds);
          },
        }),
    },
  ];
}
