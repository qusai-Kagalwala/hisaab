import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNDO_WINDOW_MS, useUndoStore } from '../store/undoStore';
import { usePalette } from './theme';

/** Global 5-second undo toast. Replaces confirmation dialogs everywhere. */
export function UndoToast() {
  const toast = useUndoStore((s) => s.toast);
  const dismiss = useUndoStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const p = usePalette();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const key = toast.key;
    const timer = setTimeout(() => dismiss(key), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  const onUndo = async () => {
    if (busy) return;
    setBusy(true);
    dismiss(toast.key);
    try {
      await toast.undo();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={[styles.toast, { backgroundColor: p.toast }]} accessibilityLiveRegion="polite">
        <Text style={[styles.message, { color: p.toastText }]} numberOfLines={1}>
          {toast.message}
        </Text>
        <Pressable onPress={onUndo} hitSlop={12} accessibilityRole="button" style={styles.undo}>
          <Text style={[styles.undoText, { color: p.toastText }]}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 52,
    maxWidth: 520,
    width: '100%',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  message: { flex: 1, fontSize: 15 },
  undo: { paddingHorizontal: 12, paddingVertical: 10 },
  undoText: { fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
});
