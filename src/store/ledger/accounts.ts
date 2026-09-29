import { moveRecurringToAccount, setRecurringAccount } from '../../db/peopleQueries';
import { addAccount, addTransaction, addTransfer, renameAccount, setAccountArchived, undoNewTransaction } from '../../db/queries';
import { ADJUSTMENT_CATEGORY } from '../../engine/defaults';
import { balanceAdjustment } from '../../engine/ledger';
import type { SliceCreator } from './types';

export const accountsActions: SliceCreator<'addAccount' | 'renameAccount' | 'adjustBalance' | 'removeAccount' | 'restoreAccount' | 'transfer'> = (set, get) => ({
  addAccount: async (db, name, type) => {
    const id = await addAccount(db, name, type);
    await get().load(db);
    return id;
  },

  renameAccount: async (db, id, name) => {
    await renameAccount(db, id, name);
    await get().load(db);
  },

  adjustBalance: async (db, accountId, actual) => {
    const adjustment = balanceAdjustment(get().balances.get(accountId) ?? 0, actual);
    if (!adjustment) return null;
    const id = await addTransaction(db, {
      ...adjustment,
      account_id: accountId,
      category_id: ADJUSTMENT_CATEGORY.id,
      note: 'Balance update',
    });
    await get().load(db);
    return id;
  },

  removeAccount: async (db, id, moveTo) => {
    const { accounts, balances } = get();
    const account = accounts.find((a) => a.id === id);
    if (!account) throw new Error('Account not found');
    const others = accounts.filter((a) => a.id !== id);
    if (others.length === 0) throw new Error('Keep at least one account');
    if (moveTo != null && !others.some((a) => a.id === moveTo)) throw new Error('Pick another account');
    const balance = balances.get(id) ?? 0;
    let txId: number | null = null;
    if (balance !== 0 && moveTo != null) {
      txId = await addTransfer(db, {
        account_id: balance > 0 ? id : moveTo,
        to_account_id: balance > 0 ? moveTo : id,
        amount_paise: Math.abs(balance),
        note: `Moved when ${account.name} was removed`,
      });
    } else if (balance !== 0) {
      txId = await addTransaction(db, {
        ...balanceAdjustment(balance, 0)!,
        account_id: id,
        category_id: ADJUSTMENT_CATEGORY.id,
        note: 'Balance update',
      });
    }
    const movedRecurring = await moveRecurringToAccount(db, id, moveTo ?? others[0].id);
    await setAccountArchived(db, id, true);
    await get().load(db);
    return async () => {
      await setAccountArchived(db, id, false);
      await setRecurringAccount(db, movedRecurring, id);
      if (txId != null) await undoNewTransaction(db, txId);
      await get().load(db);
    };
  },

  restoreAccount: async (db, id) => {
    await setAccountArchived(db, id, false);
    await get().load(db);
  },

  transfer: async (db, fromId, toId, amount, note) => {
    const id = await addTransfer(db, { account_id: fromId, to_account_id: toId, amount_paise: amount, note });
    await get().load(db);
    return id;
  },
});
