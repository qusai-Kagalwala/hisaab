import { Appearance, Platform } from 'react-native';
import { create } from 'zustand';
import type { ThemeMode } from '../db/snapshot';

interface ThemeState {
  mode: ThemeMode;
  apply: (mode: ThemeMode) => void;
}

/**
 * Light / Dark / follow the phone. Kept apart from the ledger store so the
 * palette hook stays cheap. On Android the override also reaches native
 * parts (status bar, keyboard, pickers).
 */
export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  apply: (mode) => {
    set({ mode });
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
    } catch {
      // Older runtimes: the in-app palette still follows the choice.
    }
  },
}));
