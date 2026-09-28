/**
 * In-app voice entry (APK / dev build only). Uses on-device recognition when
 * the phone supports it. In Expo Go and on web the native module is missing,
 * so voiceAvailable() is false and the mic button is simply not shown —
 * the keyboard's own mic still works there.
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export function voiceAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return requireOptionalNativeModule('ExpoSpeechRecognition') != null;
  } catch {
    return false;
  }
}

/** Words the recogniser should expect (Indian spending vocabulary). */
const HINTS = ['chai', 'auto', 'sabzi', 'doodh', 'kiraya', 'rupees', 'rupaye', 'cash', 'UPI', 'hazaar', 'sau'];

export interface Listening {
  stop: () => void;
}

/**
 * Start listening. `onText` gets live text (final = true at the end).
 * Throws if permission is denied.
 */
export async function startListening(handlers: {
  onText: (text: string, final: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}): Promise<Listening> {
  // Loaded lazily so the module is never touched where it doesn't exist.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ExpoSpeechRecognitionModule: M } = require('expo-speech-recognition') as typeof import('expo-speech-recognition');
  const permission = await M.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Microphone permission was not given.');

  const subs = [
    M.addListener('result', (e) => handlers.onText(e.results[0]?.transcript ?? '', e.isFinal)),
    M.addListener('error', (e) => handlers.onError(e.message || 'Could not hear that.')),
    M.addListener('end', () => {
      subs.forEach((s) => s.remove());
      handlers.onEnd();
    }),
  ];
  M.start({
    lang: 'en-IN',
    interimResults: true,
    requiresOnDeviceRecognition: M.supportsOnDeviceRecognition(),
    addsPunctuation: false,
    contextualStrings: HINTS,
  });
  return {
    stop: () => {
      try {
        M.stop();
      } catch {
        // already stopped
      }
    },
  };
}
