import type { Sex, User } from './types';

export const SEX_LABELS: Record<Sex, string> = { male: 'Male', female: 'Female' };

export function profileInitial(user: Pick<User, 'display_name' | 'username'>): string {
  const source = user.display_name.trim() || user.username.trim();
  return (source[0] ?? '?').toUpperCase();
}

export function formatMemberSince(
  createdAt: string,
  month: 'long' | 'short' = 'long',
): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { month, year: 'numeric' });
}

/** A profile total, such as "1,204", or a dash while it is unknown. */
export function formatProfileTotal(value: number | null | undefined): string {
  return value == null ? '–' : value.toLocaleString();
}
