/** App lock timing: lock again after this long in the background. */
export const LOCK_AFTER_MS = 60_000;

/**
 * Should the app ask to unlock now? Always at start (until unlocked once),
 * then again only after a minute or more in the background.
 */
export function shouldLock(
  enabled: boolean,
  unlockedOnce: boolean,
  backgroundSince: number | null,
  nowMs: number,
): boolean {
  if (!enabled) return false;
  if (!unlockedOnce) return true;
  return backgroundSince != null && nowMs - backgroundSince >= LOCK_AFTER_MS;
}
