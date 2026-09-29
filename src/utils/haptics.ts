import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** A light tap on the phone when something is saved; silent where unsupported. */
export function savedTap(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
