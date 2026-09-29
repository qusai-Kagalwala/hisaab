import { backupNudge, snoozeUntil } from '../backupNudge';

const DAY = 86_400_000;
const now = 100 * DAY;

describe('backupNudge', () => {
  it('stays quiet with no entries or while snoozed', () => {
    expect(backupNudge({ nowMs: now, lastBackupAt: null, firstEntryAt: null, snoozedUntil: null }).show).toBe(false);
    expect(backupNudge({ nowMs: now, lastBackupAt: null, firstEntryAt: 0, snoozedUntil: snoozeUntil(now - DAY) }).show).toBe(false);
  });

  it('never backed up: after 7 days of use', () => {
    expect(backupNudge({ nowMs: now, lastBackupAt: null, firstEntryAt: now - 6 * DAY, snoozedUntil: null }).show).toBe(false);
    expect(backupNudge({ nowMs: now, lastBackupAt: null, firstEntryAt: now - 7 * DAY, snoozedUntil: null })).toEqual({ show: true, days_since: null });
  });

  it('backed up: again after 30 days', () => {
    expect(backupNudge({ nowMs: now, lastBackupAt: now - 29 * DAY, firstEntryAt: 0, snoozedUntil: null }).show).toBe(false);
    expect(backupNudge({ nowMs: now, lastBackupAt: now - 34 * DAY, firstEntryAt: 0, snoozedUntil: now - 1 })).toEqual({ show: true, days_since: 34 });
  });
});
