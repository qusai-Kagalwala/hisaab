import { addRecurring, confirmPending, reopenPending, setRecurringActive, skipPending, updateRecurring } from '../../db/moneyQueries';
import type { SliceCreator } from './types';

export const recurringActions: SliceCreator<'addRecurring' | 'updateRecurring' | 'setRecurringActive' | 'confirmPending' | 'skipPending' | 'reopenPending'> = (set, get) => ({
  addRecurring: async (db, input) => {
    await addRecurring(db, input);
    await get().load(db);
  },

  updateRecurring: async (db, id, input) => {
    await updateRecurring(db, id, input);
    await get().load(db);
  },

  setRecurringActive: async (db, id, active) => {
    await setRecurringActive(db, id, active);
    await get().load(db);
  },

  confirmPending: async (db, item, amount) => {
    await confirmPending(db, item, amount);
    await get().load(db);
  },

  skipPending: async (db, id) => {
    await skipPending(db, id);
    await get().load(db);
  },

  reopenPending: async (db, id) => {
    const ok = await reopenPending(db, id);
    await get().load(db);
    return ok;
  },
});
