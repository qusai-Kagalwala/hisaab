import { create } from 'zustand';
import { shouldLock } from '../engine/lock';

interface LockState {
  /** True while the unlock screen covers the app. */
  locked: boolean;
  unlockedOnce: boolean;
  /** When the app last went to the background. */
  backgroundSince: number | null;
  wentToBackground: (nowMs: number) => void;
  /** Called on start and whenever the app comes back to the front. */
  check: (enabled: boolean, nowMs: number) => void;
  unlock: () => void;
}

export const useLockStore = create<LockState>((set, get) => ({
  locked: false,
  unlockedOnce: false,
  backgroundSince: null,
  wentToBackground: (nowMs) => set({ backgroundSince: nowMs }),
  check: (enabled, nowMs) => {
    const { unlockedOnce, backgroundSince } = get();
    set({ locked: shouldLock(enabled, unlockedOnce, backgroundSince, nowMs) || (enabled && get().locked), backgroundSince: null });
  },
  unlock: () => set({ locked: false, unlockedOnce: true }),
}));
