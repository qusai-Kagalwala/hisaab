/**
 * Pick-your-features. Logging is always on; everything else can be shown or
 * hidden. Hiding never deletes data, and anything that needs the user's
 * answer (a bill to confirm, a repayment due) is always shown regardless.
 */
export type FeatureId = 'savings' | 'bills' | 'insights' | 'goals' | 'people' | 'buckets' | 'ai';
export type Features = Record<FeatureId, boolean>;

export interface FeatureInfo {
  id: FeatureId;
  title: string;
  description: string;
  icon: string;
  defaultOn: boolean;
}

export const FEATURES: readonly FeatureInfo[] = [
  { id: 'savings', title: 'Savings', description: 'Keep money aside so it never counts as spendable', icon: 'piggy-bank-outline', defaultOn: true },
  { id: 'bills', title: 'Bills & salary', description: 'Reminders like “Expected ₹X — received?”', icon: 'calendar-sync', defaultOn: true },
  { id: 'insights', title: 'Insights', description: 'Charts, % saved and where your money went', icon: 'chart-box-outline', defaultOn: true },
  { id: 'goals', title: 'Goals', description: 'Save up for something and see when you’ll get there', icon: 'flag-checkered', defaultOn: false },
  { id: 'people', title: 'Borrow & lend', description: 'Who owes whom, with no-interest repayment plans', icon: 'hand-coin-outline', defaultOn: false },
  { id: 'buckets', title: 'Buckets (advanced)', description: 'Plan the month in envelopes: Savings, Fun, Flexible…', icon: 'bucket-outline', defaultOn: false },
  { id: 'ai', title: 'AI assistant', description: 'Friendlier answers with your own free Google key. Optional', icon: 'robot-outline', defaultOn: false },
];

export const DEFAULT_FEATURES: Features = Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])) as Features;

export interface FeatureUsage {
  hasGoals: boolean;
  hasDebts: boolean;
  hasBuckets: boolean;
  hasRecurring: boolean;
  aiOn: boolean;
}

/** Defaults, plus anything the user already uses (for people updating the app). */
export function suggestedFeatures(usage: FeatureUsage): Features {
  return {
    ...DEFAULT_FEATURES,
    goals: DEFAULT_FEATURES.goals || usage.hasGoals,
    people: DEFAULT_FEATURES.people || usage.hasDebts,
    buckets: DEFAULT_FEATURES.buckets || usage.hasBuckets,
    bills: DEFAULT_FEATURES.bills || usage.hasRecurring,
    ai: DEFAULT_FEATURES.ai || usage.aiOn,
  };
}

/** Saved choice, or the suggestion when nothing was saved (or it's damaged). */
export function readFeatures(raw: string | null, usage: FeatureUsage): { features: Features; chosen: boolean } {
  const fallback = suggestedFeatures(usage);
  if (!raw) return { features: fallback, chosen: false };
  try {
    const saved = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const features = { ...fallback };
    for (const f of FEATURES) if (typeof saved[f.id] === 'boolean') features[f.id] = saved[f.id] as boolean;
    return { features, chosen: true };
  } catch {
    return { features: fallback, chosen: false };
  }
}
