import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { usePalette } from '../../components/theme';
import { Button } from '../../components/ui';
import { useLedgerStore } from '../../store/ledgerStore';
import { useLockStore } from '../../store/lockStore';
import { setScreenProtected, unlockWithDevice } from './deviceAuth';

/** Covers the app with an unlock screen when the app lock is on. */
export function LockGate({ children }: { children: ReactNode }) {
  const enabled = useLedgerStore((s) => s.security.appLock);
  const locked = useLockStore((s) => s.locked);
  const check = useLockStore((s) => s.check);
  const wentToBackground = useLockStore((s) => s.wentToBackground);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
    check(enabled, Date.now());
    void setScreenProtected(enabled);
  }, [enabled, check]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') wentToBackground(Date.now());
      else if (state === 'active') check(enabledRef.current, Date.now());
    });
    return () => sub.remove();
  }, [check, wentToBackground]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && <LockScreen />}
    </View>
  );
}

function LockScreen() {
  const p = usePalette();
  const unlock = useLockStore((s) => s.unlock);
  const [failed, setFailed] = useState(false);

  const tryUnlock = async () => {
    setFailed(false);
    if (await unlockWithDevice()) unlock();
    else setFailed(true);
  };

  // Ask once when the lock screen appears.
  useEffect(() => {
    void unlockWithDevice().then((ok) => (ok ? unlock() : setFailed(true)));
  }, [unlock]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: p.background }]} accessibilityViewIsModal>
      <Logo size={72} />
      <View style={[styles.shield, { backgroundColor: p.accentSoft }]}>
        <Icon name="shield-lock" size={36} color={p.accent} />
      </View>
      <Text style={[styles.title, { color: p.text }]}>Hisaab is locked</Text>
      <Text style={{ color: p.textMuted, textAlign: 'center' }}>Use your fingerprint, face or phone PIN to open it.</Text>
      {failed && <Text style={{ color: p.text, fontWeight: '600' }}>Not unlocked. Try again.</Text>}
      <Button label="Unlock" icon="fingerprint" onPress={tryUnlock} style={{ alignSelf: 'stretch', marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { zIndex: 1000, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  shield: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  title: { fontSize: 22, fontWeight: '800' },
});
