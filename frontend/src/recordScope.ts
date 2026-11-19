import type { PersonalRecord } from './types';

type Scoped = Pick<PersonalRecord, 'scope'>;

/** Records without a scope come from servers that only kept all-time records. */
export const isAllTimeRecord = (record: Scoped) => !record.scope || record.scope === 'all_time';

/** Names a record's scope for tooltips, such as the “Fresh start” in “Fresh start Weight PR”. */
export function recordScopeLabel(record: Scoped) {
  if (isAllTimeRecord(record)) return 'All-time';
  return record.scope === 'fresh_start' ? 'Fresh start' : 'Block';
}

/** One badge for a set's records, named by the broadest scope among them. */
export function recordBadgeLabel(records: Scoped[]) {
  if (records.some(isAllTimeRecord)) return 'All-time PR';
  return records.some((record) => record.scope === 'fresh_start') ? 'Fresh start PR' : 'Block PR';
}
