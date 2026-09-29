/** Background task for widget events (runs even when the app is closed). */
import { openDatabaseAsync } from 'expo-sqlite';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { migrate } from '../db/migrations';
import { DATABASE_NAME } from '../db/name';
import { logFromWidget, undoFromWidget, widgetState } from './actions';
import { quickLogWidget } from './QuickLogWidget';

export async function widgetTaskHandler({ widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') return;
  const db = await openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  const now = Date.now();
  if (widgetAction === 'WIDGET_CLICK') {
    try {
      if (clickAction === 'LOG' && clickActionData) {
        await logFromWidget(
          db,
          { category_id: Number(clickActionData.category_id), amount_paise: Number(clickActionData.amount_paise) },
          now,
        );
      } else if (clickAction === 'UNDO') {
        await undoFromWidget(db, now);
      }
    } catch {
      // A bad tap never breaks the widget; it just re-renders.
    }
  }
  renderWidget(quickLogWidget(await widgetState(db, Date.now())));
}
