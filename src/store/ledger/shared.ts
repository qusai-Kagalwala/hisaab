import { type AllocationChange, type Bucket } from '../../engine/buckets';

/** Current allocations of the buckets touched by `changes`, for undo. */
export function previousAllocations(buckets: readonly Bucket[], changes: readonly AllocationChange[]): AllocationChange[] {
  return changes.map((c) => ({ id: c.id, allocated_paise: buckets.find((b) => b.id === c.id)?.allocated_paise ?? 0 }));
}
