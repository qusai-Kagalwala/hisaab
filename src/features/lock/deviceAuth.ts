/**
 * The phone's own lock (fingerprint, face or screen PIN/pattern). Hisaab
 * never keeps a password of its own, so it can never be forgotten.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

/** Can this phone verify the user at all (any screen lock set up)? */
export async function deviceLockAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function unlockWithDevice(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Hisaab',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // phone PIN/pattern works too
    });
    return result.success;
  } catch {
    return false;
  }
}

/** Blank in recent apps (and no screenshots) while the lock is on. Android uses FLAG_SECURE. */
export async function setScreenProtected(on: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (on) await ScreenCapture.preventScreenCaptureAsync('hisaab-lock');
    else await ScreenCapture.allowScreenCaptureAsync('hisaab-lock');
  } catch {
    // Not available on this device; the lock itself still works.
  }
}
