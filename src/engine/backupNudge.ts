/**
 * "Back up now?" — everything lives only on this phone, so a gentle
 * reminder: 7 days after the first entry if never backed up, then every
 * 30 days. "Later" snoozes for 7 days.
 */
const DAY = 86_400_000;
export const FIRST_NUDGE_DAYS = 7;
export const NUDGE_EVERY_DAYS = 30;
export const SNOOZE_DAYS = 7;

export interface BackupNudge {
  show: boolean;
  /** Whole days since the last backup; null if never backed up. */
  days_since: number | null;
}

export function backupNudge(input: {
  nowMs: number;
  lastBackupAt: number | null;
  /** When the oldest entry happened; null with no entries. */
  firstEntryAt: number | null;
  snoozedUntil: number | null;
}): BackupNudge {
  const { nowMs, lastBackupAt, firstEntryAt, snoozedUntil } = input;
  const days_since = lastBackupAt == null ? null : Math.floor((nowMs - lastBackupAt) / DAY);
  if (firstEntryAt == null || (snoozedUntil != null && nowMs < snoozedUntil)) return { show: false, days_since };
  const show = lastBackupAt == null
    ? nowMs - firstEntryAt >= FIRST_NUDGE_DAYS * DAY
    : nowMs - lastBackupAt >= NUDGE_EVERY_DAYS * DAY;
  return { show, days_since };
}

export function snoozeUntil(nowMs: number): number {
  return nowMs + SNOOZE_DAYS * DAY;
}
