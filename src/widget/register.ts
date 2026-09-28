/**
 * Wires up the home-screen widget, but only when its native module exists
 * (the installed APK / dev build). In Expo Go and on web this is a no-op, so
 * the app never tries to load native code that isn't there.
 */
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import type { Db } from '../db/types';
import { setOnLedgerChanged } from '../store/ledgerStore';
import { WIDGET_NAME, widgetState } from './actions';

export function widgetsAvailable(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return TurboModuleRegistry.get('AndroidWidget') != null || NativeModules.AndroidWidget != null;
  } catch {
    return false;
  }
}

export function registerWidget(): void {
  if (!widgetsAvailable()) return;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const lib = require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { widgetTaskHandler } = require('./taskHandler') as typeof import('./taskHandler');
  const { quickLogWidget } = require('./QuickLogWidget') as typeof import('./QuickLogWidget');
  /* eslint-enable @typescript-eslint/no-require-imports */
  lib.registerWidgetTaskHandler(widgetTaskHandler);

  // Whenever the app's data changes, refresh any widgets on the home screen.
  setOnLedgerChanged((db: Db) => {
    void lib
      .requestWidgetUpdate({
        widgetName: WIDGET_NAME,
        renderWidget: async () => quickLogWidget(await widgetState(db, Date.now())),
      })
      .catch(() => undefined);
  });
}
