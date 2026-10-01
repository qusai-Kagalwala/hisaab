import { DEFAULT_FEATURES, readFeatures, suggestedFeatures } from '../features';

const none = { hasGoals: false, hasDebts: false, hasBuckets: false, hasRecurring: false, aiOn: false };

describe('features', () => {
  it('new users get the simple set: savings, bills, insights', () => {
    expect(DEFAULT_FEATURES).toEqual({ savings: true, bills: true, insights: true, goals: false, people: false, buckets: false, ai: false });
  });

  it('people updating the app keep what they already use', () => {
    expect(suggestedFeatures({ ...none, hasGoals: true, hasBuckets: true })).toMatchObject({ goals: true, buckets: true, people: false });
  });

  it('reads a saved choice; damaged or missing → suggestion, not chosen', () => {
    expect(readFeatures(JSON.stringify({ insights: false, goals: true }), none)).toEqual({
      features: { ...DEFAULT_FEATURES, insights: false, goals: true }, chosen: true,
    });
    expect(readFeatures(null, none)).toEqual({ features: DEFAULT_FEATURES, chosen: false });
    expect(readFeatures('{oops', none).chosen).toBe(false);
  });
});
