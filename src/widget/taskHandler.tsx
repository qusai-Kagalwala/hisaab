/** Background task for widget events (runs even when the app is closed). */
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { migrate } from '../db/migrations';
import { DATABASE_NAME } from '../db/name';
import { EMPTY_WIDGET_STATE, logFromWidget, MONTH_WIDGET_NAME, monthWidgetState, undoFromWidget, widgetState } from './actions';
import { monthWidget } from './MonthWidget';
import { quickLogWidget } from './QuickLogWidget';

export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  const isMonth = widgetInfo.widgetName === MONTH_WIDGET_NAME;
  if (widgetAction === 'WIDGET_DELETED') return;
  // The widget gets its OWN connection. Without useNewConnection, expo-sqlite
  // hands back the app's connection, and when this task's handle is cleaned
  // up it closes that shared connection under the running app
  // ("NativeDatabase.execAsync rejected — NullPointerException").
  let db: SQLiteDatabase | null = null;
  try {
    db = await openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
    await migrate(db);
    if (widgetAction === 'WIDGET_CLICK') {
      try {
        if (clickAction === 'LOG' && clickActionData) {
          await logFromWidget(
            db,
            { category_id: Number(clickActionData.category_id), amount_paise: Number(clickActionData.amount_paise) },
            Date.now(),
          );
        } else if (clickAction === 'UNDO') {
          await undoFromWidget(db, Date.now());
        }
      } catch {
        // A bad tap never breaks the widget; it just re-renders.
      }
    }
    renderWidget(isMonth ? monthWidget(await monthWidgetState(db, Date.now())) : quickLogWidget(await widgetState(db, Date.now())));
  } catch {
    // Never leave "Problem loading widget": show a plain widget that still opens the app.
    renderWidget(
      isMonth
        ? monthWidget({ hidden: true, month_name: 'This month', spent_paise: 0, safe_per_day_paise: 0, has_money: false, bars: [], today: 0 })
        : quickLogWidget(EMPTY_WIDGET_STATE),
    );
  } finally {
    await db?.closeAsync().catch(() => undefined);
  }
}
