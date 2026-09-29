import { setAllocations } from '../../db/moneyQueries';
import { addContribution, addGoal, deleteContribution, setGoalStatus, updateGoal } from '../../db/smartQueries';
import { splitContribution } from '../../engine/goals';
import type { SliceCreator } from './types';
import { previousAllocations } from './shared';

export const goalsActions: SliceCreator<'addGoal' | 'updateGoal' | 'contributeToGoal' | 'closeGoal'> = (set, get) => ({
  addGoal: async (db, goal) => {
    const id = await addGoal(db, goal);
    await get().load(db);
    return id;
  },

  updateGoal: async (db, id, goal) => {
    await updateGoal(db, id, goal);
    await get().load(db);
  },

  contributeToGoal: async (db, goalId, amount) => {
    const { picture, allBuckets } = get();
    const savings = picture.buckets.find((b) => b.role === 'savings');
    const { fromSavings } = splitContribution(amount, savings?.remaining_paise ?? 0, picture.unallocated_paise);
    const change = savings && fromSavings > 0 ? [{ id: savings.id, allocated_paise: savings.allocated_paise - fromSavings }] : [];
    const previous = previousAllocations(allBuckets, change);
    if (change.length) await setAllocations(db, change);
    const contributionId = await addContribution(db, goalId, amount);
    await get().load(db);
    return async () => {
      await deleteContribution(db, contributionId);
      if (previous.length) await setAllocations(db, previous);
      await get().load(db);
    };
  },

  closeGoal: async (db, goalId, status) => {
    const goal = get().goals.find((g) => g.id === goalId);
    if (!goal) throw new Error('Goal not found');
    const releaseId = goal.saved_paise !== 0 ? await addContribution(db, goalId, -goal.saved_paise) : null;
    await setGoalStatus(db, goalId, status);
    await get().load(db);
    return async () => {
      if (releaseId != null) await deleteContribution(db, releaseId);
      await setGoalStatus(db, goalId, 'active');
      await get().load(db);
    };
  },
});
