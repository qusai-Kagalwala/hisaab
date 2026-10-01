import { LOCK_AFTER_MS, shouldLock } from '../lock';

describe('shouldLock', () => {
  it('never locks when off', () => expect(shouldLock(false, false, null, 0)).toBe(false));
  it('locks at start until unlocked once', () => {
    expect(shouldLock(true, false, null, 5)).toBe(true);
    expect(shouldLock(true, true, null, 5)).toBe(false);
  });
  it('quick app switches stay unlocked; a minute away locks', () => {
    expect(shouldLock(true, true, 1_000, 1_000 + LOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldLock(true, true, 1_000, 1_000 + LOCK_AFTER_MS)).toBe(true);
  });
});
