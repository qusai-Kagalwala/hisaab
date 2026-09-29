import { addDebt, addDebtPayment, undoNewDebt, updateDebtPlan } from '../../db/peopleQueries';
import { setSetting, SETTING_LAST_ACCOUNT } from '../../db/queries';
import type { SliceCreator } from './types';

export const peopleActions: SliceCreator<'recordDebt' | 'undoDebt' | 'settleDebt' | 'changeDebtPlan'> = (set, get) => ({
  recordDebt: async (db, debt) => {
    const ids = await addDebt(db, debt);
    await setSetting(db, SETTING_LAST_ACCOUNT, String(debt.account_id));
    await get().load(db);
    return ids;
  },

  undoDebt: async (db, debtId) => {
    const ok = await undoNewDebt(db, debtId);
    await get().load(db);
    return ok;
  },

  settleDebt: async (db, debt, amount, accountId) => {
    if (amount > debt.outstanding_paise) throw new Error('That is more than what is left');
    const id = await addDebtPayment(db, debt, amount, accountId);
    await get().load(db);
    return id;
  },

  changeDebtPlan: async (db, debt, plan, firstDue) => {
    await updateDebtPlan(db, debt.id, debt.principal_paise, plan, firstDue);
    await get().load(db);
  },
});
