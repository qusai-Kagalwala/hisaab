import { create } from 'zustand';

export const UNDO_WINDOW_MS = 5_000;

interface UndoToast {
  key: number;
  message: string;
  undo: () => Promise<void>;
}

interface UndoState {
  toast: UndoToast | null;
  show: (message: string, undo: () => Promise<void>) => void;
  dismiss: (key?: number) => void;
}

let nextKey = 1;

/** One undo toast at a time; a new one replaces the old (its undo lapses). */
export const useUndoStore = create<UndoState>((set, get) => ({
  toast: null,
  show: (message, undo) => set({ toast: { key: nextKey++, message, undo } }),
  dismiss: (key) => {
    const current = get().toast;
    if (current && (key === undefined || current.key === key)) set({ toast: null });
  },
}));
