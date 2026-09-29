/**
 * Widget logic with no native imports, so it's unit-tested like the rest.
 * The home-screen widget (Android, APK only) calls these from a background
 * task while the app is closed.
 */
import { bucketForCategory } from '../engine/buckets';
import { ADJUSTMENT_CATEGORY } from '../engine/defaults';
import { assertPaise, formatINR, type Paise } from '../engine/money';
import { getSetting, setSetting, addTransaction, undoNewTransaction, SETTING_LAST_ACCOUNT } from '../db/queries';
import { readSnapshot } from '../db/snapshot';
import type { Db } from '../db/types';

export const WIDGET_NAME = 'QuickLog';
export const SETTING_WIDGET_LAST = 'widget_last';
/** Undo on the widget stays available this long after a tap. */
export const WIDGET_UNDO_MS = 2 * 60 * 1000;
export const WIDGET_MAX_PICKS = 3;

export interface WidgetPick {
  category_id: number;
  amount_paise: Paise;
  icon: string;
  name: string;
}

export interface WidgetState {
  safe_per_day_paise: Paise;
  has_money: boolean;
  picks: WidgetPick[];
  /** Shown as "Saved ₹20 · Chai — Undo" right after a widget tap. */
  last_saved: { id: number; label: string } | null;
}

interface LastSaved {
  id: number;
  label: string;
  at: number;
}

async function readLast(db: Db): Promise<LastSaved | null> {
  const raw = await getSetting(db, SETTING_WIDGET_LAST);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LastSaved;
  } catch {
    return null;
  }
}

export async function widgetState(db: Db, nowMs: number): Promise<WidgetState> {
  const snap = await readSnapshot(db, nowMs);
  const last = await readLast(db);
  return {
    safe_per_day_paise: snap.safe.per_day_paise,
    has_money: snap.picture.total_paise > 0,
    picks: snap.quickPicks.slice(0, WIDGET_MAX_PICKS).flatMap((p) => {
      const c = snap.categories.find((x) => x.id === p.category_id);
      return c ? [{ category_id: c.id, amount_paise: p.amount_paise, icon: c.icon, name: c.name }] : [];
    }),
    last_saved: last && nowMs - last.at < WIDGET_UNDO_MS ? { id: last.id, label: last.label } : null,
  };
}

/**
 * One tap on a widget chip: log the expense exactly like the app would
 * (last-used account, bucket from the category) and remember it for Undo.
 */
export async function logFromWidget(
  db: Db,
  pick: { category_id: number; amount_paise: Paise },
  nowMs: number,
): Promise<number> {
  assertPaise(pick.amount_paise);
  if (pick.amount_paise <= 0) throw new Error('Amount must be greater than zero');
  const snap = await readSnapshot(db, nowMs);
  const category = snap.categories.find((c) => c.id === pick.category_id && c.kind === 'expense' && !c.hidden);
  if (!category || category.id === ADJUSTMENT_CATEGORY.id) throw new Error('Unknown category');
  if (snap.lastAccountId == null) throw new Error('No account');
  const id = await addTransaction(db, {
    type: 'expense',
    account_id: snap.lastAccountId,
    category_id: category.id,
    amount_paise: pick.amount_paise,
    bucket_id: bucketForCategory(snap.picture.buckets, category.id),
    created_at: nowMs,
  });
  await setSetting(db, SETTING_LAST_ACCOUNT, String(snap.lastAccountId));
  const last: LastSaved = { id, label: `Saved ${formatINR(pick.amount_paise)} · ${category.name}`, at: nowMs };
  await setSetting(db, SETTING_WIDGET_LAST, JSON.stringify(last));
  return id;
}

/** Undo the last widget tap (only within the window, and only if never edited). */
export async function undoFromWidget(db: Db, nowMs: number): Promise<boolean> {
  const last = await readLast(db);
  await setSetting(db, SETTING_WIDGET_LAST, '');
  if (!last || nowMs - last.at >= WIDGET_UNDO_MS) return false;
  return undoNewTransaction(db, last.id);
}
